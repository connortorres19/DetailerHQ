-- DetailerHQ — Phase 4E, migration 13: owner-created appointments.
-- Owners book phone, text, walk-in and in-person customers through the same availability engine,
-- pricing and capacity rules as the public page. Nothing is duplicated:
--   * the engine body (migration 11) now lives in app.time_problem(..., check_alignment); the public
--     check keeps alignment, owners skip it (a 1:15 PM hold must stay convertible);
--   * the slot loop is shared by the public listing and the new owner listing;
--   * one transaction creates any new customer/vehicle, converts a hold if given, prices the job
--     and inserts the appointment under the business's capacity lock.

-- ---------------------------------------------------------------------------
-- 1. Where an appointment came from.
-- ---------------------------------------------------------------------------
create type public.appointment_source as enum ('booking_page', 'phone', 'text', 'walk_in', 'in_person', 'other');
alter table public.appointments add column source public.appointment_source;
update public.appointments set source = (case when booking_request_id is not null then 'booking_page' else 'other' end)::public.appointment_source;
alter table public.appointments alter column source set not null;

-- Appointments from booking requests are always "booking page"; anything else defaults to other.
create function app.tg_appointment_source() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp
as $$
begin
  if new.booking_request_id is not null then
    new.source := 'booking_page';
  elsif new.source is null or new.source = 'booking_page' then
    new.source := 'other';
  end if;
  return new;
end
$$;
create trigger appointment_source before insert on public.appointments
  for each row execute function app.tg_appointment_source();

-- ---------------------------------------------------------------------------
-- 2. One availability engine. The body of migration 11's public_time_problem, unchanged except
--    that start-time alignment is optional.
-- ---------------------------------------------------------------------------
create function app.time_problem(p_business public.businesses, p_start timestamptz, p_end timestamptz, p_check_alignment boolean)
returns text
language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
declare
  s public.booking_settings;
  v_local_start timestamp := p_start at time zone p_business.timezone;
  v_local_end timestamp := p_end at time zone p_business.timezone;
  v_day date := (p_start at time zone p_business.timezone)::date;
  v_ends_midnight boolean := v_local_end = (v_day + 1)::timestamp;
  v_resource uuid := app.general_resource_id(p_business.id);
  v_capacity smallint;
  v_window_start time;
begin
  select * into s from public.booking_settings where business_id = p_business.id;
  if p_end <= p_start then return 'invalid range'; end if;
  if p_start < now() + make_interval(mins => s.min_notice_min) then return 'too soon'; end if;
  if p_start > now() + make_interval(days => s.horizon_days) then return 'too far ahead'; end if;
  if v_local_end::date <> v_day and not v_ends_midnight then return 'spans more than one day'; end if;

  select ar.start_time into v_window_start
    from public.availability_rules ar
   where ar.business_id = p_business.id
     and ar.weekday = extract(dow from v_local_start)
     and v_local_start::time >= ar.start_time
     and case when v_ends_midnight then ar.end_time = time '24:00' else v_local_end::time <= ar.end_time end
   limit 1;
  if v_window_start is null then return 'outside working hours'; end if;
  if p_check_alignment
     and (extract(epoch from (v_local_start::time - v_window_start)) / 60)::integer % s.slot_interval_min <> 0 then
    return 'not an offered start time';
  end if;

  if exists (select 1 from public.time_off t
              where t.business_id = p_business.id and t.during && tstzrange(p_start, p_end, '[)')) then
    return 'time off';
  end if;

  select capacity into v_capacity from public.schedule_resources where id = v_resource;
  if app.peak_usage(v_resource, tstzrange(p_start - make_interval(mins => s.buffer_min),
                                          p_end + make_interval(mins => s.buffer_min), '[)')) + 1 > v_capacity then
    return 'fully booked';
  end if;
  if s.max_jobs_per_day is not null
     and (select count(*) from public.schedule_blocks b
           where b.resource_id = v_resource
             and (b.kind = 'appointment' or b.expires_at > now())
             and b.during && tstzrange(v_day::timestamp at time zone p_business.timezone,
                                       (v_day + 1)::timestamp at time zone p_business.timezone, '[)')
             and (lower(b.during) at time zone p_business.timezone)::date = v_day) >= s.max_jobs_per_day then
    return 'daily limit reached';
  end if;
  return null;
end
$$;

create or replace function app.public_time_problem(p_business public.businesses, p_start timestamptz, p_end timestamptz)
returns text
language sql volatile security definer set search_path = pg_catalog, pg_temp
as $$ select app.time_problem(p_business, p_start, p_end, true) $$;

-- ---------------------------------------------------------------------------
-- 3. One slot loop: open start times for a job of p_duration minutes (migration 11's loop).
-- ---------------------------------------------------------------------------
create function app.slots_for(p_business public.businesses, p_duration integer, p_from date, p_days integer)
returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
declare
  s public.booking_settings;
  v_tz text := p_business.timezone;
  v_today date := (now() at time zone p_business.timezone)::date;
  v_day date;
  v_last date;
  v_days jsonb := '[]'::jsonb;
  v_slots jsonb;
  v_prev timestamptz;
  v_start timestamptz;
  v_offset integer;
  w record;
begin
  if p_days is null or p_days < 1 or p_days > 14 then
    raise exception 'invalid request' using errcode = 'DH004';
  end if;
  select * into s from public.booking_settings where business_id = p_business.id;

  v_day := greatest(coalesce(p_from, v_today), v_today);
  v_last := least(v_day + p_days - 1, ((now() + make_interval(days => s.horizon_days)) at time zone v_tz)::date);
  while v_day <= v_last loop
    v_slots := '[]'::jsonb;
    v_prev := null;
    for w in select ar.start_time, ar.end_time from public.availability_rules ar
              where ar.business_id = p_business.id and ar.weekday = extract(dow from v_day)
              order by ar.start_time loop
      v_offset := 0;
      while extract(epoch from w.start_time) / 60 + v_offset + p_duration <= extract(epoch from w.end_time) / 60 loop
        v_start := (v_day + w.start_time + make_interval(mins => v_offset)) at time zone v_tz;
        -- A local time skipped by a DST change maps onto the next real instant; list it once.
        if v_start is distinct from v_prev
           and app.public_time_problem(p_business, v_start, v_start + make_interval(mins => p_duration)) is null then
          v_slots := v_slots || to_jsonb(v_start);
        end if;
        v_prev := v_start;
        v_offset := v_offset + s.slot_interval_min;
      end loop;
    end loop;
    v_days := v_days || jsonb_build_object('date', v_day, 'slots', v_slots);
    v_day := v_day + 1;
  end loop;

  return jsonb_build_object(
    'duration_min', p_duration,
    'last_bookable_date', ((now() + make_interval(days => s.horizon_days)) at time zone v_tz)::date,
    'days', v_days);
end
$$;

-- The public listing (migration 11) now prices with the public rules and hands over to the loop.
create or replace function app.available_slots(p_business public.businesses, p_service_ids uuid[], p_size_class_id uuid,
                                               p_from date, p_days integer)
returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
declare v_duration integer;
begin
  select sum(ps.duration_min)::integer into v_duration
    from app.priced_services(p_business.id, p_service_ids, p_size_class_id, true) ps;
  return app.slots_for(p_business, v_duration, p_from, p_days);
end
$$;

-- Owners may book any active service with a set price (also ones not offered online). Quote-only
-- services have no saved price, so they can't be booked until quoted (a later phase).
create function app.owner_priced_services(p_business_id uuid, p_service_ids uuid[], p_size_class_id uuid)
returns table (service_id uuid, name text, price_type public.price_type, price_cents integer, duration_min integer, is_addon boolean)
language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if p_size_class_id is null then
    raise exception 'choose a vehicle size' using errcode = 'DH004';
  end if;
  if exists (select 1 from public.services s where s.business_id = p_business_id and s.id = any (p_service_ids)
              and s.price_type = 'quote_required') then
    raise exception 'quote-required services need a quote first' using errcode = 'DH004';
  end if;
  return query select * from app.priced_services(p_business_id, p_service_ids, p_size_class_id, false);
end
$$;

create function app.owner_available_slots_impl(p_service_ids uuid[], p_size_class_id uuid, p_from date, p_days integer)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  b public.businesses;
  v_duration integer;
begin
  perform app.require_member(v_business, false);
  select * into b from public.businesses where id = v_business;
  select sum(ps.duration_min)::integer into v_duration from app.owner_priced_services(v_business, p_service_ids, p_size_class_id) ps;
  return app.slots_for(b, v_duration, p_from, p_days);
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Create an appointment from the dashboard (optionally converting a calendar hold).
--    p_customer_id or p_customer {first_name, last_name, phone_e164, email}; p_vehicle_id or
--    p_vehicle {year, make, model, color, notes}; price and duration come from the saved prices
--    for p_size_class_id; the start time comes from the hold when p_hold_id is given.
-- ---------------------------------------------------------------------------
create function app.create_owner_appointment_impl(
  p_customer_id uuid, p_customer jsonb, p_vehicle_id uuid, p_vehicle jsonb, p_size_class_id uuid,
  p_service_ids uuid[], p_starts_at timestamptz, p_location_type public.location_type, p_address jsonb,
  p_source public.appointment_source, p_internal_notes text default null, p_hold_id uuid default null
) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  b public.businesses;
  v_resource uuid;
  v_hold public.schedule_blocks;
  v_customer uuid := p_customer_id;
  v_vehicle uuid := p_vehicle_id;
  v_start timestamptz := p_starts_at;
  v_duration integer;
  v_total integer;
  v_problem text;
  v_appointment uuid;
begin
  -- The Data API passes a JSON null as the jsonb value 'null', not SQL NULL: treat both as absent.
  p_customer := nullif(p_customer, 'null'::jsonb);
  p_vehicle := nullif(p_vehicle, 'null'::jsonb);
  p_address := nullif(p_address, 'null'::jsonb);
  perform app.require_member(v_business, true);
  select * into b from public.businesses where id = v_business;
  v_resource := app.general_resource_id(v_business);
  -- Serialise with every other booking for this business for the rest of the transaction.
  perform app.lock_resource(v_resource);

  if p_source is null or p_source = 'booking_page' then
    raise exception 'choose where the booking came from' using errcode = 'DH004';
  end if;
  if (p_customer_id is null) = (p_customer is null) or (p_vehicle_id is null) = (p_vehicle is null) then
    raise exception 'choose or add exactly one customer and one vehicle' using errcode = 'DH004';
  end if;
  if (b.service_mode = 'mobile' and p_location_type <> 'mobile') or (b.service_mode = 'shop' and p_location_type <> 'shop') then
    raise exception 'invalid location' using errcode = 'DH004';
  end if;
  if p_customer is not null and (jsonb_typeof(p_customer) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_customer) k where k <> all (array['first_name','last_name','phone_e164','email']))) then
    raise exception 'invalid customer' using errcode = 'DH004';
  end if;
  if p_vehicle is not null and (jsonb_typeof(p_vehicle) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_vehicle) k where k <> all (array['year','make','model','color','notes']))) then
    raise exception 'invalid vehicle' using errcode = 'DH004';
  end if;
  if p_address is not null and (jsonb_typeof(p_address) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_address) k where k <> all (array['line1','city','state','postal_code']))) then
    raise exception 'invalid address' using errcode = 'DH004';
  end if;

  -- Converting a hold: it must be this business's active calendar hold. It is removed inside this
  -- transaction while the capacity lock is held, so nobody else can take the time in between;
  -- any failure below rolls the removal back too.
  if p_hold_id is not null then
    select * into v_hold from public.schedule_blocks
     where id = p_hold_id and business_id = v_business and kind = 'hold' and booking_request_id is null
       for update;
    if v_hold.id is null then
      raise exception 'hold not found' using errcode = 'DH003';
    end if;
    if v_hold.expires_at <= now() then
      raise exception 'this hold has expired' using errcode = 'DH002';
    end if;
    v_start := lower(v_hold.during);
    delete from public.schedule_blocks where id = v_hold.id;
  end if;
  if v_start is null then
    raise exception 'choose a start time' using errcode = 'DH004';
  end if;

  -- Saved prices for the chosen size (never the browser's). Done first, so a size class or
  -- service from another business is refused before anything is written.
  select sum(ps.duration_min)::integer, sum(ps.price_cents)::integer into v_duration, v_total
    from app.owner_priced_services(v_business, p_service_ids, p_size_class_id) ps;

  -- Customer: an existing one of this business, or a new record (never merged).
  if v_customer is not null then
    if not exists (select 1 from public.customers c where c.id = v_customer and c.business_id = v_business
                    and c.archived_at is null and c.anonymized_at is null) then
      raise exception 'customer not found' using errcode = 'DH003';
    end if;
  else
    insert into public.customers (business_id, first_name, last_name, phone_e164, email, source)
    values (v_business, trim(p_customer ->> 'first_name'), nullif(trim(p_customer ->> 'last_name'), ''),
            nullif(p_customer ->> 'phone_e164', ''), nullif(lower(p_customer ->> 'email'), ''),
            case p_source when 'phone' then 'phone' when 'text' then 'text' when 'walk_in' then 'walk_in' else 'other' end::public.lead_source)
    returning id into v_customer;
  end if;

  -- Vehicle: one of this customer's, or a new one with the chosen size.
  if v_vehicle is not null then
    if not exists (select 1 from public.vehicles v where v.id = v_vehicle and v.business_id = v_business
                    and v.customer_id = v_customer and v.archived_at is null) then
      raise exception 'vehicle not found for this customer' using errcode = 'DH003';
    end if;
    update public.vehicles set size_class_id = p_size_class_id where id = v_vehicle and size_class_id is null;
  else
    insert into public.vehicles (business_id, customer_id, year, make, model, color, size_class_id, notes)
    values (v_business, v_customer, (p_vehicle ->> 'year')::smallint, trim(p_vehicle ->> 'make'), trim(p_vehicle ->> 'model'),
            nullif(trim(p_vehicle ->> 'color'), ''), p_size_class_id, nullif(trim(p_vehicle ->> 'notes'), ''))
    returning id into v_vehicle;
  end if;

  -- The same rules as the public page (hours, breaks, blocked time, notice, window, buffer,
  -- daily cap, capacity) except start-time alignment.
  v_problem := app.time_problem(b, v_start, v_start + make_interval(mins => v_duration), false);
  if v_problem is not null then
    raise exception 'time_unavailable' using errcode = 'DH004', detail = v_problem;
  end if;

  perform set_config('app.actor_type', 'owner', true);
  insert into public.appointments (business_id, resource_id, customer_id, vehicle_id, starts_at, ends_at, location_type,
                                   service_address_line1, service_city, service_state, service_postal_code,
                                   estimated_total_cents, internal_notes, source, created_by)
  values (v_business, v_resource, v_customer, v_vehicle, v_start, v_start + make_interval(mins => v_duration), p_location_type,
          case when p_location_type = 'mobile' then nullif(trim(p_address ->> 'line1'), '') end,
          case when p_location_type = 'mobile' then nullif(trim(p_address ->> 'city'), '') end,
          case when p_location_type = 'mobile' then nullif(upper(trim(p_address ->> 'state')), '') end,
          case when p_location_type = 'mobile' then nullif(trim(p_address ->> 'postal_code'), '') end,
          v_total, nullif(trim(p_internal_notes), ''), p_source, (select auth.uid()))
  returning id into v_appointment;

  insert into public.appointment_items (business_id, appointment_id, service_id, name, estimated_price_cents, duration_min)
  select v_business, v_appointment, ps.service_id, ps.name, ps.price_cents, ps.duration_min
    from app.owner_priced_services(v_business, p_service_ids, p_size_class_id) ps;

  insert into public.activity_events (business_id, appointment_id, kind, to_status, actor_type, actor_user_id, metadata)
  values (v_business, v_appointment, 'appointment_created', 'scheduled', 'owner', (select auth.uid()),
          jsonb_build_object('source', p_source, 'from_hold', p_hold_id is not null));
  return v_appointment;
exception
  when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then
    raise exception 'invalid details' using errcode = 'DH004';
end
$$;

create function public.create_owner_appointment(
  p_customer_id uuid, p_customer jsonb, p_vehicle_id uuid, p_vehicle jsonb, p_size_class_id uuid,
  p_service_ids uuid[], p_starts_at timestamptz, p_location_type public.location_type, p_address jsonb,
  p_source public.appointment_source, p_internal_notes text default null, p_hold_id uuid default null
) returns uuid
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.create_owner_appointment_impl(p_customer_id, p_customer, p_vehicle_id, p_vehicle, p_size_class_id,
                                               p_service_ids, p_starts_at, p_location_type, p_address, p_source,
                                               p_internal_notes, p_hold_id) $$;

create function public.owner_available_slots(p_service_ids uuid[], p_size_class_id uuid, p_from date, p_days integer)
returns jsonb language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.owner_available_slots_impl(p_service_ids, p_size_class_id, p_from, p_days) $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function
  app.tg_appointment_source(),
  app.time_problem(public.businesses, timestamptz, timestamptz, boolean),
  app.slots_for(public.businesses, integer, date, integer),
  app.owner_priced_services(uuid, uuid[], uuid),
  app.owner_available_slots_impl(uuid[], uuid, date, integer),
  app.create_owner_appointment_impl(uuid, jsonb, uuid, jsonb, uuid, uuid[], timestamptz, public.location_type, jsonb, public.appointment_source, text, uuid),
  public.create_owner_appointment(uuid, jsonb, uuid, jsonb, uuid, uuid[], timestamptz, public.location_type, jsonb, public.appointment_source, text, uuid),
  public.owner_available_slots(uuid[], uuid, date, integer)
from public, anon, authenticated, service_role;
grant execute on function
  app.owner_available_slots_impl(uuid[], uuid, date, integer),
  app.create_owner_appointment_impl(uuid, jsonb, uuid, jsonb, uuid, uuid[], timestamptz, public.location_type, jsonb, public.appointment_source, text, uuid),
  public.create_owner_appointment(uuid, jsonb, uuid, jsonb, uuid, uuid[], timestamptz, public.location_type, jsonb, public.appointment_source, text, uuid),
  public.owner_available_slots(uuid[], uuid, date, integer)
to authenticated;
