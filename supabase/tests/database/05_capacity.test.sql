-- Capacity-aware scheduling (D-26, D-27): overlap by duration, capacity 1/2/3, holds and
-- proposals counting, expiry, cancellation, rescheduling, completion, capacity changes,
-- multi-day jobs, and independent scheduling resources. (Concurrency: tests/node.)
begin;
\ir _helpers.psql
select plan(36);

create temp table ctx as
select pg_temp.make_business('m@example.com', 'mobile-one', 'mobile') as m,
       pg_temp.make_business('s@example.com', 'shop-two', 'shop', 2) as s,
       pg_temp.make_business('t@example.com', 'shop-three', 'shop', 3) as t;
create temp table ids (k text primary key, id uuid);
grant select on ctx to authenticated;
grant all on ids to authenticated;

create function pg_temp.req(p_biz text, p_day int, p_time time, p_minutes int) returns uuid
language sql as $$
  select pg_temp.make_request((select case p_biz when 'm' then m when 's' then s else t end from ctx),
                              pg_temp.at_local(p_day, p_time), p_minutes,
                              '+1512555' || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0'))
$$;
grant execute on function pg_temp.req(text, int, time, int) to authenticated;

-- Requests are created as postgres; owners act on them.
insert into ids
select 'm1', pg_temp.req('m', 2, '09:00', 120) union all
select 'm2', pg_temp.req('m', 2, '10:00', 120) union all
select 'm3', pg_temp.req('m', 2, '11:00', 120) union all
select 'm4', pg_temp.req('m', 2, '12:00', 120) union all
select 'm5', pg_temp.req('m', 2, '16:00', 120) union all
select 'm6', pg_temp.req('m', 2, '19:00', 60)  union all
select 'm7', pg_temp.req('m', 2, '19:30', 60)  union all
select 'm8', pg_temp.req('m', 2, '13:00', 60)  union all
select 's1', pg_temp.req('s', 2, '09:00', 120) union all
select 's2', pg_temp.req('s', 2, '10:00', 120) union all
select 's3', pg_temp.req('s', 2, '10:30', 15)  union all
select 's4', pg_temp.req('s', 2, '11:00', 30)  union all
select 't1', pg_temp.req('t', 2, '09:00', 240) union all
select 't2', pg_temp.req('t', 2, '09:00', 240) union all
select 't3', pg_temp.req('t', 2, '09:00', 240) union all
select 't4', pg_temp.req('t', 2, '12:00', 120) union all
select 't5', pg_temp.req('t', 2, '13:00', 120) union all
select 't6', pg_temp.req('t', 5, '06:00', 2880) union all
select 't7', pg_temp.req('t', 5, '10:00', 60)  union all
select 't8', pg_temp.req('t', 5, '10:00', 60)  union all
select 't9', pg_temp.req('t', 5, '10:00', 60);

-- ---------------------------------------------------------------------------
-- Capacity 1 (mobile)
-- ---------------------------------------------------------------------------
select pg_temp.as_user(pg_temp.owner_of((select m from ctx)));
insert into ids select 'a_m1', public.approve_request((select id from ids where k = 'm1'));
select pass('C=1: first job 09:00-11:00 approved');
select throws_ok(format('select public.approve_request(%L)', (select id from ids where k = 'm2')),
                 'DH001', 'capacity_exceeded', 'C=1: overlapping 10:00-12:00 rejected');
select lives_ok(format('select public.approve_request(%L)', (select id from ids where k = 'm3')),
                'C=1: adjacent 11:00-13:00 approved (end = start does not overlap)');
select throws_ok(format('select public.place_hold(%L, 24)', (select id from ids where k = 'm4')),
                 'DH001', 'capacity_exceeded', 'C=1: hold cannot exceed capacity (12:00 overlaps 11:00-13:00)');
select lives_ok(format('select public.cancel_appointment((select id from public.appointments where booking_request_id = %L))',
                       (select id from ids where k = 'm3')), 'cancel 11:00-13:00');
select lives_ok(format('select public.place_hold(%L, 24)', (select id from ids where k = 'm4')),
                'C=1: after cancellation the 12:00 hold fits');
select throws_ok(format('select public.approve_request(%L)', (select id from ids where k = 'm8')),
                 'DH001', 'capacity_exceeded', 'C=1: an active hold (12:00-14:00) blocks a 13:00 request on its own');
select throws_ok(format('select public.reschedule_appointment(%L, %L)', (select id from ids where k = 'a_m1'), pg_temp.at_local(2, '12:30')),
                 'DH001', 'capacity_exceeded', 'C=1: rescheduling onto a held time rejected');
select lives_ok(format('select public.reschedule_appointment(%L, %L)', (select id from ids where k = 'a_m1'), pg_temp.at_local(2, '14:00')),
                'C=1: rescheduling into free time works (block moves with the appointment)');
select lives_ok(format('select public.approve_request(%L)', (select id from ids where k = 'm2')),
                'C=1: old 10:00-12:00 slot is free after the reschedule');
select lives_ok(format('select public.release_hold(%L)', (select id from ids where k = 'm4')), 'release hold');
select lives_ok(format('select public.approve_request(%L)', (select id from ids where k = 'm4')),
                'C=1: released hold frees its time');

-- Proposals count against capacity.
select lives_ok(format('select public.propose_time(%L, %L)', (select id from ids where k = 'm6'), pg_temp.at_local(2, '19:00')),
                'proposal reserves 19:00-20:00');
select throws_ok(format('select public.approve_request(%L)', (select id from ids where k = 'm7')),
                 'DH001', 'capacity_exceeded', 'C=1: outstanding proposal blocks 19:30');

-- Expired holds stop blocking immediately, before any clean-up job runs.
reset role;
alter table public.schedule_blocks disable trigger enforce_capacity;
insert into public.schedule_blocks (business_id, resource_id, kind, during, booking_request_id, expires_at, created_at)
select (select m from ctx), pg_temp.resource_id((select m from ctx)), 'hold',
       tstzrange(pg_temp.at_local(2, '16:00'), pg_temp.at_local(2, '18:00'), '[)'),
       (select id from ids where k = 'm5'), now() - interval '1 minute', now() - interval '2 hours';
alter table public.schedule_blocks enable trigger enforce_capacity;
select is(app.peak_usage(pg_temp.resource_id((select m from ctx)),
                         tstzrange(pg_temp.at_local(2, '16:00'), pg_temp.at_local(2, '18:00'), '[)')),
          0, 'expired hold contributes no usage');
select pg_temp.as_user(pg_temp.owner_of((select m from ctx)));
select lives_ok(format('select public.place_hold(%L, 24)', (select id from ids where k = 'm5')),
                'an expired hold on a request can be replaced by a new hold');
reset role;

-- Completion releases capacity; reopening re-checks it.
select pg_temp.as_user(pg_temp.owner_of((select m from ctx)));
select lives_ok(format('select public.start_appointment(%L)', (select id from ids where k = 'a_m1')), 'start job');
select lives_ok(format('select public.complete_appointment(%L, 27000, ''paid_card'')', (select id from ids where k = 'a_m1')), 'complete job');
select is((select count(*)::int from public.schedule_blocks where appointment_id = (select id from ids where k = 'a_m1')), 0,
          'completed appointment no longer holds capacity');

-- ---------------------------------------------------------------------------
-- Capacity 2 (E3) and 3 (E2)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.as_user(pg_temp.owner_of((select s from ctx)));
select lives_ok(format('select public.approve_request(%L)', (select id from ids where k = 's1')), 'C=2: 09:00-11:00');
select lives_ok(format('select public.approve_request(%L)', (select id from ids where k = 's2')), 'C=2: 10:00-12:00 (2 at once)');
select throws_ok(format('select public.approve_request(%L)', (select id from ids where k = 's3')),
                 'DH001', 'capacity_exceeded', 'C=2: 10:30-10:45 rejected (peak 2 at 10:30)');
select lives_ok(format('select public.approve_request(%L)', (select id from ids where k = 's4')),
                'C=2: 11:00-11:30 accepted (only 10:00-12:00 still running)');

reset role;
select pg_temp.as_user(pg_temp.owner_of((select t from ctx)));
select lives_ok(format('select public.approve_request(%L); select public.approve_request(%L); select public.approve_request(%L)',
                       (select id from ids where k = 't1'), (select id from ids where k = 't2'), (select id from ids where k = 't3')),
                'C=3: three 09:00-13:00 jobs');
select throws_ok(format('select public.approve_request(%L)', (select id from ids where k = 't4')),
                 'DH001', 'capacity_exceeded', 'C=3: 12:00-14:00 rejected');
select lives_ok(format('select public.approve_request(%L)', (select id from ids where k = 't5')), 'C=3: 13:00-15:00 accepted');

-- Capacity changes.
select throws_ok('select public.set_capacity(2)', 'DH001', 'capacity_exceeded',
                 'capacity cannot drop below existing overlapping bookings');
select lives_ok('select public.set_capacity(5)', 'capacity can always increase');
select lives_ok('select public.set_capacity(3)', 'capacity can drop back to what bookings need');

-- Multi-day job (48 h) uses one unit for its whole duration (E14).
select lives_ok(format('select public.approve_request(%L)', (select id from ids where k = 't6')), 'C=3: 48-hour job approved');
select lives_ok(format('select public.approve_request(%L); select public.approve_request(%L)',
                       (select id from ids where k = 't7'), (select id from ids where k = 't8')),
                'C=3: two more jobs fit beside the multi-day job');
select throws_ok(format('select public.approve_request(%L)', (select id from ids where k = 't9')),
                 'DH001', 'capacity_exceeded', 'C=3: a fourth concurrent job is rejected');

-- ---------------------------------------------------------------------------
-- Independent resources (future bays/staff) and businesses
-- ---------------------------------------------------------------------------
reset role;
insert into public.schedule_resources (business_id, kind, name, capacity)
select t, 'bay', 'Coating bay', 1 from ctx;
create temp table bay as select id from public.schedule_resources where kind = 'bay';
insert into ids select 'b1', pg_temp.req('t', 2, '09:00', 120) union all select 'b2', pg_temp.req('t', 2, '09:30', 60);
select lives_ok(format($q$insert into public.schedule_blocks (business_id, resource_id, kind, during, booking_request_id, expires_at)
                          values (%L, %L, 'hold', tstzrange(%L, %L, '[)'), %L, now() + interval '1 hour')$q$,
                       (select t from ctx), (select id from bay), pg_temp.at_local(2, '09:00'), pg_temp.at_local(2, '11:00'),
                       (select id from ids where k = 'b1')),
                'bay resource accepts a block while the general pool is full at that time');
select throws_ok(format($q$insert into public.schedule_blocks (business_id, resource_id, kind, during, booking_request_id, expires_at)
                           values (%L, %L, 'hold', tstzrange(%L, %L, '[)'), %L, now() + interval '1 hour')$q$,
                        (select t from ctx), (select id from bay), pg_temp.at_local(2, '09:30'), pg_temp.at_local(2, '10:30'),
                        (select id from ids where k = 'b2')),
                 'DH001', 'capacity_exceeded', 'bay capacity (1) is enforced independently of the general pool');
select is(app.peak_usage(pg_temp.resource_id((select m from ctx)),
                         tstzrange(pg_temp.at_local(2, '09:00'), pg_temp.at_local(2, '11:00'), '[)')), 1,
          'other businesses'' bookings never count against this business');

-- Mobile capacity guard (D-26; raising it is REC-17, not approved).
select pg_temp.as_user(pg_temp.owner_of((select m from ctx)));
select throws_ok('select public.set_capacity(2)', 'DH004', 'mobile-only businesses work one job at a time',
                 'mobile-only businesses stay at capacity 1');

select * from finish();
rollback;
