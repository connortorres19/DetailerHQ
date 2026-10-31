-- DetailerHQ — Phase 5, migration 14: leads and quotes.
-- Builds on the Phase 1 tables (leads, quotes, quote_items, activity_events.lead_id/quote_id,
-- appointments.quote_id, expire_stale) and the Phase 4 engine; no new tables.
--   1. Leads: vehicle details, requested service, internal notes, follow-up note, last contacted;
--      sources "website" and "social media". Owners keep editing leads directly under RLS;
--      a trigger records status changes in the activity history.
--   2. Quotes: internal notes, proposed appointment time, follow-up, a link nonce. Quote writes
--      and every decision now go through functions (owners keep read access): an owner — or a
--      bug — can no longer mark a quote "accepted" on the customer's behalf.
--   3. Customer quote link (public_api, token hash only, rate-limited, errors as results).
--   4. Converting an accepted quote into a booking: once, at a time the Phase 4 engine accepts,
--      under the capacity lock.

alter type public.lead_source add value if not exists 'website';
alter type public.lead_source add value if not exists 'social_media';
alter type public.quote_status add value if not exists 'converted';
alter type public.appointment_source add value if not exists 'quote';

-- ---------------------------------------------------------------------------
-- 1. Leads
-- ---------------------------------------------------------------------------
alter table public.leads
  add column vehicle_year smallint check (vehicle_year between 1900 and 2100),
  add column vehicle_make text check (char_length(vehicle_make) <= 40),
  add column vehicle_model text check (char_length(vehicle_model) <= 40),
  add column size_class_id uuid,
  add column service_id uuid,
  add column notes text check (char_length(notes) <= 2000),
  add column follow_up_note text check (char_length(follow_up_note) <= 300),
  add column last_contacted_at timestamptz,
  add foreign key (business_id, size_class_id) references public.vehicle_size_classes (business_id, id),
  add foreign key (business_id, service_id) references public.services (business_id, id);
create index leads_business_status_idx on public.leads (business_id, status, created_at desc);

-- History: creation and every status change (owner edits leads directly under RLS).
create function app.tg_lead_activity() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_events (business_id, lead_id, kind, to_status, actor_type, actor_user_id)
    values (new.business_id, new.id, 'lead_created', new.status::text,
            case when (select auth.uid()) is null then 'system' else 'owner' end::public.actor_type, (select auth.uid()));
  elsif old.status is distinct from new.status then
    insert into public.activity_events (business_id, lead_id, kind, from_status, to_status, actor_type, actor_user_id, metadata)
    values (new.business_id, new.id, 'lead_status_changed', old.status::text, new.status::text,
            coalesce(nullif(current_setting('app.actor_type', true), '')::public.actor_type,
                     case when (select auth.uid()) is null then 'system' else 'owner' end::public.actor_type),
            (select auth.uid()),
            case when new.status = 'lost' then jsonb_build_object('lost_reason', new.lost_reason) else '{}'::jsonb end);
  end if;
  return null;
end
$$;
create trigger lead_activity after insert or update of status on public.leads
  for each row execute function app.tg_lead_activity();

-- ---------------------------------------------------------------------------
-- 2. Quotes
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column internal_notes text check (char_length(internal_notes) <= 2000),
  add column proposed_start timestamptz,
  add column token_nonce uuid unique,
  add column next_follow_up_at timestamptz,
  add column follow_up_note text check (char_length(follow_up_note) <= 300),
  add check ((token_hash is null) = (token_nonce is null));
create index quotes_business_status_idx on public.quotes (business_id, status, created_at desc);
-- One booking per quote, ever (duplicate conversion is impossible even outside the function).
create unique index appointments_one_per_quote on public.appointments (business_id, quote_id) where quote_id is not null;

-- Transitions (migration 3 + Phase 5): sent quotes can be withdrawn back to draft; accepted ones
-- are converted to a booking. Amounts change only in drafts (prices are frozen once sent).
create or replace function app.tg_quote_guard() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp
as $$
begin
  if not (old.status = new.status
          or (old.status = 'draft' and new.status = 'sent')
          or (old.status = 'sent' and new.status in ('draft', 'accepted', 'declined', 'expired'))
          or (old.status = 'accepted' and new.status = 'converted')) then
    raise exception 'quote cannot move from % to %', old.status, new.status using errcode = 'DH002';
  end if;
  if old.status <> 'draft' and (new.subtotal_cents, new.discount_cents) is distinct from (old.subtotal_cents, old.discount_cents) then
    raise exception 'only draft quotes can change amounts' using errcode = 'DH002';
  end if;
  new.total_cents := new.subtotal_cents - new.discount_cents;
  return new;
end
$$;

create function app.tg_quote_activity() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if old.status is distinct from new.status then
    insert into public.activity_events (business_id, quote_id, lead_id, kind, from_status, to_status, actor_type, actor_user_id)
    values (new.business_id, new.id, new.lead_id, 'quote_status_changed', old.status::text, new.status::text,
            coalesce(nullif(current_setting('app.actor_type', true), '')::public.actor_type,
                     case when (select auth.uid()) is null then 'system' else 'owner' end::public.actor_type),
            (select auth.uid()));
  end if;
  return null;
end
$$;
create trigger quote_activity after update of status on public.quotes
  for each row execute function app.tg_quote_activity();

-- Owners read quotes and items; they write only through the functions below, plus the private
-- follow-up and internal-note fields, which never affect the customer or the price.
revoke insert, update, delete on public.quotes, public.quote_items from authenticated;
grant update (internal_notes, next_follow_up_at, follow_up_note) on public.quotes to authenticated;

-- Shared: a customer and vehicle for a lead or quote — existing ones of this business, or new
-- records (never merged). Returns (customer_id, vehicle_id); vehicle may stay null if not given.
create function app.owner_customer_vehicle(p_business uuid, p_customer_id uuid, p_customer jsonb, p_vehicle_id uuid, p_vehicle jsonb,
                                           p_source public.lead_source)
returns table (customer_id uuid, vehicle_id uuid)
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_customer uuid := p_customer_id;
  v_vehicle uuid := p_vehicle_id;
begin
  p_customer := nullif(p_customer, 'null'::jsonb);
  p_vehicle := nullif(p_vehicle, 'null'::jsonb);
  if (v_customer is null) = (p_customer is null) then
    raise exception 'choose or add a customer' using errcode = 'DH004';
  end if;
  if v_vehicle is not null and p_vehicle is not null then
    raise exception 'choose or add one vehicle' using errcode = 'DH004';
  end if;
  if p_customer is not null and (jsonb_typeof(p_customer) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_customer) k where k <> all (array['first_name','last_name','phone_e164','email']))) then
    raise exception 'invalid customer' using errcode = 'DH004';
  end if;
  if p_vehicle is not null and (jsonb_typeof(p_vehicle) <> 'object'
       or exists (select 1 from jsonb_object_keys(p_vehicle) k where k <> all (array['year','make','model','color','size_class_id']))) then
    raise exception 'invalid vehicle' using errcode = 'DH004';
  end if;

  if v_customer is not null then
    if not exists (select 1 from public.customers c where c.id = v_customer and c.business_id = p_business
                    and c.archived_at is null and c.anonymized_at is null) then
      raise exception 'customer not found' using errcode = 'DH003';
    end if;
  else
    insert into public.customers (business_id, first_name, last_name, phone_e164, email, source)
    values (p_business, trim(p_customer ->> 'first_name'), nullif(trim(p_customer ->> 'last_name'), ''),
            nullif(p_customer ->> 'phone_e164', ''), nullif(lower(p_customer ->> 'email'), ''), p_source)
    returning id into v_customer;
  end if;

  if v_vehicle is not null then
    if not exists (select 1 from public.vehicles v where v.id = v_vehicle and v.business_id = p_business
                    and v.customer_id = v_customer and v.archived_at is null) then
      raise exception 'vehicle not found for this customer' using errcode = 'DH003';
    end if;
  elsif p_vehicle is not null then
    insert into public.vehicles (business_id, customer_id, year, make, model, color, size_class_id)
    values (p_business, v_customer, (p_vehicle ->> 'year')::smallint, trim(p_vehicle ->> 'make'), trim(p_vehicle ->> 'model'),
            nullif(trim(p_vehicle ->> 'color'), ''), nullif(p_vehicle ->> 'size_class_id', '')::uuid)
    returning id into v_vehicle;
  end if;
  return query select v_customer, v_vehicle;
end
$$;

-- Create or update a draft quote with its items in one transaction. p_quote: {lead_id,
-- valid_until, notes, terms, internal_notes, discount_cents, proposed_start}; customer/vehicle as
-- in owner_customer_vehicle; p_items: [{service_id?, name, description?, quantity, price_cents,
-- duration_min?}]. Prices are what the owner quotes and are stored on the items, so later catalog
-- changes never alter this quote.
create function app.save_quote_impl(p_quote_id uuid, p_quote jsonb, p_customer_id uuid, p_customer jsonb,
                                    p_vehicle_id uuid, p_vehicle jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  q public.quotes;
  v_lead public.leads;
  v_customer uuid;
  v_vehicle uuid;
  v_discount integer;
  v_subtotal integer;
begin
  perform app.require_member(v_business, true);
  p_quote := coalesce(nullif(p_quote, 'null'::jsonb), '{}'::jsonb);
  if jsonb_typeof(p_quote) <> 'object' or exists (select 1 from jsonb_object_keys(p_quote) k
       where k <> all (array['lead_id','valid_until','notes','terms','internal_notes','discount_cents','proposed_start'])) then
    raise exception 'invalid quote' using errcode = 'DH004';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50
     or exists (select 1 from jsonb_array_elements(p_items) e
                 where jsonb_typeof(e) <> 'object'
                    or exists (select 1 from jsonb_object_keys(e) k where k <> all (array['service_id','name','description','quantity','price_cents','duration_min']))) then
    raise exception 'add between 1 and 50 line items' using errcode = 'DH004';
  end if;
  v_discount := coalesce((p_quote ->> 'discount_cents')::integer, 0);
  if v_discount < 0 then
    raise exception 'discount cannot be negative' using errcode = 'DH004';
  end if;

  if p_quote_id is not null then
    select * into q from public.quotes where id = p_quote_id and business_id = v_business for update;
    if q.id is null then
      raise exception 'quote not found' using errcode = 'DH003';
    end if;
    if q.status <> 'draft' then
      raise exception 'only draft quotes can be edited' using errcode = 'DH002';
    end if;
  end if;

  if p_quote ->> 'lead_id' is not null then
    select * into v_lead from public.leads where id = (p_quote ->> 'lead_id')::uuid and business_id = v_business;
    if v_lead.id is null then
      raise exception 'lead not found' using errcode = 'DH003';
    end if;
  end if;

  select cv.customer_id, cv.vehicle_id into v_customer, v_vehicle
    from app.owner_customer_vehicle(v_business, p_customer_id, p_customer, p_vehicle_id, p_vehicle, coalesce(v_lead.source, 'other')) cv;
  if v_vehicle is null then
    raise exception 'choose or add a vehicle' using errcode = 'DH004';
  end if;
  -- The lead now points at the customer (and vehicle) the quote is for.
  if v_lead.id is not null and v_lead.customer_id is null then
    update public.leads set customer_id = v_customer, vehicle_id = v_vehicle where id = v_lead.id;
  end if;

  if q.id is null then
    insert into public.quotes (business_id, lead_id, customer_id, vehicle_id)
    values (v_business, v_lead.id, v_customer, v_vehicle) returning * into q;
  end if;

  -- Items: replace the set (zero the discount first so a smaller subtotal never trips the total check).
  update public.quotes set discount_cents = 0 where id = q.id;
  delete from public.quote_items where quote_id = q.id and business_id = v_business;
  insert into public.quote_items (business_id, quote_id, service_id, name, description, quantity, price_cents, duration_min)
  select v_business, q.id, nullif(e ->> 'service_id', '')::uuid, trim(e ->> 'name'), nullif(trim(e ->> 'description'), ''),
         (e ->> 'quantity')::integer, (e ->> 'price_cents')::integer, nullif(e ->> 'duration_min', '')::integer
    from jsonb_array_elements(p_items) e;
  select subtotal_cents into v_subtotal from public.quotes where id = q.id;
  if v_discount > v_subtotal then
    raise exception 'discount is more than the subtotal' using errcode = 'DH004';
  end if;

  update public.quotes
     set lead_id = v_lead.id, customer_id = v_customer, vehicle_id = v_vehicle,
         vehicle_text = (select concat_ws(' ', v.year::text, v.make, v.model) from public.vehicles v where v.id = v_vehicle),
         valid_until = (p_quote ->> 'valid_until')::date,
         notes = nullif(trim(p_quote ->> 'notes'), ''), terms = nullif(trim(p_quote ->> 'terms'), ''),
         internal_notes = nullif(trim(p_quote ->> 'internal_notes'), ''),
         proposed_start = (p_quote ->> 'proposed_start')::timestamptz,
         discount_cents = v_discount
   where id = q.id;
  return q.id;
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range
       or check_violation or not_null_violation then
    raise exception 'invalid details' using errcode = 'DH004';
  when foreign_key_violation then
    raise exception 'unknown service or vehicle size' using errcode = 'DH004';
end
$$;

-- Send: freeze the quote and issue its link. The server makes the link from a random nonce and
-- its own secret and passes only the nonce and the SHA-256 of the link token; the database can't
-- produce a working link on its own. Sending again returns the existing link (no new token).
create function app.send_quote_impl(p_quote_id uuid, p_token_nonce uuid, p_token_hash bytea) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  q public.quotes;
  v_today date;
begin
  perform app.require_member(v_business, true);
  select * into q from public.quotes where id = p_quote_id and business_id = v_business for update;
  if q.id is null then
    raise exception 'quote not found' using errcode = 'DH003';
  end if;
  if q.status = 'sent' then
    return q.token_nonce;
  end if;
  if q.status <> 'draft' then
    raise exception 'only draft quotes can be sent' using errcode = 'DH002';
  end if;
  select (now() at time zone b.timezone)::date into v_today from public.businesses b where b.id = v_business;
  if q.valid_until is null or q.valid_until < v_today then
    raise exception 'set an expiry date from today on' using errcode = 'DH004', detail = 'valid_until';
  end if;
  if not exists (select 1 from public.quote_items i where i.quote_id = q.id and i.business_id = v_business) then
    raise exception 'add at least one line item' using errcode = 'DH004';
  end if;
  if p_token_nonce is null or p_token_hash is null or octet_length(p_token_hash) <> 32 then
    raise exception 'invalid link' using errcode = 'DH004';
  end if;
  perform set_config('app.actor_type', 'owner', true);
  update public.quotes set status = 'sent', sent_at = now(), decided_at = null, token_nonce = p_token_nonce, token_hash = p_token_hash
   where id = q.id;
  update public.leads set status = 'quote_sent' where id = q.lead_id and business_id = v_business and status in ('new', 'contacted');
  return p_token_nonce;
end
$$;

-- Withdraw a sent quote back to draft: the link stops working immediately.
create function app.withdraw_quote_impl(p_quote_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  q public.quotes;
begin
  perform app.require_member(v_business, true);
  select * into q from public.quotes where id = p_quote_id and business_id = v_business for update;
  if q.id is null then
    raise exception 'quote not found' using errcode = 'DH003';
  end if;
  if q.status <> 'sent' then
    raise exception 'only sent quotes can be withdrawn' using errcode = 'DH002';
  end if;
  perform set_config('app.actor_type', 'owner', true);
  update public.quotes set status = 'draft', token_hash = null, token_nonce = null where id = q.id;
end
$$;

create function app.delete_quote_impl(p_quote_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_business uuid := app.caller_business_id();
begin
  perform app.require_member(v_business, true);
  delete from public.quotes where id = p_quote_id and business_id = v_business and status = 'draft';
  if not found then
    raise exception 'only draft quotes can be deleted' using errcode = 'DH002';
  end if;
end
$$;

-- Convert an accepted quote into a booking — once. The quoted work and prices carry over; the time
-- must pass the Phase 4 engine (owner rules: hours, breaks, blocked time, notice, window, buffer,
-- daily cap, capacity) under the capacity lock; the capacity trigger checks the insert again.
create function app.convert_quote_impl(p_quote_id uuid, p_starts_at timestamptz, p_location_type public.location_type,
                                       p_address jsonb, p_duration_min integer default null)
returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  b public.businesses;
  q public.quotes;
  v_resource uuid;
  v_duration integer;
  v_problem text;
  v_appointment uuid;
begin
  perform app.require_member(v_business, true);
  select * into b from public.businesses where id = v_business;
  v_resource := app.general_resource_id(v_business);
  perform app.lock_resource(v_resource);
  select * into q from public.quotes where id = p_quote_id and business_id = v_business for update;
  if q.id is null then
    raise exception 'quote not found' using errcode = 'DH003';
  end if;
  if q.status = 'converted' then
    raise exception 'this quote is already booked' using errcode = 'DH002';
  end if;
  if q.status <> 'accepted' then
    raise exception 'only accepted quotes can be booked' using errcode = 'DH002';
  end if;
  if q.customer_id is null or q.vehicle_id is null then
    raise exception 'the quote needs a customer and vehicle' using errcode = 'DH004';
  end if;
  p_address := nullif(p_address, 'null'::jsonb);
  if (b.service_mode = 'mobile' and p_location_type <> 'mobile') or (b.service_mode = 'shop' and p_location_type <> 'shop') then
    raise exception 'invalid location' using errcode = 'DH004';
  end if;
  if p_starts_at is null then
    raise exception 'choose a start time' using errcode = 'DH004';
  end if;

  v_duration := coalesce(p_duration_min,
                         (select sum(coalesce(i.duration_min, 0) * i.quantity)::integer from public.quote_items i
                           where i.quote_id = q.id and i.business_id = v_business));
  if v_duration is null or v_duration not between 15 and 4320 then
    raise exception 'set how long the job takes (15 minutes to 72 hours)' using errcode = 'DH004', detail = 'duration';
  end if;
  v_problem := app.time_problem(b, p_starts_at, p_starts_at + make_interval(mins => v_duration), false);
  if v_problem is not null then
    raise exception 'time_unavailable' using errcode = 'DH004', detail = v_problem;
  end if;

  perform set_config('app.actor_type', 'owner', true);
  insert into public.appointments (business_id, resource_id, customer_id, vehicle_id, quote_id, lead_id, starts_at, ends_at,
                                   location_type, service_address_line1, service_city, service_state, service_postal_code,
                                   estimated_total_cents, internal_notes, source, created_by)
  values (v_business, v_resource, q.customer_id, q.vehicle_id, q.id, q.lead_id, p_starts_at, p_starts_at + make_interval(mins => v_duration),
          p_location_type,
          case when p_location_type = 'mobile' then nullif(trim(p_address ->> 'line1'), '') end,
          case when p_location_type = 'mobile' then nullif(trim(p_address ->> 'city'), '') end,
          case when p_location_type = 'mobile' then nullif(upper(trim(p_address ->> 'state')), '') end,
          case when p_location_type = 'mobile' then nullif(trim(p_address ->> 'postal_code'), '') end,
          q.total_cents, q.internal_notes, 'quote', (select auth.uid()))
  returning id into v_appointment;

  insert into public.appointment_items (business_id, appointment_id, service_id, name, quantity, estimated_price_cents, duration_min)
  select v_business, v_appointment, i.service_id, i.name, i.quantity, i.price_cents, coalesce(i.duration_min, 0) * i.quantity
    from public.quote_items i where i.quote_id = q.id and i.business_id = v_business;

  update public.quotes set status = 'converted' where id = q.id;
  update public.leads set status = 'booked' where id = q.lead_id and business_id = v_business and status <> 'lost';
  insert into public.activity_events (business_id, appointment_id, quote_id, kind, to_status, actor_type, actor_user_id, metadata)
  values (v_business, v_appointment, q.id, 'appointment_created', 'scheduled', 'owner', (select auth.uid()),
          jsonb_build_object('source', 'quote', 'quote_number', q.number));
  return v_appointment;
exception
  when check_violation or not_null_violation then
    raise exception 'invalid details' using errcode = 'DH004';
end
$$;

-- ---------------------------------------------------------------------------
-- Leads: contact log, follow-ups, converting to a customer
-- ---------------------------------------------------------------------------
create function app.log_lead_activity_impl(p_lead_id uuid, p_kind text, p_note text default null, p_channel text default null)
returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  l public.leads;
begin
  perform app.require_member(v_business, true);
  select * into l from public.leads where id = p_lead_id and business_id = v_business for update;
  if l.id is null then
    raise exception 'lead not found' using errcode = 'DH003';
  end if;
  if p_kind not in ('note', 'contacted') or char_length(p_note) > 1000
     or (p_kind = 'note' and nullif(trim(p_note), '') is null)
     or (p_channel is not null and p_channel not in ('phone', 'text', 'email', 'in_person', 'other')) then
    raise exception 'invalid activity' using errcode = 'DH004';
  end if;
  insert into public.activity_events (business_id, lead_id, kind, actor_type, actor_user_id, metadata)
  values (v_business, l.id, case p_kind when 'note' then 'lead_note' else 'lead_contacted' end, 'owner', (select auth.uid()),
          jsonb_strip_nulls(jsonb_build_object('note', nullif(trim(p_note), ''), 'channel', p_channel)));
  if p_kind = 'contacted' then
    update public.leads set last_contacted_at = now(), status = case when status = 'new' then 'contacted' else status end
     where id = l.id;
  end if;
end
$$;

-- Mark a lead's or a quote's follow-up done (clears it and records it in the history).
create function app.complete_follow_up_impl(p_lead_id uuid, p_quote_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  v_found integer;
begin
  perform app.require_member(v_business, true);
  if (p_lead_id is null) = (p_quote_id is null) or char_length(p_note) > 300 then
    raise exception 'invalid follow-up' using errcode = 'DH004';
  end if;
  if p_lead_id is not null then
    update public.leads set next_follow_up_at = null, follow_up_note = null
     where id = p_lead_id and business_id = v_business and next_follow_up_at is not null;
  else
    update public.quotes set next_follow_up_at = null, follow_up_note = null
     where id = p_quote_id and business_id = v_business and next_follow_up_at is not null;
  end if;
  get diagnostics v_found = row_count;
  if v_found = 0 then
    raise exception 'there is no follow-up to complete' using errcode = 'DH002';
  end if;
  insert into public.activity_events (business_id, lead_id, quote_id, kind, actor_type, actor_user_id, metadata)
  values (v_business, p_lead_id, p_quote_id, 'follow_up_done', 'owner', (select auth.uid()),
          jsonb_strip_nulls(jsonb_build_object('note', nullif(trim(p_note), ''))));
end
$$;

-- Turn a lead into a customer record (or link an existing one), with its vehicle when known.
create function app.convert_lead_to_customer_impl(p_lead_id uuid, p_customer_id uuid default null) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  l public.leads;
  v_customer uuid;
  v_vehicle uuid;
begin
  perform app.require_member(v_business, true);
  select * into l from public.leads where id = p_lead_id and business_id = v_business for update;
  if l.id is null then
    raise exception 'lead not found' using errcode = 'DH003';
  end if;
  if l.customer_id is not null then
    return l.customer_id;
  end if;
  select cv.customer_id, cv.vehicle_id into v_customer, v_vehicle
    from app.owner_customer_vehicle(
      v_business, p_customer_id,
      case when p_customer_id is null then jsonb_build_object('first_name', l.contact_first_name, 'last_name', l.contact_last_name,
                                                              'phone_e164', l.contact_phone_e164, 'email', l.contact_email) end,
      null,
      case when l.vehicle_make is not null and l.vehicle_model is not null then
        jsonb_build_object('year', l.vehicle_year, 'make', l.vehicle_make, 'model', l.vehicle_model, 'size_class_id', l.size_class_id) end,
      l.source) cv;
  update public.leads set customer_id = v_customer, vehicle_id = v_vehicle where id = l.id;
  insert into public.activity_events (business_id, lead_id, kind, actor_type, actor_user_id, metadata)
  values (v_business, l.id, 'lead_customer_linked', 'owner', (select auth.uid()),
          jsonb_build_object('customer_id', v_customer, 'new_customer', p_customer_id is null));
  return v_customer;
end
$$;

-- Owner slot listing for a job of a given length (quote conversions: items may be custom work).
create function app.owner_slots_for_duration_impl(p_duration_min integer, p_from date, p_days integer) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  b public.businesses;
begin
  perform app.require_member(v_business, false);
  if p_duration_min is null or p_duration_min not between 15 and 4320 then
    raise exception 'set how long the job takes (15 minutes to 72 hours)' using errcode = 'DH004';
  end if;
  select * into b from public.businesses where id = v_business;
  return app.slots_for(b, p_duration_min, p_from, p_days);
end
$$;

-- Invoker wrappers.
create function public.save_quote(p_quote_id uuid, p_quote jsonb, p_customer_id uuid, p_customer jsonb, p_vehicle_id uuid,
                                  p_vehicle jsonb, p_items jsonb) returns uuid
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.save_quote_impl(p_quote_id, p_quote, p_customer_id, p_customer, p_vehicle_id, p_vehicle, p_items) $$;
create function public.send_quote(p_quote_id uuid, p_token_nonce uuid, p_token_hash bytea) returns uuid
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.send_quote_impl(p_quote_id, p_token_nonce, p_token_hash) $$;
create function public.withdraw_quote(p_quote_id uuid) returns void
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.withdraw_quote_impl(p_quote_id) $$;
create function public.delete_quote(p_quote_id uuid) returns void
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.delete_quote_impl(p_quote_id) $$;
create function public.convert_quote(p_quote_id uuid, p_starts_at timestamptz, p_location_type public.location_type, p_address jsonb,
                                     p_duration_min integer default null) returns uuid
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.convert_quote_impl(p_quote_id, p_starts_at, p_location_type, p_address, p_duration_min) $$;
create function public.log_lead_activity(p_lead_id uuid, p_kind text, p_note text default null, p_channel text default null) returns void
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.log_lead_activity_impl(p_lead_id, p_kind, p_note, p_channel) $$;
create function public.complete_follow_up(p_lead_id uuid, p_quote_id uuid, p_note text default null) returns void
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.complete_follow_up_impl(p_lead_id, p_quote_id, p_note) $$;
create function public.convert_lead_to_customer(p_lead_id uuid, p_customer_id uuid default null) returns uuid
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.convert_lead_to_customer_impl(p_lead_id, p_customer_id) $$;
create function public.owner_slots_for_duration(p_duration_min integer, p_from date, p_days integer) returns jsonb
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.owner_slots_for_duration_impl(p_duration_min, p_from, p_days) $$;

-- ---------------------------------------------------------------------------
-- 3. The customer's quote link (public_api; token hash only; errors as results; R2-style limits)
-- ---------------------------------------------------------------------------
create function app.quote_by_token(p_token_hash bytea, p_ip_hash bytea, p_lock boolean) returns public.quotes
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  q public.quotes;
  v_business uuid;
begin
  if p_token_hash is null or octet_length(p_token_hash) <> 32 or p_ip_hash is null or octet_length(p_ip_hash) <> 32 then
    raise exception 'link not valid' using errcode = 'DH003';
  end if;
  perform app.enforce_rate_limit('token_action', p_ip_hash, null, 30, interval '10 minutes');
  perform app.record_rate_event('token_action', p_ip_hash, null);
  select business_id into v_business from public.quotes where token_hash = p_token_hash;
  if v_business is null then
    raise exception 'link not valid' using errcode = 'DH003';
  end if;
  if p_lock then
    select * into q from public.quotes where token_hash = p_token_hash for update;
  else
    select * into q from public.quotes where token_hash = p_token_hash;
  end if;
  return q;
end
$$;

-- What the customer sees: allow-listed fields only — never internal notes, follow-ups or ids.
create function app.quote_json(q public.quotes) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare
  b public.businesses;
  v_today date;
begin
  select * into b from public.businesses where id = q.business_id;
  v_today := (now() at time zone b.timezone)::date;
  return jsonb_build_object(
    'number', q.number,
    'status', case when q.status = 'sent' and q.valid_until < v_today then 'expired' else q.status::text end,
    'business', jsonb_build_object('name', b.name, 'phone', b.phone_e164, 'timezone', b.timezone,
                                   'slug', case when b.published_at is not null then b.slug end),
    'customer_first_name', (select c.first_name from public.customers c where c.id = q.customer_id and c.business_id = q.business_id),
    'vehicle', q.vehicle_text,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'description', i.description, 'quantity', i.quantity,
                                                            'price_cents', i.price_cents) order by i.created_at, i.name)
                         from public.quote_items i where i.quote_id = q.id and i.business_id = q.business_id), '[]'::jsonb),
    'subtotal_cents', q.subtotal_cents,
    'discount_cents', q.discount_cents,
    'total_cents', q.total_cents,
    'valid_until', q.valid_until,
    'notes', q.notes,
    'terms', q.terms,
    'proposed_start', q.proposed_start,
    'sent_at', q.sent_at,
    'decided_at', q.decided_at);
end
$$;

create function app.quote_action_core(p_action text, p_token_hash bytea, p_ip_hash bytea) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  q public.quotes := app.quote_by_token(p_token_hash, p_ip_hash, p_action <> 'view');
  v_today date;
begin
  if p_action = 'view' then
    return app.quote_json(q);
  end if;
  select (now() at time zone b.timezone)::date into v_today from public.businesses b where b.id = q.business_id;
  -- Already decided: the same answer again is a no-op (no duplicate acceptance); anything else is refused.
  if (p_action = 'accept' and q.status in ('accepted', 'converted')) or (p_action = 'decline' and q.status = 'declined') then
    return app.quote_json(q) || jsonb_build_object('already', true);
  end if;
  if q.status <> 'sent' then
    raise exception 'this quote can no longer be answered' using errcode = 'DH002';
  end if;
  perform set_config('app.actor_type', 'customer', true);
  if q.valid_until < v_today then
    update public.quotes set status = 'expired' where id = q.id returning * into q;
    return app.quote_json(q);
  end if;
  update public.quotes set status = case p_action when 'accept' then 'accepted' else 'declined' end::public.quote_status,
                           decided_at = now()
   where id = q.id returning * into q;
  return app.quote_json(q);
end
$$;

-- Wrapper shape as app.token_call (migration 11): failed lookups are counted (R2/D3).
create function app.quote_token_call(p_action text, p_token_hash bytea, p_ip_hash bytea) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_code text; v_message text; v_detail text;
begin
  if octet_length(p_ip_hash) = 32 then
    perform app.enforce_rate_limit('token_failed', p_ip_hash, null, 10, interval '10 minutes');
  end if;
  return app.quote_action_core(p_action, p_token_hash, p_ip_hash);
exception when sqlstate 'DH001' or sqlstate 'DH002' or sqlstate 'DH003' or sqlstate 'DH004' or sqlstate 'DH005' then
  get stacked diagnostics v_code = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail;
  return app.public_error(v_code, v_message, v_detail, case when v_code = 'DH003' then 'token_failed' end, p_ip_hash, null);
end
$$;

create function public_api.get_quote(p_token_hash bytea, p_ip_hash bytea) returns jsonb
language sql security definer set search_path = pg_catalog, pg_temp
as $$ select app.quote_token_call('view', p_token_hash, p_ip_hash) $$;
create function public_api.accept_quote(p_token_hash bytea, p_ip_hash bytea) returns jsonb
language sql security definer set search_path = pg_catalog, pg_temp
as $$ select app.quote_token_call('accept', p_token_hash, p_ip_hash) $$;
create function public_api.decline_quote(p_token_hash bytea, p_ip_hash bytea) returns jsonb
language sql security definer set search_path = pg_catalog, pg_temp
as $$ select app.quote_token_call('decline', p_token_hash, p_ip_hash) $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function
  app.tg_lead_activity(), app.tg_quote_activity(),
  app.owner_customer_vehicle(uuid, uuid, jsonb, uuid, jsonb, public.lead_source),
  app.save_quote_impl(uuid, jsonb, uuid, jsonb, uuid, jsonb, jsonb),
  app.send_quote_impl(uuid, uuid, bytea), app.withdraw_quote_impl(uuid), app.delete_quote_impl(uuid),
  app.convert_quote_impl(uuid, timestamptz, public.location_type, jsonb, integer),
  app.log_lead_activity_impl(uuid, text, text, text), app.complete_follow_up_impl(uuid, uuid, text),
  app.convert_lead_to_customer_impl(uuid, uuid), app.owner_slots_for_duration_impl(integer, date, integer),
  app.quote_by_token(bytea, bytea, boolean), app.quote_json(public.quotes), app.quote_action_core(text, bytea, bytea),
  app.quote_token_call(text, bytea, bytea),
  public.save_quote(uuid, jsonb, uuid, jsonb, uuid, jsonb, jsonb), public.send_quote(uuid, uuid, bytea),
  public.withdraw_quote(uuid), public.delete_quote(uuid),
  public.convert_quote(uuid, timestamptz, public.location_type, jsonb, integer),
  public.log_lead_activity(uuid, text, text, text), public.complete_follow_up(uuid, uuid, text),
  public.convert_lead_to_customer(uuid, uuid), public.owner_slots_for_duration(integer, date, integer),
  public_api.get_quote(bytea, bytea), public_api.accept_quote(bytea, bytea), public_api.decline_quote(bytea, bytea)
from public, anon, authenticated, service_role;

grant execute on function
  app.save_quote_impl(uuid, jsonb, uuid, jsonb, uuid, jsonb, jsonb), app.send_quote_impl(uuid, uuid, bytea),
  app.withdraw_quote_impl(uuid), app.delete_quote_impl(uuid),
  app.convert_quote_impl(uuid, timestamptz, public.location_type, jsonb, integer),
  app.log_lead_activity_impl(uuid, text, text, text), app.complete_follow_up_impl(uuid, uuid, text),
  app.convert_lead_to_customer_impl(uuid, uuid), app.owner_slots_for_duration_impl(integer, date, integer),
  public.save_quote(uuid, jsonb, uuid, jsonb, uuid, jsonb, jsonb), public.send_quote(uuid, uuid, bytea),
  public.withdraw_quote(uuid), public.delete_quote(uuid),
  public.convert_quote(uuid, timestamptz, public.location_type, jsonb, integer),
  public.log_lead_activity(uuid, text, text, text), public.complete_follow_up(uuid, uuid, text),
  public.convert_lead_to_customer(uuid, uuid), public.owner_slots_for_duration(integer, date, integer)
to authenticated;

grant execute on function public_api.get_quote(bytea, bytea), public_api.accept_quote(bytea, bytea), public_api.decline_quote(bytea, bytea)
to booking_api;
