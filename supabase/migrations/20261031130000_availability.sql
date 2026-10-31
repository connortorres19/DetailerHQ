-- DetailerHQ — Phase 4B, migration 10: availability, blocked time, booking mode.
-- Reuses availability_rules, time_off, booking_settings and schedule_resources (Phase 1).
-- New: booking_mode (D-28), no overlapping weekly windows, atomic weekly-hours save,
-- blocked periods entered as local dates/times and converted by PostgreSQL in the business's
-- time zone (DST-correct, the same engine that checks bookings), and a public time check that
-- enforces buffers, start-time alignment and the daily cap and is DST-correct (finding B3).

-- ---------------------------------------------------------------------------
-- 1. Booking mode (D-28, D-32): approval required by default; instant only once the business
--    has at least one bookable (non-quote) service and working hours.
-- ---------------------------------------------------------------------------
create type public.booking_mode as enum ('approval', 'instant');
alter table public.booking_settings add column booking_mode public.booking_mode not null default 'approval';

create function app.tg_booking_mode_ready() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if new.booking_mode = 'instant' and old.booking_mode is distinct from 'instant' then
    if not exists (select 1 from public.services s
                    where s.business_id = new.business_id and s.archived_at is null and s.is_bookable
                      and not s.is_addon and s.price_type <> 'quote_required') then
      raise exception 'instant booking needs a bookable service' using errcode = 'DH004', detail = 'instant_needs_services';
    end if;
    if not exists (select 1 from public.availability_rules r where r.business_id = new.business_id) then
      raise exception 'instant booking needs working hours' using errcode = 'DH004', detail = 'instant_needs_hours';
    end if;
  end if;
  return new;
end
$$;

create trigger booking_mode_ready before update of booking_mode on public.booking_settings
  for each row execute function app.tg_booking_mode_ready();

-- ---------------------------------------------------------------------------
-- 2. Weekly windows on the same weekday may not overlap (they may touch: 09–12 and 12–17).
--    A per-business transaction lock makes the check race-free for concurrent writers.
-- ---------------------------------------------------------------------------
create function app.tg_availability_no_overlap() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  -- BEFORE triggers run before RLS's with-check. For a signed-in user writing into a business
  -- they don't belong to, say nothing here (no peeking at that business's hours): RLS rejects it.
  if (select auth.uid()) is not null and not app.is_member(new.business_id) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('availability:' || new.business_id::text, 0));
  if exists (select 1 from public.availability_rules r
              where r.business_id = new.business_id and r.weekday = new.weekday and r.id <> new.id
                and r.start_time < new.end_time and new.start_time < r.end_time) then
    raise exception 'working hours overlap' using errcode = 'DH004', detail = 'overlapping_hours';
  end if;
  return new;
end
$$;

create trigger no_overlap before insert or update on public.availability_rules
  for each row execute function app.tg_availability_no_overlap();

-- Same rule for the migration-9 ownership trigger on service_prices: for a non-member, defer to
-- RLS instead of answering (which revealed whether a known service/size id belongs to that business).
create or replace function app.tg_service_price_owner() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if (select auth.uid()) is not null and not app.is_member(new.business_id) then
    return new;
  end if;
  if not exists (select 1 from public.services s where s.id = new.service_id and s.business_id = new.business_id) then
    raise exception 'unknown service' using errcode = 'DH003', detail = 'service_not_in_business';
  end if;
  if not exists (select 1 from public.vehicle_size_classes v where v.id = new.size_class_id and v.business_id = new.business_id) then
    raise exception 'unknown vehicle size' using errcode = 'DH003', detail = 'size_not_in_business';
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Save the whole week at once. p_windows: [{weekday 0–6 (0 = Sunday), start "HH:MM",
--    end "HH:MM" (24:00 allowed)}]. One call = one transaction: an overlap or invalid window
--    anywhere leaves the previous hours untouched. Runs with the owner's own privileges + RLS.
-- ---------------------------------------------------------------------------
create function public.save_weekly_hours(p_windows jsonb) returns integer
language plpgsql security invoker set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid;
  v_count integer;
begin
  select m.business_id into v_business from public.memberships m where m.user_id = (select auth.uid());
  if v_business is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_windows) <> 'array' or jsonb_array_length(p_windows) > 42
     or exists (select 1 from jsonb_array_elements(p_windows) e
                 where jsonb_typeof(e) <> 'object'
                    or exists (select 1 from jsonb_object_keys(e) k where k <> all (array['weekday','start','end']))
                    or (e ->> 'weekday') !~ '^[0-6]$'
                    or (e ->> 'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                    or (e ->> 'end') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$') then
    raise exception 'invalid working hours' using errcode = 'DH004', detail = 'invalid_hours';
  end if;

  delete from public.availability_rules r where r.business_id = v_business;
  insert into public.availability_rules (business_id, weekday, start_time, end_time)
  select v_business, (e ->> 'weekday')::smallint, (e ->> 'start')::time, (e ->> 'end')::time
    from jsonb_array_elements(p_windows) e;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Blocked time from local dates/times in the business's time zone.
--    All day (p_start_time null): from the start of p_start_date to the end of p_end_date —
--    a local day is 23 or 25 hours on DST change days. Timed: p_start_date p_start_time until
--    p_end_date p_end_time. Local times that don't exist (spring-forward gap) move forward;
--    repeated times (fall-back) use the later, standard-time occurrence (PostgreSQL rules).
-- ---------------------------------------------------------------------------
create function public.add_time_off(p_start_date date, p_end_date date, p_start_time time default null,
                                    p_end_time time default null, p_label text default null)
returns uuid
language plpgsql security invoker set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
begin
  select m.business_id, b.timezone into v_business, v_tz
    from public.memberships m join public.businesses b on b.id = m.business_id
   where m.user_id = (select auth.uid());
  if v_business is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date or p_end_date - p_start_date > 366
     or (p_start_time is null) <> (p_end_time is null) then
    raise exception 'invalid blocked time' using errcode = 'DH004', detail = 'invalid_time_off';
  end if;

  if p_start_time is null then
    v_start := p_start_date::timestamp at time zone v_tz;
    v_end := (p_end_date + 1)::timestamp at time zone v_tz;
  else
    v_start := (p_start_date + p_start_time) at time zone v_tz;
    v_end := (p_end_date + p_end_time) at time zone v_tz;
  end if;
  if v_end <= v_start then
    raise exception 'blocked time must end after it starts' using errcode = 'DH004', detail = 'time_off_ends_before_start';
  end if;

  insert into public.time_off (business_id, during, all_day, label)
  values (v_business, tstzrange(v_start, v_end, '[)'), p_start_time is null, nullif(trim(p_label), ''))
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. The public time check (migration 5) now enforces every booking rule, DST-correct:
--    * working hours use the job's real local end (wall clock), not local start + elapsed time —
--      on a DST change day those differ by an hour; a job may end at midnight in a 24:00 window;
--    * start times line up with slot_interval_min, counted from the window's start;
--    * buffer_min is kept free around existing appointments and valid holds;
--    * max_jobs_per_day caps appointments and valid holds starting that local day.
--    Pending requests still don't count (D-32); only appointments and unexpired holds/proposals.
-- ---------------------------------------------------------------------------
create or replace function app.check_public_time(p_business public.businesses, p_start timestamptz, p_end timestamptz)
returns void
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
  if p_end <= p_start then
    raise exception 'time_unavailable' using errcode = 'DH004', detail = 'invalid range';
  end if;
  if p_start < now() + make_interval(mins => s.min_notice_min) then
    raise exception 'time_unavailable' using errcode = 'DH004', detail = 'too soon';
  end if;
  if p_start > now() + make_interval(days => s.horizon_days) then
    raise exception 'time_unavailable' using errcode = 'DH004', detail = 'too far ahead';
  end if;
  if v_local_end::date <> v_day and not v_ends_midnight then
    raise exception 'time_unavailable' using errcode = 'DH004', detail = 'spans more than one day';
  end if;

  select ar.start_time into v_window_start
    from public.availability_rules ar
   where ar.business_id = p_business.id
     and ar.weekday = extract(dow from v_local_start)
     and v_local_start::time >= ar.start_time
     and case when v_ends_midnight then ar.end_time = time '24:00' else v_local_end::time <= ar.end_time end
   limit 1;
  if v_window_start is null then
    raise exception 'time_unavailable' using errcode = 'DH004', detail = 'outside working hours';
  end if;
  if (extract(epoch from (v_local_start::time - v_window_start)) / 60)::integer % s.slot_interval_min <> 0 then
    raise exception 'time_unavailable' using errcode = 'DH004', detail = 'not an offered start time';
  end if;

  if exists (select 1 from public.time_off t
              where t.business_id = p_business.id and t.during && tstzrange(p_start, p_end, '[)')) then
    raise exception 'time_unavailable' using errcode = 'DH004', detail = 'time off';
  end if;

  select capacity into v_capacity from public.schedule_resources where id = v_resource;
  if app.peak_usage(v_resource, tstzrange(p_start - make_interval(mins => s.buffer_min),
                                          p_end + make_interval(mins => s.buffer_min), '[)')) + 1 > v_capacity then
    raise exception 'time_unavailable' using errcode = 'DH004', detail = 'fully booked';
  end if;
  if s.max_jobs_per_day is not null
     and (select count(*) from public.schedule_blocks b
           where b.resource_id = v_resource
             and (b.kind = 'appointment' or b.expires_at > now())
             and b.during && tstzrange(v_day::timestamp at time zone p_business.timezone,
                                       (v_day + 1)::timestamp at time zone p_business.timezone, '[)')
             and (lower(b.during) at time zone p_business.timezone)::date = v_day) >= s.max_jobs_per_day then
    raise exception 'time_unavailable' using errcode = 'DH004', detail = 'daily limit reached';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Privileges: PostgreSQL grants new functions to PUBLIC by default — remove that, then
-- grant the two owner functions to authenticated only. Trigger functions need no grant.
-- ---------------------------------------------------------------------------
revoke all on function app.tg_booking_mode_ready(), app.tg_availability_no_overlap(), app.tg_service_price_owner()
  from public, anon, authenticated, service_role;
revoke all on function public.save_weekly_hours(jsonb), public.add_time_off(date, date, time, time, text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_weekly_hours(jsonb), public.add_time_off(date, date, time, time, text)
  to authenticated;
