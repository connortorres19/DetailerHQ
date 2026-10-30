-- DetailerHQ — Phase 1, migration 3: integrity triggers (D-23) and capacity engine (D-26, D-27).
--
-- Error codes raised by this schema (SQLSTATE):
--   DH001 capacity_exceeded   DH002 invalid_state   DH003 not_found
--   DH004 invalid_input       DH005 rate_limited
-- Callers must also treat 40001 (serialization failure) and 40P01 (deadlock) as
-- "this time was just taken — try again" (PRODUCT_PLAN §6.6.3 step 8).

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create function app.tg_touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create function app.tg_immutable_business_id() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.business_id is distinct from old.business_id then
    raise exception 'business_id cannot be changed' using errcode = 'DH004';
  end if;
  return new;
end
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'booking_settings','availability_rules','time_off','schedule_resources','vehicle_size_classes',
    'service_categories','services','service_prices','customers','vehicles','leads','quotes',
    'quote_items','booking_requests','booking_request_items','appointments','appointment_items',
    'schedule_blocks','activity_events','business_counters','memberships'
  ] loop
    execute format('create trigger immutable_business_id before update on public.%I
                    for each row execute function app.tg_immutable_business_id()', t);
  end loop;
  foreach t in array array[
    'businesses','booking_settings','schedule_resources','services','customers','vehicles',
    'leads','quotes','booking_requests','appointments'
  ] loop
    execute format('create trigger touch_updated_at before update on public.%I
                    for each row execute function app.tg_touch_updated_at()', t);
  end loop;
end
$$;

-- Append-only history.
create function app.tg_append_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'DH002';
end
$$;
create trigger append_only before update on public.activity_events
  for each row execute function app.tg_append_only();

-- ---------------------------------------------------------------------------
-- Per-business display numbers (R-0001, A-0001, Q-0001)
-- ---------------------------------------------------------------------------
create function app.next_number(p_business_id uuid, p_kind text) returns integer
language plpgsql security definer set search_path = ''
as $$
declare v integer;
begin
  insert into public.business_counters as c (business_id, kind, next_value)
  values (p_business_id, p_kind, 2)
  on conflict (business_id, kind) do update set next_value = c.next_value + 1
  returning c.next_value - 1 into v;
  return v;
end
$$;

create function app.tg_assign_number() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.number := app.next_number(new.business_id, tg_argv[0]);
  return new;
end
$$;
create trigger assign_number before insert on public.booking_requests
  for each row execute function app.tg_assign_number('request');
create trigger assign_number before insert on public.appointments
  for each row execute function app.tg_assign_number('appointment');
create trigger assign_number before insert on public.quotes
  for each row execute function app.tg_assign_number('quote');

create function app.tg_immutable_number() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.number is distinct from old.number then
    raise exception 'number cannot be changed' using errcode = 'DH004';
  end if;
  return new;
end
$$;
create trigger immutable_number before update on public.booking_requests
  for each row execute function app.tg_immutable_number();
create trigger immutable_number before update on public.appointments
  for each row execute function app.tg_immutable_number();
create trigger immutable_number before update on public.quotes
  for each row execute function app.tg_immutable_number();

-- ---------------------------------------------------------------------------
-- Businesses: owners may not publish/accept requests before activation.
-- ---------------------------------------------------------------------------
create function app.tg_business_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.accepting_requests and new.activated_at is null then
    raise exception 'business must be activated before accepting requests' using errcode = 'DH002';
  end if;
  return new;
end
$$;
create trigger business_guard before insert or update on public.businesses
  for each row execute function app.tg_business_guard();

-- ---------------------------------------------------------------------------
-- Booking requests: immutable snapshot + allowed transitions (§6.2)
-- ---------------------------------------------------------------------------
create function app.request_transition_allowed(f public.request_status, t public.request_status)
returns boolean language sql immutable set search_path = ''
as $$
  select f = t
      or (f = 'pending' and t in ('approved','time_proposed','declined','withdrawn','expired','closed_duplicate'))
      or (f = 'time_proposed' and t in ('approved','proposal_declined','withdrawn','expired','pending'))
$$;

create function app.tg_booking_request_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.token_hash, new.idempotency_key, new.requested_start, new.requested_end, new.alternate_start,
      new.location_type, new.service_address_line1, new.service_city, new.service_state, new.service_postal_code,
      new.contact_first_name, new.contact_last_name, new.contact_phone_e164, new.contact_email, new.preferred_contact,
      new.vehicle_year, new.vehicle_make, new.vehicle_model, new.vehicle_color, new.vehicle_size_class_id,
      new.vehicle_notes, new.customer_notes, new.consent_at, new.estimated_total_cents, new.estimate_is_minimum,
      new.estimated_duration_min, new.ip_hash, new.created_at)
     is distinct from
     (old.token_hash, old.idempotency_key, old.requested_start, old.requested_end, old.alternate_start,
      old.location_type, old.service_address_line1, old.service_city, old.service_state, old.service_postal_code,
      old.contact_first_name, old.contact_last_name, old.contact_phone_e164, old.contact_email, old.preferred_contact,
      old.vehicle_year, old.vehicle_make, old.vehicle_model, old.vehicle_color, old.vehicle_size_class_id,
      old.vehicle_notes, old.customer_notes, old.consent_at, old.estimated_total_cents, old.estimate_is_minimum,
      old.estimated_duration_min, old.ip_hash, old.created_at) then
    raise exception 'request snapshot fields are immutable' using errcode = 'DH004';
  end if;

  if not app.request_transition_allowed(old.status, new.status) then
    raise exception 'request cannot move from % to %', old.status, new.status using errcode = 'DH002';
  end if;

  if old.status not in ('pending', 'time_proposed')
     and (new.customer_id, new.vehicle_id) is distinct from (old.customer_id, old.vehicle_id) then
    raise exception 'customer and vehicle links are fixed once a request is closed' using errcode = 'DH002';
  end if;
  return new;
end
$$;
create trigger booking_request_guard before update on public.booking_requests
  for each row execute function app.tg_booking_request_guard();

-- Leaving pending/time_proposed releases the request's hold or proposal (I-7) and
-- every status change is recorded.
create function app.tg_booking_request_after_status() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status <> 'pending' then
    delete from public.schedule_blocks where booking_request_id = new.id and kind = 'hold';
  end if;
  if new.status <> 'time_proposed' then
    delete from public.schedule_blocks where booking_request_id = new.id and kind = 'proposal';
  end if;
  insert into public.activity_events (business_id, booking_request_id, kind, from_status, to_status, actor_type, actor_user_id)
  values (new.business_id, new.id, 'request_status_changed', old.status::text, new.status::text,
          coalesce(nullif(current_setting('app.actor_type', true), '')::public.actor_type, 'system'),
          (select auth.uid()));
  return null;
end
$$;
create trigger booking_request_after_status after update of status on public.booking_requests
  for each row when (old.status is distinct from new.status)
  execute function app.tg_booking_request_after_status();

-- Snapshot items never change.
create trigger booking_request_items_immutable before update on public.booking_request_items
  for each row execute function app.tg_append_only();

-- I-4: an approved request has exactly one appointment (checked at commit).
create function app.tg_check_request_has_appointment() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Deferred: judge the row as it is at commit, not as it was when the event was queued
  -- (it may have changed again or been deleted later in the same transaction).
  select * into new from public.booking_requests where id = new.id;
  if not found then
    return null;
  end if;
  if new.status = 'approved' and not exists (
       select 1 from public.appointments a where a.booking_request_id = new.id and a.business_id = new.business_id) then
    raise exception 'approved request % has no appointment', new.id using errcode = 'DH002';
  end if;
  return null;
end
$$;
create constraint trigger request_has_appointment after insert or update on public.booking_requests
  deferrable initially deferred for each row execute function app.tg_check_request_has_appointment();

-- ---------------------------------------------------------------------------
-- Appointments: links fixed, allowed transitions, request consistency (I-5)
-- ---------------------------------------------------------------------------
create function app.appointment_transition_allowed(f public.appointment_status, t public.appointment_status)
returns boolean language sql immutable set search_path = ''
as $$
  select f = t
      or (f = 'scheduled' and t in ('in_progress','cancelled','no_show'))
      or (f = 'in_progress' and t in ('completed','cancelled'))
      or (f = 'completed' and t = 'scheduled')
$$;

create function app.tg_appointment_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  if tg_op = 'INSERT' then
    if new.booking_request_id is not null then
      select customer_id, vehicle_id into r from public.booking_requests
       where id = new.booking_request_id and business_id = new.business_id;
      if (r.customer_id, r.vehicle_id) is distinct from (new.customer_id, new.vehicle_id) then
        raise exception 'appointment must use the request''s customer and vehicle' using errcode = 'DH004';
      end if;
    end if;
    if new.status <> 'scheduled' then
      raise exception 'appointments start as scheduled' using errcode = 'DH002';
    end if;
    return new;
  end if;

  if (new.customer_id, new.vehicle_id, new.booking_request_id, new.quote_id, new.lead_id, new.resource_id, new.created_at)
     is distinct from
     (old.customer_id, old.vehicle_id, old.booking_request_id, old.quote_id, old.lead_id, old.resource_id, old.created_at) then
    raise exception 'appointment links are immutable' using errcode = 'DH004';
  end if;
  if not app.appointment_transition_allowed(old.status, new.status) then
    raise exception 'appointment cannot move from % to %', old.status, new.status using errcode = 'DH002';
  end if;
  if new.status = 'no_show' and old.status <> 'no_show' and new.starts_at > now() then
    raise exception 'no-show can only be recorded after the start time' using errcode = 'DH002';
  end if;
  if old.status in ('completed', 'cancelled', 'no_show') and new.status = old.status
     and (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at) then
    raise exception 'closed appointments cannot be rescheduled' using errcode = 'DH002';
  end if;
  return new;
end
$$;
create trigger appointment_guard before insert or update on public.appointments
  for each row execute function app.tg_appointment_guard();

-- ---------------------------------------------------------------------------
-- Quotes: transitions, totals from items, items editable only in draft
-- ---------------------------------------------------------------------------
create function app.tg_quote_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not (old.status = new.status
          or (old.status = 'draft' and new.status = 'sent')
          or (old.status = 'sent' and new.status in ('accepted','declined','expired'))) then
    raise exception 'quote cannot move from % to %', old.status, new.status using errcode = 'DH002';
  end if;
  if old.status <> 'draft' and (new.subtotal_cents, new.discount_cents) is distinct from (old.subtotal_cents, old.discount_cents) then
    raise exception 'only draft quotes can change amounts' using errcode = 'DH002';
  end if;
  new.total_cents := new.subtotal_cents - new.discount_cents;
  return new;
end
$$;
create trigger quote_guard before update on public.quotes
  for each row execute function app.tg_quote_guard();

create function app.tg_quote_items_sync() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_quote_id uuid := coalesce(new.quote_id, old.quote_id);
  v_business_id uuid := coalesce(new.business_id, old.business_id);
  v_status public.quote_status;
begin
  select status into v_status from public.quotes where id = v_quote_id and business_id = v_business_id for update;
  if v_status is distinct from 'draft' and v_status is not null then
    raise exception 'only draft quotes can change items' using errcode = 'DH002';
  end if;
  update public.quotes q
     set subtotal_cents = coalesce((select sum(i.price_cents * i.quantity) from public.quote_items i
                                     where i.quote_id = v_quote_id and i.business_id = v_business_id), 0),
         total_cents = coalesce((select sum(i.price_cents * i.quantity) from public.quote_items i
                                  where i.quote_id = v_quote_id and i.business_id = v_business_id), 0) - q.discount_cents
   where q.id = v_quote_id and q.business_id = v_business_id;
  return null;
end
$$;
create trigger quote_items_sync after insert or update or delete on public.quote_items
  for each row execute function app.tg_quote_items_sync();

-- ---------------------------------------------------------------------------
-- Capacity engine (D-26, D-27)
-- ---------------------------------------------------------------------------

-- Locks a resource row. Every capacity-affecting write takes this lock first, which
-- serializes them per resource. Lock order everywhere: resource -> request -> appointment.
create function app.lock_resource(p_resource_id uuid) returns smallint
language plpgsql volatile security definer set search_path = ''
as $$
declare v_capacity smallint;
begin
  select capacity into v_capacity
    from public.schedule_resources
   where id = p_resource_id and active
     for update;
  if not found then
    raise exception 'scheduling resource not found' using errcode = 'DH003';
  end if;
  return v_capacity;
end
$$;

-- Highest number of active blocks overlapping any instant of p_range on a resource.
-- Usage only rises at block starts, so the peak inside [s, e) is reached at s or at
-- the start of an overlapping block inside (s, e). VOLATILE on purpose: each statement
-- takes a fresh snapshot, so after waiting on the resource lock the count includes the
-- blocks committed by the transaction we waited for (PostgreSQL xfunc-volatility docs).
create function app.peak_usage(p_resource_id uuid, p_range tstzrange, p_exclude uuid[] default '{}')
returns integer
language sql volatile security definer set search_path = ''
as $$
  with active as (
    select b.during
      from public.schedule_blocks b
     where b.resource_id = p_resource_id
       and b.during && p_range
       and not (b.id = any (p_exclude))
       and (b.kind = 'appointment' or b.expires_at > now())
  ),
  candidates as (
    select lower(p_range) as t
    union
    select lower(a.during) from active a where lower(a.during) > lower(p_range)
  )
  select coalesce(max((select count(*) from active a where a.during @> c.t)), 0)::integer
    from candidates c
$$;

create function app.tg_enforce_capacity() returns trigger
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_capacity smallint;
  v_peak integer;
  v_request_status public.request_status;
begin
  if tg_op = 'UPDATE'
     and new.during = old.during and new.resource_id = old.resource_id
     and new.expires_at is not distinct from old.expires_at then
    return new;
  end if;

  if new.kind <> 'appointment' then
    if new.expires_at <= now() then
      raise exception 'hold or proposal is already expired' using errcode = 'DH004';
    end if;
    select status into v_request_status from public.booking_requests
     where id = new.booking_request_id and business_id = new.business_id;
    if (new.kind = 'hold' and v_request_status <> 'pending')
       or (new.kind = 'proposal' and v_request_status <> 'time_proposed') then
      raise exception '% requires request status %', new.kind,
        case new.kind when 'hold' then 'pending' else 'time_proposed' end using errcode = 'DH002';
    end if;
  end if;

  -- Statement 1: lock. Statement 2 (separate, fresh snapshot): count.
  v_capacity := app.lock_resource(new.resource_id);
  v_peak := app.peak_usage(new.resource_id, new.during, array[new.id]);

  if v_peak + 1 > v_capacity then
    raise exception 'capacity_exceeded'
      using errcode = 'DH001',
            detail = format('resource %s capacity %s already has %s overlapping', new.resource_id, v_capacity, v_peak);
  end if;
  return new;
end
$$;
create trigger enforce_capacity before insert or update on public.schedule_blocks
  for each row execute function app.tg_enforce_capacity();

-- Appointment rows own their capacity block (I-6): present only while scheduled or
-- in progress. Completed, cancelled and no-show appointments release capacity (REC-18).
create function app.tg_sync_appointment_block() returns trigger
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if new.status in ('scheduled', 'in_progress') then
    if tg_op = 'INSERT' or old.status not in ('scheduled', 'in_progress') then
      insert into public.schedule_blocks (business_id, resource_id, kind, during, appointment_id, created_by)
      values (new.business_id, new.resource_id, 'appointment', tstzrange(new.starts_at, new.ends_at, '[)'),
              new.id, (select auth.uid()));
    elsif (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at) then
      update public.schedule_blocks
         set during = tstzrange(new.starts_at, new.ends_at, '[)')
       where appointment_id = new.id;
    end if;
  elsif tg_op = 'UPDATE' and old.status in ('scheduled', 'in_progress') then
    delete from public.schedule_blocks where appointment_id = new.id;
  end if;

  if tg_op = 'UPDATE' and (old.status is distinct from new.status
                           or (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at)) then
    insert into public.activity_events (business_id, appointment_id, kind, from_status, to_status, actor_type, actor_user_id, metadata)
    values (new.business_id, new.id,
            case when old.status is distinct from new.status then 'appointment_status_changed' else 'appointment_rescheduled' end,
            old.status::text, new.status::text,
            coalesce(nullif(current_setting('app.actor_type', true), '')::public.actor_type, 'system'),
            (select auth.uid()),
            jsonb_build_object('previous_starts_at', old.starts_at, 'previous_ends_at', old.ends_at,
                               'starts_at', new.starts_at, 'ends_at', new.ends_at));
  end if;
  return null;
end
$$;
create trigger sync_appointment_block after insert or update on public.appointments
  for each row execute function app.tg_sync_appointment_block();

-- Scheduled housekeeping. Expired holds/proposals are already ignored by every check;
-- this only tidies rows and moves stale requests/quotes to their terminal statuses.
create function app.expire_stale() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform set_config('app.actor_type', 'system', true);

  update public.booking_requests
     set status = 'expired'
   where status = 'time_proposed' and proposal_expires_at <= now();
  update public.booking_requests
     set status = 'expired'
   where status = 'pending' and requested_start <= now();

  delete from public.schedule_blocks
   where kind in ('hold', 'proposal') and expires_at <= now();

  update public.quotes q
     set status = 'expired'
    from public.businesses b
   where b.id = q.business_id and q.status = 'sent' and q.valid_until is not null
     and q.valid_until < (now() at time zone b.timezone)::date;
end
$$;
