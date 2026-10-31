-- Phase 4B: weekly hours (overlaps, atomic save), blocked time in the business time zone
-- (DST), booking mode prerequisites, and how the public time check honours all of it.
begin;
\ir _helpers.psql
select plan(55);

select pg_temp.make_business('hours-a@example.com', 'hours-a', 'shop', 2) as a \gset
select pg_temp.make_business('hours-b@example.com', 'hours-b', 'mobile') as b \gset
select pg_temp.owner_of(:'a') as owner_a \gset
select pg_temp.owner_of(:'b') as owner_b \gset

-- ---- Weekly hours ------------------------------------------------------------------------
-- Monday 08:00–12:00 and 13:00–17:00 (lunch break), Saturday 09:00–14:00; touching windows OK.
select pg_temp.as_user(:'owner_a');
select is(public.save_weekly_hours('[
  {"weekday":1,"start":"08:00","end":"12:00"},{"weekday":1,"start":"13:00","end":"17:00"},
  {"weekday":6,"start":"09:00","end":"12:00"},{"weekday":6,"start":"12:00","end":"14:00"}]'), 4,
  'save_weekly_hours replaces the week (lunch break = two windows; touching windows allowed)');
reset role;
select results_eq(
  format($$select weekday::int, start_time::text, end_time::text from public.availability_rules where business_id = %L order by 1, 2$$, :'a'),
  $$values (1, '08:00:00', '12:00:00'), (1, '13:00:00', '17:00:00'), (6, '09:00:00', '12:00:00'), (6, '12:00:00', '14:00:00')$$,
  'saved windows are exactly what was sent (the old 7-day hours are gone)');

select pg_temp.as_user(:'owner_a');
select throws_ok($$select public.save_weekly_hours('[{"weekday":2,"start":"09:00","end":"17:00"},{"weekday":2,"start":"16:00","end":"18:00"}]')$$,
  'DH004', 'working hours overlap', 'overlapping windows on the same day are rejected');
reset role;
select is((select count(*)::int from public.availability_rules where business_id = :'a'), 4, 'failed save leaves the previous week untouched (atomic)');

select pg_temp.as_user(:'owner_a');
select throws_ok($$select public.save_weekly_hours('[{"weekday":3,"start":"09:00","end":"09:00"}]')$$,
  '23514', null, 'a window must end after it starts (table check)');
select throws_ok($$select public.save_weekly_hours('[{"weekday":7,"start":"09:00","end":"10:00"}]')$$,
  'DH004', 'invalid working hours', 'weekday outside 0–6 is rejected');
select throws_ok($$select public.save_weekly_hours('[{"weekday":1,"start":"9am","end":"10:00"}]')$$,
  'DH004', 'invalid working hours', 'malformed time is rejected');
-- Direct table writes are checked too (not only through the function).
select throws_ok(format($$insert into public.availability_rules (business_id, weekday, start_time, end_time) values (%L, 1, '11:00', '14:00')$$, :'a'),
  'DH004', 'working hours overlap', 'a direct insert overlapping an existing window is rejected');
select lives_ok(format($$insert into public.availability_rules (business_id, weekday, start_time, end_time) values (%L, 0, '10:00', '24:00')$$, :'a'),
  'a window may end at midnight (24:00)');
-- B can neither see nor replace A's hours.
reset role;
select pg_temp.as_user(:'owner_b');
select is((select count(*)::int from public.availability_rules where business_id = :'a'), 0, 'B cannot read A''s hours');
select public.save_weekly_hours('[{"weekday":1,"start":"07:00","end":"09:00"}]');
reset role;
select is((select count(*)::int from public.availability_rules where business_id = :'a'), 5, 'B''s save only touches B''s own week');
-- No peeking: B inserting an overlapping window into A's business gets RLS's refusal, not "overlap".
select pg_temp.as_user(:'owner_b');
select throws_ok(format($$insert into public.availability_rules (business_id, weekday, start_time, end_time) values (%L, 1, '09:00', '10:00')$$, :'a'),
  '42501', null, 'B writing hours into A''s business → RLS refusal (overlap with A''s hours not revealed)');
select throws_ok(format($$insert into public.service_prices (business_id, service_id, size_class_id, price_cents)
                          select %L, s.id, v.id, 1 from public.services s, public.vehicle_size_classes v
                           where s.business_id = %L and v.business_id = %L limit 1$$, :'a', :'b', :'b'),
  '42501', null, 'B writing a price row into A''s business → RLS refusal, not an ownership hint');
reset role;

-- ---- Blocked time and DST ----------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select public.add_time_off('2026-11-01', '2026-11-01', null, null, 'Fall back') as off_fall \gset
select public.add_time_off('2026-03-08', '2026-03-08', null, null, 'Spring forward') as off_spring \gset
select public.add_time_off('2026-12-24', '2026-12-26', null, null, 'Holidays') as off_hol \gset
select public.add_time_off('2026-03-08', '2026-03-08', '01:30', '03:30', 'Across the gap') as off_gap \gset
select public.add_time_off('2026-11-10', '2026-11-10', '12:00', '13:30', 'Dentist') as off_dentist \gset
select public.add_time_off('2026-11-16', '2026-11-16', '09:00', '11:00', 'Supplier visit') as off_supplier \gset
reset role;
select is((select upper(during) - lower(during) from public.time_off where id = :'off_fall'), interval '25 hours', 'all-day Nov 1 (fall back) is 25 hours long');
select is((select lower(during) from public.time_off where id = :'off_fall'), '2026-11-01 05:00+00'::timestamptz, 'Nov 1 starts at local midnight (CDT, 05:00 UTC)');
select is((select upper(during) - lower(during) from public.time_off where id = :'off_spring'), interval '23 hours', 'all-day Mar 8 (spring forward) is 23 hours long');
select is((select upper(during) - lower(during) from public.time_off where id = :'off_hol'), interval '72 hours', 'multi-day block covers three whole local days');
select is((select upper(during) - lower(during) from public.time_off where id = :'off_gap'), interval '1 hour', '01:30–03:30 local on Mar 8 is one real hour (02:00–03:00 does not exist)');
select is((select tstzrange(lower(during), upper(during))::text from public.time_off where id = :'off_dentist'),
  '["2026-11-10 18:00:00+00","2026-11-10 19:30:00+00")', 'timed block converts with the business''s CST offset');
select ok((select all_day from public.time_off where id = :'off_fall') and not (select all_day from public.time_off where id = :'off_dentist'), 'all_day flag set correctly');

select pg_temp.as_user(:'owner_a');
select throws_ok($$select public.add_time_off('2026-11-10', '2026-11-09')$$, 'DH004', 'invalid blocked time', 'end date before start date is rejected');
select throws_ok($$select public.add_time_off('2026-11-10', '2026-11-10', '14:00', '13:00')$$, 'DH004', 'blocked time must end after it starts', 'end time before start time is rejected');
select throws_ok($$select public.add_time_off('2026-11-10', '2026-11-10', '14:00', null)$$, 'DH004', 'invalid blocked time', 'a timed block needs both times');
reset role;
select pg_temp.as_user(:'owner_b');
select is((select count(*)::int from public.time_off where id = :'off_dentist'), 0, 'B cannot read A''s blocked time');
delete from public.time_off where id = :'off_dentist';
reset role;
select is((select count(*)::int from public.time_off where id = :'off_dentist'), 1, 'B cannot delete A''s blocked time');

-- ---- The public time check honours hours, breaks, blocked time and capacity ----------------
-- Business A: Monday 08–12 and 13–17 (Chicago). Mon 2026-11-09 and Tue 2026-11-10.
select lives_ok(format($$select app.check_public_time(b, '2026-11-09 08:00 America/Chicago', '2026-11-09 10:00 America/Chicago') from public.businesses b where id = %L$$, :'a'),
  'a job inside the morning window is allowed');
select throws_ok(format($$select app.check_public_time(b, '2026-11-09 11:00 America/Chicago', '2026-11-09 13:30 America/Chicago') from public.businesses b where id = %L$$, :'a'),
  'DH004', 'time_unavailable', 'a job running into the lunch break is rejected');
select lives_ok(format($$select app.check_public_time(b, '2026-11-09 13:00 America/Chicago', '2026-11-09 17:00 America/Chicago') from public.businesses b where id = %L$$, :'a'),
  'a job filling the afternoon window exactly is allowed');
select throws_ok(format($$select app.check_public_time(b, '2026-11-10 09:00 America/Chicago', '2026-11-10 10:00 America/Chicago') from public.businesses b where id = %L$$, :'a'),
  'DH004', 'time_unavailable', 'a day with no windows (Tuesday) is closed');
-- Monday 2026-11-16 is a working day with 09:00–11:00 blocked.
select throws_ok(format($$select app.check_public_time(b, '2026-11-16 08:00 America/Chicago', '2026-11-16 10:00 America/Chicago') from public.businesses b where id = %L$$, :'a'),
  'DH004', 'time_unavailable', 'a job overlapping a blocked period on a working day is rejected');
select lives_ok(format($$select app.check_public_time(b, '2026-11-16 14:00 America/Chicago', '2026-11-16 16:00 America/Chicago') from public.businesses b where id = %L$$, :'a'),
  'the rest of that working day stays bookable');

-- ---- Every booking rule, enforced by the public time check (detail says which) --------------
create function pg_temp.why(p_business uuid, p_start timestamptz, p_minutes integer) returns text
language plpgsql as $$
declare v_detail text;
begin
  perform app.check_public_time(b, p_start, p_start + make_interval(mins => p_minutes)) from public.businesses b where b.id = p_business;
  return 'ok';
exception when sqlstate 'DH004' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail;
end
$$;

-- Business C: shop, 2 jobs at once. Weekdays 08:00–18:00; Sunday 00:00–04:00 and 20:00–24:00
-- (night windows so jobs can cross the 02:00 DST change).
select pg_temp.make_business('hours-c@example.com', 'hours-c', 'shop', 2) as c \gset
select pg_temp.owner_of(:'c') as owner_c \gset
select pg_temp.as_user(:'owner_c');
select public.save_weekly_hours('[{"weekday":0,"start":"00:00","end":"04:00"},{"weekday":0,"start":"20:00","end":"24:00"},
  {"weekday":1,"start":"08:00","end":"18:00"},{"weekday":2,"start":"08:00","end":"18:00"},{"weekday":3,"start":"08:00","end":"18:00"},
  {"weekday":4,"start":"08:00","end":"18:00"},{"weekday":5,"start":"08:00","end":"18:00"}]');
update public.booking_settings set slot_interval_min = 60, buffer_min = 30, max_jobs_per_day = null where business_id = :'c';
reset role;

-- DST: working hours use the real local end time. Sun 2026-11-01 (fall back, 25 h day):
-- 00:00 CDT + 5 h real time ends 04:00 CST (fits exactly). Sun 2027-03-14 (spring forward, 23 h):
-- 01:00 + 3 h real time ends 05:00 CDT (outside 00–04); 01:00 + 2 h ends 04:00 CDT (fits).
select is(pg_temp.why(:'c', '2026-11-01 00:00 America/Chicago', 270), 'ok', 'fall back: 4h30 from midnight ends 3:30 AM CST → inside the window');
select is(pg_temp.why(:'c', '2026-11-01 00:00 America/Chicago', 300), 'ok', 'fall back: 5 h from midnight ends exactly 4:00 AM CST → fits (local start + 5 h would wrongly say 5:00)');
select is(pg_temp.why(:'c', '2026-11-01 00:00 America/Chicago', 315), 'outside working hours', 'fall back: 5h15 ends 4:15 AM CST → outside');
select is(pg_temp.why(:'c', '2027-03-14 01:00 America/Chicago', 180), 'outside working hours', 'spring forward: 3 h from 1:00 AM ends 5:00 AM CDT → outside 00–04');
select is(pg_temp.why(:'c', '2027-03-14 01:00 America/Chicago', 120), 'ok', 'spring forward: 2 h from 1:00 AM ends 4:00 AM CDT → fits exactly');
-- A window ending at midnight takes a job that ends at midnight; one minute past is a new day.
select is(pg_temp.why(:'c', '2026-11-15 22:00 America/Chicago', 120), 'ok', 'a job may end at midnight in a window ending 24:00');
select is(pg_temp.why(:'c', '2026-11-15 23:00 America/Chicago', 120), 'spans more than one day', 'a job past midnight is refused');

-- Start times line up with the interval, counted from the window start.
select is(pg_temp.why(:'c', '2026-11-09 08:30 America/Chicago', 60), 'not an offered start time', 'hourly slots: 8:30 is not offered');
update public.booking_settings set slot_interval_min = 30 where business_id = :'c';
select is(pg_temp.why(:'c', '2026-11-09 08:30 America/Chicago', 60), 'ok', 'half-hour slots: 8:30 is offered');

-- Capacity 2 + buffer 30: two confirmed jobs 09:00–11:00 on Tue 2026-11-10.
select pg_temp.make_request(:'c', '2026-11-10 09:00 America/Chicago', 120, '+15125550201') as r1 \gset
select pg_temp.make_request(:'c', '2026-11-10 09:00 America/Chicago', 120, '+15125550202') as r2 \gset
select pg_temp.as_user(:'owner_c');
select public.approve_request(:'r1');
reset role;
select is(pg_temp.why(:'c', '2026-11-10 10:00 America/Chicago', 60), 'ok', 'capacity 2: one confirmed job leaves room for a second');
select pg_temp.as_user(:'owner_c');
select public.approve_request(:'r2');
reset role;
select is(pg_temp.why(:'c', '2026-11-10 10:00 America/Chicago', 60), 'fully booked', 'capacity 2: two confirmed jobs → full');
select is(pg_temp.why(:'c', '2026-11-10 11:00 America/Chicago', 60), 'fully booked', 'buffer: 11:00 is inside the 30-minute buffer after both jobs');
select is(pg_temp.why(:'c', '2026-11-10 11:30 America/Chicago', 60), 'ok', 'buffer: 11:30 is free');
select is(pg_temp.why(:'c', '2026-11-10 07:30 America/Chicago', 60), 'outside working hours', 'buffer does not open hours before the window');
update public.booking_settings set buffer_min = 0 where business_id = :'c';
select is(pg_temp.why(:'c', '2026-11-10 11:00 America/Chicago', 60), 'ok', 'no buffer: back-to-back at 11:00 is allowed');
update public.booking_settings set buffer_min = 30 where business_id = :'c';

-- Pending requests don't consume capacity (D-32): three pending at 14:00 leave 14:00 open.
select pg_temp.make_request(:'c', '2026-11-10 14:00 America/Chicago', 120, '+1512555020' || n) from generate_series(3, 5) n;
select is(pg_temp.why(:'c', '2026-11-10 14:00 America/Chicago', 60), 'ok', 'pending requests do not take capacity');

-- Daily cap counts confirmed jobs (and valid holds) starting that local day.
update public.booking_settings set max_jobs_per_day = 2 where business_id = :'c';
select is(pg_temp.why(:'c', '2026-11-10 15:00 America/Chicago', 60), 'daily limit reached', 'daily cap 2 with two confirmed jobs → no more that day');
select is(pg_temp.why(:'c', '2026-11-11 09:00 America/Chicago', 60), 'ok', 'the next day is unaffected');
select pg_temp.make_request(:'c', '2026-11-11 09:00 America/Chicago', 120, '+15125550206') as r6 \gset
select pg_temp.as_user(:'owner_c');
select public.place_hold(:'r6', 24);
reset role;
update public.booking_settings set max_jobs_per_day = 1 where business_id = :'c';
select is(pg_temp.why(:'c', '2026-11-11 14:00 America/Chicago', 60), 'daily limit reached', 'a valid hold counts toward the daily cap');
select pg_temp.make_request(:'c', '2026-11-12 09:00 America/Chicago', 120, '+15125550207');
select is(pg_temp.why(:'c', '2026-11-12 14:00 America/Chicago', 60), 'ok', 'a pending request does not count toward the daily cap');

-- ---- Booking mode --------------------------------------------------------------------------
select is((select booking_mode::text from public.booking_settings where business_id = :'a'), 'approval', 'approval required is the default');
select pg_temp.as_user(:'owner_b');
-- B (mobile): drop its hours, then try instant.
select public.save_weekly_hours('[]');
select throws_ok(format($$update public.booking_settings set booking_mode = 'instant' where business_id = %L$$, :'b'),
  'DH004', 'instant booking needs working hours', 'instant needs working hours');
select public.save_weekly_hours('[{"weekday":1,"start":"08:00","end":"17:00"}]');
update public.services set is_bookable = false where business_id = :'b';
select throws_ok(format($$update public.booking_settings set booking_mode = 'instant' where business_id = %L$$, :'b'),
  'DH004', 'instant booking needs a bookable service', 'instant needs a bookable non-quote service');
update public.services set is_bookable = true where business_id = :'b' and price_type <> 'quote_required';
update public.booking_settings set booking_mode = 'instant' where business_id = :'b';
reset role;
select is((select booking_mode::text from public.booking_settings where business_id = :'b'), 'instant', 'instant is allowed once services and hours exist');

select * from finish();
rollback;
