-- Unauthorized privileged function calls: other businesses, anonymous callers, the public
-- booking role, internal functions, and read-only (restricted) accounts.
begin;
\ir _helpers.psql
select plan(28);

create temp table ctx as
select pg_temp.make_business('a@example.com', 'alpha-detail', 'mobile') as biz_a,
       pg_temp.make_business('b@example.com', 'bravo-detail', 'shop', 2) as biz_b,
       pg_temp.create_user('u@example.com') as user_u;
create temp table req as
select pg_temp.make_request((select biz_a from ctx), pg_temp.at_local(3, '10:00')) as r1,
       pg_temp.make_request((select biz_a from ctx), pg_temp.at_local(4, '10:00')) as r2;
grant select on ctx, req to authenticated, anon, booking_api;

-- Owner B against Business A's records: indistinguishable from "does not exist".
select pg_temp.as_user(pg_temp.owner_of((select biz_b from ctx)));
select throws_ok(format('select public.approve_request(%L)', (select r1 from req)), 'DH003', 'not found', 'owner B cannot approve A''s request');
select throws_ok(format('select public.place_hold(%L, 24)', (select r1 from req)), 'DH003', 'not found', 'owner B cannot hold A''s time');
select throws_ok(format('select public.release_hold(%L)', (select r1 from req)), 'DH003', 'not found', 'owner B cannot release A''s hold');
select throws_ok(format('select public.propose_time(%L, %L)', (select r1 from req), pg_temp.at_local(5, '10:00')), 'DH003', 'not found', 'owner B cannot propose for A');
select throws_ok(format('select public.decline_request(%L)', (select r1 from req)), 'DH003', 'not found', 'owner B cannot decline A''s request');
select throws_ok(format('select public.close_duplicate(%L, %L)', (select r1 from req), (select r2 from req)), 'DH003', 'not found', 'owner B cannot close A''s duplicate');
select throws_ok(format('select public.approve_request(%L)', gen_random_uuid()), 'DH003', 'not found', 'unknown id gives the same answer as another business''s id');

-- Owner A approves; then owner B tries to change the appointment.
reset role;
select pg_temp.as_user(pg_temp.owner_of((select biz_a from ctx)));
create temp table appt as select public.approve_request((select r1 from req)) as id;
grant select on appt to authenticated, anon, booking_api;
reset role;
select pg_temp.as_user(pg_temp.owner_of((select biz_b from ctx)));
select throws_ok(format('select public.reschedule_appointment(%L, %L)', (select id from appt), pg_temp.at_local(6, '10:00')), 'DH003', 'not found', 'owner B cannot reschedule A''s appointment');
select throws_ok(format('select public.cancel_appointment(%L)', (select id from appt)), 'DH003', 'not found', 'owner B cannot cancel A''s appointment');
select throws_ok(format('select public.start_appointment(%L)', (select id from appt)), 'DH003', 'not found', 'owner B cannot start A''s appointment');
select throws_ok(
  format('select public.create_appointment(%L, %L, %L, array[%L]::uuid[], ''mobile'', ''{"line1":"x"}'')',
         (select customer_id from public.appointments where id = (select id from appt)),
         (select vehicle_id from public.appointments where id = (select id from appt)),
         pg_temp.at_local(7, '10:00'), pg_temp.service_id((select biz_a from ctx), 'Full detail')),
  'DH003', 'not found', 'owner B cannot book into A''s calendar with A''s customer');

-- Signed-in user without a business.
reset role;
select pg_temp.as_user((select user_u from ctx));
select throws_ok('select public.set_capacity(3)', 'DH003', 'not found', 'user without a business cannot set capacity');
select throws_ok(format('select public.approve_request(%L)', (select r2 from req)), 'DH003', 'not found', 'user without a business cannot approve');

-- Owners cannot call internal or public-booking functions directly.
reset role;
select pg_temp.as_user(pg_temp.owner_of((select biz_a from ctx)));
select throws_ok(format('select app.lock_resource(%L)', pg_temp.resource_id((select biz_a from ctx))), '42501', null, 'owners cannot call app.lock_resource');
select throws_ok('select app.expire_stale()', '42501', null, 'owners cannot call app.expire_stale');
select throws_ok(format('select app.peak_usage(%L, tstzrange(now(), now() + interval ''1 hour''))', pg_temp.resource_id((select biz_a from ctx))), '42501', null, 'owners cannot call app.peak_usage');
select throws_ok('select public_api.get_booking_page(''alpha-detail'')', '42501', null, 'owners cannot call public_api functions');
select throws_ok(format('insert into public.schedule_blocks (business_id, resource_id, kind, during, booking_request_id, expires_at) values (%L, %L, ''hold'', tstzrange(now() + interval ''2 days'', now() + interval ''2 days 1 hour''), %L, now() + interval ''1 hour'')',
                        (select biz_a from ctx), pg_temp.resource_id((select biz_a from ctx)), (select r2 from req)),
                 '42501', null, 'owners cannot write schedule blocks directly (D-24)');
select throws_ok(format('update public.appointments set starts_at = starts_at + interval ''1 hour'' where id = %L', (select id from appt)),
                 '42501', null, 'owners cannot update appointments directly (D-24)');
select throws_ok(format('update public.schedule_resources set capacity = 20 where business_id = %L', (select biz_a from ctx)),
                 '42501', null, 'owners cannot change capacity directly (D-24)');
select throws_ok(format('update public.businesses set account_status = ''active'' where id = %L', (select biz_a from ctx)),
                 '42501', null, 'owners cannot change their own account status');

-- Anonymous callers.
reset role;
select pg_temp.as_anon();
select throws_ok(format('select public.approve_request(%L)', (select r2 from req)), '42501', null, 'anon cannot call owner functions');
select throws_ok('select public.create_business(''X'', ''x-biz'', ''America/Chicago'', ''mobile'')', '42501', null, 'anon cannot create a business');
select throws_ok('select public_api.get_booking_page(''alpha-detail'')', '42501', null, 'anon cannot call public_api functions directly');

-- The restricted booking role cannot reach owner functions or tables.
reset role;
select pg_temp.as_booking_api();
select throws_ok(format('select public.approve_request(%L)', (select r2 from req)), '42501', null, 'booking_api cannot call owner functions');
select throws_ok('select count(*) from public.customers', '42501', null, 'booking_api cannot read tables');

-- Restricted (trial-expired) accounts are read-only in functions and in RLS.
reset role;
update public.businesses set account_status = 'trial_expired' where id = (select biz_a from ctx);
select pg_temp.as_user(pg_temp.owner_of((select biz_a from ctx)));
select throws_ok(format('select public.place_hold(%L, 24)', (select r2 from req)), 'DH002', 'account is read-only', 'restricted account cannot place holds');
select throws_ok(format('insert into public.customers (business_id, first_name, phone_e164) values (%L, ''New'', ''+15125550188'')', (select biz_a from ctx)),
                 '42501', null, 'restricted account cannot insert rows (RLS can_write)');

select * from finish();
rollback;
