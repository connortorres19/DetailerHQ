-- DetailerHQ — Phase 4D, migration 12: owner booking management.
-- Everything else 4D needs (approve, propose, retract, decline, close duplicate, request holds,
-- reschedule, cancel, complete, no-show) already exists as authorized owner functions
-- (migration 5) behind the capacity lock and trigger. This migration adds only:
--   1. Calendar holds: an owner can hold a time that isn't tied to a booking request (start,
--      end, optional private note). Same block table, same capacity trigger, same expiry rule.
--   2. Completing a job straight from "scheduled" (no separate "start" step), but never before
--      its start time — mirroring the existing no-show rule.

-- ---------------------------------------------------------------------------
-- 1. Calendar holds
-- ---------------------------------------------------------------------------
alter table public.schedule_blocks add column note text check (char_length(note) <= 200);

-- A hold either belongs to a request (Phase 1) or stands alone on the calendar (booking_request_id
-- null). Proposals always belong to a request; appointments to an appointment. Notes are only for
-- calendar holds.
alter table public.schedule_blocks drop constraint schedule_blocks_check;
alter table public.schedule_blocks add constraint schedule_blocks_check check (
  (kind = 'appointment' and appointment_id is not null and booking_request_id is null and expires_at is null and note is null)
  or (kind = 'proposal' and appointment_id is null and booking_request_id is not null and expires_at is not null and note is null)
  or (kind = 'hold' and appointment_id is null and expires_at is not null
      and (booking_request_id is not null and note is null or booking_request_id is null))
);

-- Capacity trigger (migration 3), unchanged except that the request-status rule applies only to
-- holds and proposals that belong to a request.
create or replace function app.tg_enforce_capacity() returns trigger
language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
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
    if new.booking_request_id is not null then
      select status into v_request_status from public.booking_requests
       where id = new.booking_request_id and business_id = new.business_id;
      if (new.kind = 'hold' and v_request_status <> 'pending')
         or (new.kind = 'proposal' and v_request_status <> 'time_proposed') then
        raise exception '% requires request status %', new.kind,
          case new.kind when 'hold' then 'pending' else 'time_proposed' end using errcode = 'DH002';
      end if;
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

-- Hold a time on the calendar. Uses one unit of capacity for [start, end) until the hold expires
-- (2–72 hours from now, never past the start: REC-01, as for request holds). The capacity trigger
-- refuses it if that time is already full — a hold never pushes out an appointment.
create function app.place_calendar_hold_impl(p_starts_at timestamptz, p_ends_at timestamptz, p_hours integer, p_note text default null)
returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  v_expires timestamptz;
  v_id uuid;
begin
  perform app.require_member(v_business, true);
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'the hold must end after it starts' using errcode = 'DH004';
  end if;
  if p_ends_at - p_starts_at > interval '72 hours' or p_ends_at - p_starts_at < interval '15 minutes' then
    raise exception 'a hold can be 15 minutes to 72 hours long' using errcode = 'DH004';
  end if;
  if p_hours is null or p_hours not between 2 and 72 then
    raise exception 'hold length must be 2 to 72 hours' using errcode = 'DH004';
  end if;
  if char_length(p_note) > 200 then
    raise exception 'note is too long' using errcode = 'DH004';
  end if;
  v_expires := least(now() + make_interval(hours => p_hours), p_starts_at);
  if v_expires <= now() then
    raise exception 'the hold must start in the future' using errcode = 'DH004';
  end if;

  perform app.lock_resource(app.general_resource_id(v_business));
  insert into public.schedule_blocks (business_id, resource_id, kind, during, expires_at, note, created_by)
  values (v_business, app.general_resource_id(v_business), 'hold', tstzrange(p_starts_at, p_ends_at, '[)'),
          v_expires, nullif(trim(p_note), ''), (select auth.uid()))
  returning id into v_id;

  insert into public.activity_events (business_id, kind, actor_type, actor_user_id, metadata)
  values (v_business, 'calendar_hold_placed', 'owner', (select auth.uid()),
          jsonb_build_object('block_id', v_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'expires_at', v_expires));
  return v_id;
end
$$;

-- Release a calendar hold early. Holds on requests are released with release_hold(request).
create function app.release_calendar_hold_impl(p_block_id uuid) returns boolean
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid;
  v_resource uuid;
  v_deleted integer;
begin
  select b.business_id, b.resource_id into v_business, v_resource
    from public.schedule_blocks b
   where b.id = p_block_id and b.kind = 'hold' and b.booking_request_id is null;
  perform app.require_member(v_business, true); -- unknown or another business's id: "not found"
  perform app.lock_resource(v_resource);
  delete from public.schedule_blocks where id = p_block_id and kind = 'hold' and booking_request_id is null;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    insert into public.activity_events (business_id, kind, actor_type, actor_user_id, metadata)
    values (v_business, 'calendar_hold_released', 'owner', (select auth.uid()), jsonb_build_object('block_id', p_block_id));
  end if;
  return v_deleted > 0;
end
$$;

create function public.place_calendar_hold(p_starts_at timestamptz, p_ends_at timestamptz, p_hours integer, p_note text default null)
returns uuid language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.place_calendar_hold_impl(p_starts_at, p_ends_at, p_hours, p_note) $$;

create function public.release_calendar_hold(p_block_id uuid) returns boolean
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.release_calendar_hold_impl(p_block_id) $$;

-- ---------------------------------------------------------------------------
-- 2. Complete straight from scheduled, but only once the job has started.
-- ---------------------------------------------------------------------------
create or replace function app.appointment_transition_allowed(f public.appointment_status, t public.appointment_status)
returns boolean language sql immutable set search_path = pg_catalog, pg_temp
as $$
  select f = t
      or (f = 'scheduled' and t in ('in_progress','completed','cancelled','no_show'))
      or (f = 'in_progress' and t in ('completed','cancelled'))
      or (f = 'completed' and t = 'scheduled')
$$;

-- Appointment guard (migration 3), plus: completion only after the start time.
create or replace function app.tg_appointment_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
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
  if new.status = 'completed' and old.status = 'scheduled' and new.starts_at > now() then
    raise exception 'a job can only be completed after its start time' using errcode = 'DH002';
  end if;
  if old.status in ('completed', 'cancelled', 'no_show') and new.status = old.status
     and (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at) then
    raise exception 'closed appointments cannot be rescheduled' using errcode = 'DH002';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Privileges: remove PostgreSQL's default PUBLIC execute, grant owners the wrappers and impls.
-- ---------------------------------------------------------------------------
revoke all on function
  app.place_calendar_hold_impl(timestamptz, timestamptz, integer, text),
  app.release_calendar_hold_impl(uuid),
  public.place_calendar_hold(timestamptz, timestamptz, integer, text),
  public.release_calendar_hold(uuid)
from public, anon, authenticated, service_role;
grant execute on function
  app.place_calendar_hold_impl(timestamptz, timestamptz, integer, text),
  app.release_calendar_hold_impl(uuid),
  public.place_calendar_hold(timestamptz, timestamptz, integer, text),
  public.release_calendar_hold(uuid)
to authenticated;
