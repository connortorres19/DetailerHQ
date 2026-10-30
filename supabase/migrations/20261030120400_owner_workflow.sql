-- DetailerHQ — Phase 1, migration 5: owner workflow functions (D-24, REC-25).
-- Implementations: app.*_impl — SECURITY DEFINER, search_path = '', unexposed schema,
-- explicit membership and account-state checks. API surface: public.* — thin
-- SECURITY INVOKER wrappers callable by `authenticated` through the Data API.
-- Lock order in every function: schedule resource -> booking request -> appointment.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create function app.require_uid() returns uuid
language plpgsql stable set search_path = ''
as $$
declare v uuid := (select auth.uid());
begin
  if v is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return v;
end
$$;

-- Raises not_found (never "forbidden") when the caller is not a member, so other
-- businesses' record ids are indistinguishable from ids that do not exist.
create function app.require_member(p_business_id uuid, p_write boolean default true) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app.require_uid();
  if p_business_id is null or not app.is_member(p_business_id) then
    raise exception 'not found' using errcode = 'DH003';
  end if;
  if p_write and not app.can_write(p_business_id) then
    raise exception 'account is read-only' using errcode = 'DH002';
  end if;
end
$$;

create function app.general_resource_id(p_business_id uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.schedule_resources
   where business_id = p_business_id and kind = 'general' and active
$$;

create function app.caller_business_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select business_id from public.memberships where user_id = (select auth.uid())
$$;

-- Services selected for a request or appointment, priced for one vehicle size class.
create function app.priced_services(p_business_id uuid, p_service_ids uuid[], p_size_class_id uuid, p_public boolean)
returns table (service_id uuid, name text, price_type public.price_type, price_cents integer,
               duration_min integer, is_addon boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare v_found integer;
begin
  if p_service_ids is null or cardinality(p_service_ids) = 0 or cardinality(p_service_ids) > 10 then
    raise exception 'choose between 1 and 10 services' using errcode = 'DH004';
  end if;
  if p_size_class_id is not null and not exists (
       select 1 from public.vehicle_size_classes
        where id = p_size_class_id and business_id = p_business_id and archived_at is null) then
    raise exception 'unknown vehicle size' using errcode = 'DH004';
  end if;

  select count(*) into v_found
    from public.services s
   where s.business_id = p_business_id and s.id = any (p_service_ids) and s.archived_at is null
     and (not p_public or s.is_bookable);
  if v_found <> cardinality(array(select distinct unnest(p_service_ids))) then
    raise exception 'unknown or unavailable service' using errcode = 'DH004';
  end if;
  if not exists (select 1 from public.services s
                  where s.business_id = p_business_id and s.id = any (p_service_ids) and not s.is_addon) then
    raise exception 'add-ons need a main service' using errcode = 'DH004';
  end if;

  return query
    select s.id, s.name, s.price_type,
           coalesce(sp.price_cents, s.base_price_cents, 0),
           coalesce(sp.duration_min, s.base_duration_min),
           s.is_addon
      from public.services s
      left join public.service_prices sp
        on sp.service_id = s.id and sp.business_id = s.business_id and sp.size_class_id = p_size_class_id
     where s.business_id = p_business_id and s.id = any (p_service_ids)
     order by s.is_addon, s.sort_order, s.name;
end
$$;

-- Links a request to a customer and that customer's vehicle, creating them from the
-- request snapshot when not supplied. Never merges automatically.
create function app.link_request_customer(p_request public.booking_requests, p_customer_id uuid, p_vehicle_id uuid)
returns table (customer_id uuid, vehicle_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_customer uuid := p_customer_id;
  v_vehicle uuid := p_vehicle_id;
begin
  if v_vehicle is not null and v_customer is null then
    raise exception 'choose the customer before the vehicle' using errcode = 'DH004';
  end if;

  if v_customer is null then
    insert into public.customers (business_id, first_name, last_name, phone_e164, email, preferred_contact,
                                  address_line1, city, state, postal_code, source)
    values (p_request.business_id, p_request.contact_first_name, p_request.contact_last_name,
            p_request.contact_phone_e164, p_request.contact_email, p_request.preferred_contact,
            p_request.service_address_line1, p_request.service_city, p_request.service_state,
            p_request.service_postal_code, 'booking_page')
    returning id into v_customer;
  elsif not exists (select 1 from public.customers c
                     where c.id = v_customer and c.business_id = p_request.business_id
                       and c.archived_at is null and c.anonymized_at is null) then
    raise exception 'customer not found' using errcode = 'DH003';
  end if;

  if v_vehicle is null then
    insert into public.vehicles (business_id, customer_id, year, make, model, color, size_class_id, notes)
    values (p_request.business_id, v_customer, p_request.vehicle_year, p_request.vehicle_make,
            p_request.vehicle_model, p_request.vehicle_color, p_request.vehicle_size_class_id,
            p_request.vehicle_notes)
    returning id into v_vehicle;
  elsif not exists (select 1 from public.vehicles v
                     where v.id = v_vehicle and v.business_id = p_request.business_id
                       and v.customer_id = v_customer and v.archived_at is null) then
    raise exception 'vehicle not found for this customer' using errcode = 'DH003';
  end if;

  update public.booking_requests r
     set customer_id = v_customer, vehicle_id = v_vehicle
   where r.id = p_request.id;
  return query select v_customer, v_vehicle;
end
$$;

-- Creates the appointment (and its capacity block, via trigger) for a request at a time.
create function app.appointment_from_request(p_request_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  r public.booking_requests;
  v_appointment uuid;
begin
  select * into r from public.booking_requests where id = p_request_id;
  delete from public.schedule_blocks where booking_request_id = r.id and kind in ('hold', 'proposal');

  insert into public.appointments (business_id, resource_id, customer_id, vehicle_id, booking_request_id,
                                   starts_at, ends_at, location_type, service_address_line1, service_city,
                                   service_state, service_postal_code, estimated_total_cents, created_by)
  values (r.business_id, app.general_resource_id(r.business_id), r.customer_id, r.vehicle_id, r.id,
          p_starts_at, p_ends_at, r.location_type, r.service_address_line1, r.service_city,
          r.service_state, r.service_postal_code, r.estimated_total_cents, (select auth.uid()))
  returning id into v_appointment;

  insert into public.appointment_items (business_id, appointment_id, service_id, name, estimated_price_cents, duration_min)
  select r.business_id, v_appointment, i.service_id, i.name, i.price_cents, i.duration_min
    from public.booking_request_items i
   where i.booking_request_id = r.id and i.business_id = r.business_id;

  return v_appointment;
end
$$;

-- Locks the business's capacity pool, then the request (lock order), and returns it.
create function app.lock_request(p_request_id uuid, p_write boolean default true)
returns public.booking_requests
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid;
  r public.booking_requests;
begin
  select business_id into v_business from public.booking_requests where id = p_request_id;
  perform app.require_member(v_business, p_write);
  perform app.lock_resource(app.general_resource_id(v_business));
  select * into r from public.booking_requests where id = p_request_id for update;
  return r;
end
$$;

create function app.lock_appointment(p_appointment_id uuid)
returns public.appointments
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_resource uuid;
  a public.appointments;
begin
  select business_id, resource_id into v_business, v_resource from public.appointments where id = p_appointment_id;
  perform app.require_member(v_business, true);
  perform app.lock_resource(v_resource);
  select * into a from public.appointments where id = p_appointment_id for update;
  return a;
end
$$;

-- ---------------------------------------------------------------------------
-- Business setup
-- ---------------------------------------------------------------------------
create function app.create_business_impl(
  p_name text, p_slug text, p_timezone text, p_service_mode public.service_mode,
  p_capacity integer default null, p_phone_e164 text default null, p_email text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := app.require_uid();
  v_business uuid;
  v_capacity integer;
begin
  if exists (select 1 from public.memberships where user_id = v_uid) then
    raise exception 'this account already has a business' using errcode = 'DH002';
  end if;

  -- D-26: mobile-only businesses default to one simultaneous job. Raising it is REC-17,
  -- which is not approved (open question Q-5), so it is rejected for now.
  if p_service_mode = 'mobile' then
    if p_capacity is not null and p_capacity <> 1 then
      raise exception 'mobile-only businesses work one job at a time' using errcode = 'DH004';
    end if;
    v_capacity := 1;
  else
    if p_capacity is null then
      raise exception 'capacity is required for businesses with a shop' using errcode = 'DH004';
    end if;
    v_capacity := p_capacity;
  end if;

  insert into public.businesses (name, slug, timezone, service_mode, phone_e164, email)
  values (p_name, p_slug, p_timezone, p_service_mode, p_phone_e164, p_email)
  returning id into v_business;

  insert into public.memberships (business_id, user_id, role) values (v_business, v_uid, 'owner');
  insert into public.booking_settings (business_id) values (v_business);
  insert into public.schedule_resources (business_id, kind, name, capacity)
  values (v_business, 'general', 'Jobs at the same time', v_capacity);
  insert into public.vehicle_size_classes (business_id, name, examples, sort_order) values
    (v_business, 'Car', 'Sedans, coupes, hatchbacks', 1),
    (v_business, 'Small SUV', 'e.g., RAV4, CR-V, Model Y', 2),
    (v_business, 'Large SUV / Truck', 'e.g., Tahoe, F-150, Tacoma', 3),
    (v_business, 'Van', 'e.g., Odyssey, Sienna, Transit', 4);

  perform app.activate_business_impl();
  return v_business;
end
$$;

-- Activation = email verified AND business created (D-14). In the pilot stage every
-- activated account is a pilot account; trial handling arrives in Phase 8.
create function app.activate_business_impl() returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := app.require_uid();
  v_business uuid := app.caller_business_id();
begin
  if v_business is null then
    raise exception 'not found' using errcode = 'DH003';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    return false;
  end if;
  update public.businesses
     set activated_at = coalesce(activated_at, now()),
         account_status = case when account_status = 'pending_activation' then 'pilot' else account_status end
   where id = v_business;
  return true;
end
$$;

create function app.set_capacity_impl(p_capacity integer) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid := app.caller_business_id();
  v_mode public.service_mode;
  v_resource uuid;
  v_current smallint;
  v_peak integer;
  v_first timestamptz;
begin
  perform app.require_member(v_business, true);
  select service_mode into v_mode from public.businesses where id = v_business;
  if p_capacity is null or p_capacity < 1 or p_capacity > 20 then
    raise exception 'capacity must be between 1 and 20' using errcode = 'DH004';
  end if;
  if v_mode = 'mobile' and p_capacity <> 1 then
    raise exception 'mobile-only businesses work one job at a time' using errcode = 'DH004';
  end if;

  v_resource := app.general_resource_id(v_business);
  v_current := app.lock_resource(v_resource);

  if p_capacity < v_current then
    -- REC-15: never silently overbook existing future reservations.
    with active as (
      select b.during from public.schedule_blocks b
       where b.resource_id = v_resource and upper(b.during) > now()
         and (b.kind = 'appointment' or b.expires_at > now())
    ),
    candidates as (
      select now() as t
      union select lower(a.during) from active a where lower(a.during) > now()
    ),
    usage as (
      select c.t, (select count(*) from active a where a.during @> c.t) as n from candidates c
    )
    select max(n), min(t) filter (where n > p_capacity) into v_peak, v_first from usage;
    if coalesce(v_peak, 0) > p_capacity then
      raise exception 'capacity_exceeded'
        using errcode = 'DH001',
              detail = format('existing bookings use %s jobs at once (first at %s)', v_peak, v_first);
    end if;
  end if;

  update public.schedule_resources set capacity = p_capacity where id = v_resource;
end
$$;

-- ---------------------------------------------------------------------------
-- Booking requests
-- ---------------------------------------------------------------------------
create function app.place_hold_impl(p_request_id uuid, p_hours integer default null) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  r public.booking_requests := app.lock_request(p_request_id);
  v_hours integer;
  v_expires timestamptz;
begin
  if r.status <> 'pending' then
    raise exception 'only pending requests can be held' using errcode = 'DH002';
  end if;
  select coalesce(p_hours, s.default_hold_hours) into v_hours from public.booking_settings s where s.business_id = r.business_id;
  if v_hours not between 2 and 72 then
    raise exception 'hold length must be 2 to 72 hours' using errcode = 'DH004';
  end if;
  v_expires := least(now() + make_interval(hours => v_hours), r.requested_start);
  if v_expires <= now() then
    raise exception 'the requested time has already started' using errcode = 'DH002';
  end if;

  delete from public.schedule_blocks where booking_request_id = r.id and kind = 'hold';
  insert into public.schedule_blocks (business_id, resource_id, kind, during, booking_request_id, expires_at, created_by)
  values (r.business_id, app.general_resource_id(r.business_id), 'hold',
          tstzrange(r.requested_start, r.requested_end, '[)'), r.id, v_expires, (select auth.uid()));

  insert into public.activity_events (business_id, booking_request_id, kind, actor_type, actor_user_id, metadata)
  values (r.business_id, r.id, 'hold_placed', 'owner', (select auth.uid()), jsonb_build_object('expires_at', v_expires));
  return v_expires;
end
$$;

create function app.release_hold_impl(p_request_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  r public.booking_requests := app.lock_request(p_request_id);
  v_deleted integer;
begin
  delete from public.schedule_blocks where booking_request_id = r.id and kind = 'hold';
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    insert into public.activity_events (business_id, booking_request_id, kind, actor_type, actor_user_id)
    values (r.business_id, r.id, 'hold_released', 'owner', (select auth.uid()));
  end if;
  return v_deleted > 0;
end
$$;

create function app.approve_request_impl(p_request_id uuid, p_customer_id uuid default null, p_vehicle_id uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  r public.booking_requests := app.lock_request(p_request_id);
  v_appointment uuid;
begin
  if r.status <> 'pending' then
    raise exception 'only pending requests can be approved' using errcode = 'DH002';
  end if;
  perform set_config('app.actor_type', 'owner', true);
  perform app.link_request_customer(r, p_customer_id, p_vehicle_id);
  v_appointment := app.appointment_from_request(r.id, r.requested_start, r.requested_end);
  update public.booking_requests
     set status = 'approved', decided_at = now(), decided_by = (select auth.uid())
   where id = r.id;
  return v_appointment;
end
$$;

create function app.propose_time_impl(
  p_request_id uuid, p_start timestamptz, p_message text default null, p_expires_hours integer default null,
  p_customer_id uuid default null, p_vehicle_id uuid default null
) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  r public.booking_requests := app.lock_request(p_request_id);
  s public.booking_settings;
  v_end timestamptz;
  v_expires timestamptz;
begin
  if r.status <> 'pending' then
    raise exception 'only pending requests can get a proposed time' using errcode = 'DH002';
  end if;
  select * into s from public.booking_settings where business_id = r.business_id;
  if p_start is null or p_start <= now() then
    raise exception 'proposed time must be in the future' using errcode = 'DH004';
  end if;
  if coalesce(p_expires_hours, s.proposal_expiry_hours) not between 2 and 72 then
    raise exception 'answer window must be 2 to 72 hours' using errcode = 'DH004';
  end if;
  v_end := p_start + (r.requested_end - r.requested_start);
  v_expires := least(now() + make_interval(hours => coalesce(p_expires_hours, s.proposal_expiry_hours)),
                     p_start - make_interval(mins => s.min_notice_min));
  if v_expires <= now() then
    raise exception 'proposed time is too soon for the customer to answer' using errcode = 'DH004';
  end if;

  perform set_config('app.actor_type', 'owner', true);
  perform app.link_request_customer(r, p_customer_id, p_vehicle_id);
  update public.booking_requests
     set status = 'time_proposed', proposed_start = p_start, proposed_end = v_end,
         proposal_message = p_message, proposal_expires_at = v_expires, decided_by = (select auth.uid())
   where id = r.id;
  insert into public.schedule_blocks (business_id, resource_id, kind, during, booking_request_id, expires_at, created_by)
  values (r.business_id, app.general_resource_id(r.business_id), 'proposal',
          tstzrange(p_start, v_end, '[)'), r.id, v_expires, (select auth.uid()));
  return v_expires;
end
$$;

create function app.retract_proposal_impl(p_request_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare r public.booking_requests := app.lock_request(p_request_id);
begin
  if r.status <> 'time_proposed' then
    raise exception 'request has no proposed time' using errcode = 'DH002';
  end if;
  perform set_config('app.actor_type', 'owner', true);
  update public.booking_requests
     set status = 'pending', proposed_start = null, proposed_end = null,
         proposal_message = null, proposal_expires_at = null
   where id = r.id;
end
$$;

create function app.decline_request_impl(p_request_id uuid, p_customer_message text default null, p_internal_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare r public.booking_requests := app.lock_request(p_request_id);
begin
  if r.status not in ('pending', 'time_proposed') then
    raise exception 'request is already closed' using errcode = 'DH002';
  end if;
  perform set_config('app.actor_type', 'owner', true);
  update public.booking_requests
     set status = 'declined', decline_message = p_customer_message, decline_reason = p_internal_reason,
         decided_at = now(), decided_by = (select auth.uid())
   where id = r.id;
end
$$;

create function app.close_duplicate_impl(p_request_id uuid, p_duplicate_of uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare r public.booking_requests := app.lock_request(p_request_id);
begin
  if r.status not in ('pending', 'time_proposed') then
    raise exception 'request is already closed' using errcode = 'DH002';
  end if;
  if p_duplicate_of = r.id or not exists (
       select 1 from public.booking_requests o where o.id = p_duplicate_of and o.business_id = r.business_id) then
    raise exception 'not found' using errcode = 'DH003';
  end if;
  perform set_config('app.actor_type', 'owner', true);
  update public.booking_requests
     set status = 'closed_duplicate', duplicate_of_id = p_duplicate_of, decided_at = now(), decided_by = (select auth.uid())
   where id = r.id;
end
$$;

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------
create function app.create_appointment_impl(
  p_customer_id uuid, p_vehicle_id uuid, p_starts_at timestamptz, p_service_ids uuid[],
  p_location_type public.location_type, p_service_address jsonb default null,
  p_duration_min integer default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_size_class uuid;
  v_duration integer;
  v_total integer;
  v_appointment uuid;
begin
  select v.business_id, v.size_class_id into v_business, v_size_class
    from public.vehicles v
   where v.id = p_vehicle_id and v.customer_id = p_customer_id and v.archived_at is null;
  perform app.require_member(v_business, true);
  perform app.lock_resource(app.general_resource_id(v_business));

  select coalesce(p_duration_min, sum(ps.duration_min))::integer, sum(ps.price_cents)::integer
    into v_duration, v_total
    from app.priced_services(v_business, p_service_ids, v_size_class, false) ps;

  perform set_config('app.actor_type', 'owner', true);
  insert into public.appointments (business_id, resource_id, customer_id, vehicle_id, starts_at, ends_at,
                                   location_type, service_address_line1, service_city, service_state,
                                   service_postal_code, estimated_total_cents, created_by)
  values (v_business, app.general_resource_id(v_business), p_customer_id, p_vehicle_id,
          p_starts_at, p_starts_at + make_interval(mins => v_duration), p_location_type,
          p_service_address ->> 'line1', p_service_address ->> 'city', p_service_address ->> 'state',
          p_service_address ->> 'postal_code', v_total, (select auth.uid()))
  returning id into v_appointment;

  insert into public.appointment_items (business_id, appointment_id, service_id, name, estimated_price_cents, duration_min)
  select v_business, v_appointment, ps.service_id, ps.name, ps.price_cents, ps.duration_min
    from app.priced_services(v_business, p_service_ids, v_size_class, false) ps;
  return v_appointment;
end
$$;

create function app.reschedule_appointment_impl(p_appointment_id uuid, p_starts_at timestamptz, p_duration_min integer default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare a public.appointments := app.lock_appointment(p_appointment_id);
begin
  if a.status <> 'scheduled' then
    raise exception 'only scheduled appointments can be rescheduled' using errcode = 'DH002';
  end if;
  if p_starts_at is null then
    raise exception 'new time is required' using errcode = 'DH004';
  end if;
  perform set_config('app.actor_type', 'owner', true);
  update public.appointments
     set starts_at = p_starts_at,
         ends_at = p_starts_at + coalesce(make_interval(mins => p_duration_min), a.ends_at - a.starts_at)
   where id = a.id;
end
$$;

create function app.set_appointment_status_impl(
  p_appointment_id uuid, p_status public.appointment_status,
  p_reason text default null, p_customer_message text default null,
  p_recorded_total_cents integer default null, p_payment_note public.payment_note default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare a public.appointments := app.lock_appointment(p_appointment_id);
begin
  perform set_config('app.actor_type', 'owner', true);
  update public.appointments
     set status = p_status,
         cancelled_by = case when p_status = 'cancelled' then 'business'::public.cancelled_by else cancelled_by end,
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
         cancel_reason = case when p_status = 'cancelled' then p_reason else cancel_reason end,
         customer_message = case when p_status = 'cancelled' then p_customer_message else customer_message end,
         completed_at = case when p_status = 'completed' then now()
                             when p_status = 'scheduled' then null else completed_at end,
         recorded_total_cents = case when p_status = 'completed'
                                     then coalesce(p_recorded_total_cents, a.estimated_total_cents)
                                     else recorded_total_cents end,
         payment_note = case when p_status = 'completed' then coalesce(p_payment_note, payment_note) else payment_note end
   where id = a.id;
end
$$;

-- ---------------------------------------------------------------------------
-- Public API surface for owners: SECURITY INVOKER wrappers (REC-25)
-- ---------------------------------------------------------------------------
create function public.create_business(p_name text, p_slug text, p_timezone text, p_service_mode public.service_mode,
  p_capacity integer default null, p_phone_e164 text default null, p_email text default null)
returns uuid language sql security invoker set search_path = ''
as $$ select app.create_business_impl(p_name, p_slug, p_timezone, p_service_mode, p_capacity, p_phone_e164, p_email) $$;

create function public.activate_business() returns boolean language sql security invoker set search_path = ''
as $$ select app.activate_business_impl() $$;

create function public.set_capacity(p_capacity integer) returns void language sql security invoker set search_path = ''
as $$ select app.set_capacity_impl(p_capacity) $$;

create function public.place_hold(p_request_id uuid, p_hours integer default null) returns timestamptz
language sql security invoker set search_path = ''
as $$ select app.place_hold_impl(p_request_id, p_hours) $$;

create function public.release_hold(p_request_id uuid) returns boolean language sql security invoker set search_path = ''
as $$ select app.release_hold_impl(p_request_id) $$;

create function public.approve_request(p_request_id uuid, p_customer_id uuid default null, p_vehicle_id uuid default null)
returns uuid language sql security invoker set search_path = ''
as $$ select app.approve_request_impl(p_request_id, p_customer_id, p_vehicle_id) $$;

create function public.propose_time(p_request_id uuid, p_start timestamptz, p_message text default null,
  p_expires_hours integer default null, p_customer_id uuid default null, p_vehicle_id uuid default null)
returns timestamptz language sql security invoker set search_path = ''
as $$ select app.propose_time_impl(p_request_id, p_start, p_message, p_expires_hours, p_customer_id, p_vehicle_id) $$;

create function public.retract_proposal(p_request_id uuid) returns void language sql security invoker set search_path = ''
as $$ select app.retract_proposal_impl(p_request_id) $$;

create function public.decline_request(p_request_id uuid, p_customer_message text default null, p_internal_reason text default null)
returns void language sql security invoker set search_path = ''
as $$ select app.decline_request_impl(p_request_id, p_customer_message, p_internal_reason) $$;

create function public.close_duplicate(p_request_id uuid, p_duplicate_of uuid) returns void
language sql security invoker set search_path = ''
as $$ select app.close_duplicate_impl(p_request_id, p_duplicate_of) $$;

create function public.create_appointment(p_customer_id uuid, p_vehicle_id uuid, p_starts_at timestamptz,
  p_service_ids uuid[], p_location_type public.location_type, p_service_address jsonb default null,
  p_duration_min integer default null)
returns uuid language sql security invoker set search_path = ''
as $$ select app.create_appointment_impl(p_customer_id, p_vehicle_id, p_starts_at, p_service_ids,
                                         p_location_type, p_service_address, p_duration_min) $$;

create function public.reschedule_appointment(p_appointment_id uuid, p_starts_at timestamptz, p_duration_min integer default null)
returns void language sql security invoker set search_path = ''
as $$ select app.reschedule_appointment_impl(p_appointment_id, p_starts_at, p_duration_min) $$;

create function public.start_appointment(p_appointment_id uuid) returns void language sql security invoker set search_path = ''
as $$ select app.set_appointment_status_impl(p_appointment_id, 'in_progress') $$;

create function public.complete_appointment(p_appointment_id uuid, p_recorded_total_cents integer default null,
  p_payment_note public.payment_note default null)
returns void language sql security invoker set search_path = ''
as $$ select app.set_appointment_status_impl(p_appointment_id, 'completed', null, null, p_recorded_total_cents, p_payment_note) $$;

create function public.cancel_appointment(p_appointment_id uuid, p_reason text default null, p_customer_message text default null)
returns void language sql security invoker set search_path = ''
as $$ select app.set_appointment_status_impl(p_appointment_id, 'cancelled', p_reason, p_customer_message) $$;

create function public.mark_no_show(p_appointment_id uuid) returns void language sql security invoker set search_path = ''
as $$ select app.set_appointment_status_impl(p_appointment_id, 'no_show') $$;

create function public.reopen_appointment(p_appointment_id uuid) returns void language sql security invoker set search_path = ''
as $$ select app.set_appointment_status_impl(p_appointment_id, 'scheduled') $$;

-- ---------------------------------------------------------------------------
-- Grants: wrappers and their implementations to `authenticated` only.
-- ---------------------------------------------------------------------------
grant execute on function
  public.create_business(text, text, text, public.service_mode, integer, text, text),
  public.activate_business(), public.set_capacity(integer),
  public.place_hold(uuid, integer), public.release_hold(uuid),
  public.approve_request(uuid, uuid, uuid),
  public.propose_time(uuid, timestamptz, text, integer, uuid, uuid),
  public.retract_proposal(uuid), public.decline_request(uuid, text, text), public.close_duplicate(uuid, uuid),
  public.create_appointment(uuid, uuid, timestamptz, uuid[], public.location_type, jsonb, integer),
  public.reschedule_appointment(uuid, timestamptz, integer),
  public.start_appointment(uuid), public.complete_appointment(uuid, integer, public.payment_note),
  public.cancel_appointment(uuid, text, text), public.mark_no_show(uuid), public.reopen_appointment(uuid)
to authenticated;

grant execute on function
  app.create_business_impl(text, text, text, public.service_mode, integer, text, text),
  app.activate_business_impl(), app.set_capacity_impl(integer),
  app.place_hold_impl(uuid, integer), app.release_hold_impl(uuid),
  app.approve_request_impl(uuid, uuid, uuid),
  app.propose_time_impl(uuid, timestamptz, text, integer, uuid, uuid),
  app.retract_proposal_impl(uuid), app.decline_request_impl(uuid, text, text), app.close_duplicate_impl(uuid, uuid),
  app.create_appointment_impl(uuid, uuid, timestamptz, uuid[], public.location_type, jsonb, integer),
  app.reschedule_appointment_impl(uuid, timestamptz, integer),
  app.set_appointment_status_impl(uuid, public.appointment_status, text, text, integer, public.payment_note)
to authenticated;
