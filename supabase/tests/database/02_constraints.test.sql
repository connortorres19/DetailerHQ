-- Foreign-key and constraint enforcement (D-23): cross-business references, vehicle
-- ownership, immutability, status transitions and invariants I-1..I-13.
begin;
\ir _helpers.psql
select plan(32);

create temp table ctx as
select pg_temp.make_business('a@example.com', 'alpha-detail', 'mobile') as biz_a,
       pg_temp.make_business('b@example.com', 'bravo-detail', 'shop', 2) as biz_b;
grant select on ctx to authenticated;

create temp table rec as
with ca as (insert into public.customers (business_id, first_name, phone_e164)
            select biz_a, 'Jordan', '+15125550101' from ctx returning id),
     cb as (insert into public.customers (business_id, first_name, phone_e164)
            select biz_b, 'Priya', '+15125550102' from ctx returning id),
     ca2 as (insert into public.customers (business_id, first_name, phone_e164)
            select biz_a, 'Marcus', '+15125550103' from ctx returning id),
     va as (insert into public.vehicles (business_id, customer_id, make, model)
            select biz_a, (select id from ca), 'Tesla', 'Model Y' from ctx returning id),
     vb as (insert into public.vehicles (business_id, customer_id, make, model)
            select biz_b, (select id from cb), 'Ford', 'F-150' from ctx returning id),
     va2 as (insert into public.vehicles (business_id, customer_id, make, model)
            select biz_a, (select id from ca2), 'Honda', 'Odyssey' from ctx returning id)
select (select id from ca) as cust_a, (select id from cb) as cust_b, (select id from ca2) as cust_a2,
       (select id from va) as veh_a, (select id from vb) as veh_b, (select id from va2) as veh_a2;
grant select on rec to authenticated;
create temp table appt2 (id uuid);
grant all on appt2 to authenticated;

-- Cross-business references ------------------------------------------------
select throws_ok(
  format($$insert into public.vehicles (business_id, customer_id, make, model) values (%L, %L, 'Honda', 'Civic')$$,
         (select biz_a from ctx), (select cust_b from rec)),
  '23503', null, 'vehicle cannot belong to another business''s customer');

select throws_ok(
  format($$update public.booking_requests set customer_id = %L where id = %L$$,
         (select cust_b from rec),
         pg_temp.make_request((select biz_a from ctx), pg_temp.at_local(3, '10:00'))),
  '23503', null, 'request cannot link another business''s customer');

select throws_ok(
  format($$insert into public.booking_request_items (business_id, booking_request_id, service_id, name, price_type, price_cents, duration_min, is_addon)
           values (%L, %L, %L, 'x', 'fixed', 1, 60, false)$$,
         (select biz_a from ctx), pg_temp.make_request((select biz_a from ctx), pg_temp.at_local(3, '12:00')),
         pg_temp.service_id((select biz_b from ctx), 'Full detail')),
  '23503', null, 'request item cannot reference another business''s service');

select throws_ok(
  format($$insert into public.booking_requests (business_id, token_hash, idempotency_key, requested_start, requested_end,
           location_type, contact_first_name, contact_email, vehicle_make, vehicle_model, vehicle_size_class_id,
           consent_at, estimated_total_cents, estimated_duration_min)
           values (%L, sha256('x'::bytea), gen_random_uuid(), now() + interval '1 day', now() + interval '1 day 2 hours',
           'shop', 'A', 'a@example.com', 'Kia', 'Soul', %L, now(), 1, 120)$$,
         (select biz_a from ctx), pg_temp.size_class_id((select biz_b from ctx))),
  '23503', null, 'request cannot use another business''s vehicle size class');

select throws_ok(
  format($$insert into public.appointments (business_id, number, resource_id, customer_id, vehicle_id, starts_at, ends_at, location_type)
           values (%L, 999, %L, %L, %L, now() + interval '2 days', now() + interval '2 days 1 hour', 'shop')$$,
         (select biz_a from ctx), pg_temp.resource_id((select biz_b from ctx)), (select cust_a from rec), (select veh_a from rec)),
  '23503', null, 'appointment cannot use another business''s scheduling resource');

select throws_ok(
  format($$insert into public.appointments (business_id, number, resource_id, customer_id, vehicle_id, starts_at, ends_at, location_type)
           values (%L, 999, %L, %L, %L, now() + interval '2 days', now() + interval '2 days 1 hour', 'shop')$$,
         (select biz_a from ctx), pg_temp.resource_id((select biz_a from ctx)), (select cust_a2 from rec), (select veh_a from rec)),
  '23503', null, 'appointment vehicle must belong to the appointment''s customer');

select throws_ok(
  format($$insert into public.quotes (business_id, number, customer_id, vehicle_id) values (%L, 1, %L, %L)$$,
         (select biz_a from ctx), (select cust_a from rec), (select veh_b from rec)),
  '23503', null, 'quote cannot reference another business''s vehicle');

select throws_ok(
  format($$insert into public.leads (business_id, source, contact_first_name, customer_id) values (%L, 'phone', 'X', %L)$$,
         (select biz_a from ctx), (select cust_b from rec)),
  '23503', null, 'lead cannot reference another business''s customer');

select throws_ok(
  format($$insert into public.service_prices (business_id, service_id, size_class_id, price_cents) values (%L, %L, %L, 100)$$,
         (select biz_a from ctx), pg_temp.service_id((select biz_a from ctx), 'Full detail'), pg_temp.size_class_id((select biz_b from ctx))),
  'DH003', 'unknown vehicle size', 'service price cannot reference another business''s size class (ownership trigger, migration 9)');

select throws_ok(
  format($$insert into public.schedule_blocks (business_id, resource_id, kind, during, booking_request_id, expires_at)
           values (%L, %L, 'hold', tstzrange(now() + interval '1 day', now() + interval '1 day 1 hour'), %L, now() + interval '1 hour')$$,
         (select biz_b from ctx), pg_temp.resource_id((select biz_b from ctx)),
         pg_temp.make_request((select biz_a from ctx), pg_temp.at_local(4, '10:00'))),
  '23503', null, 'hold cannot point at another business''s request');

-- Immutability ---------------------------------------------------------------
select throws_ok(
  format($$update public.customers set business_id = %L where id = %L$$, (select biz_b from ctx), (select cust_a from rec)),
  'DH004', 'business_id cannot be changed', 'business_id is immutable');

select throws_ok(
  format($$update public.booking_requests set contact_first_name = 'Changed' where id = %L$$,
         pg_temp.make_request((select biz_a from ctx), pg_temp.at_local(5, '10:00'))),
  'DH004', 'request snapshot fields are immutable', 'request snapshot is immutable');

-- Checks -----------------------------------------------------------------------
select throws_ok($$insert into public.businesses (name, slug, timezone, service_mode) values ('X', 'xx-test', 'Europe/London', 'mobile')$$,
  '23514', null, 'non-US timezone rejected');
select throws_ok($$insert into public.businesses (name, slug, timezone, service_mode) values ('X', 'Bad Slug', 'America/Chicago', 'mobile')$$,
  '23514', null, 'invalid slug rejected');
select throws_ok($$insert into public.businesses (name, slug, timezone, service_mode) values ('X', 'admin', 'America/Chicago', 'mobile')$$,
  '23514', null, 'reserved slug rejected');
select throws_ok(
  format($$insert into public.customers (business_id, first_name, phone_e164) values (%L, 'X', '555-0101')$$, (select biz_a from ctx)),
  '23514', null, 'phone must be US E.164');
select throws_ok(
  format($$insert into public.customers (business_id, first_name) values (%L, 'NoContact')$$, (select biz_a from ctx)),
  '23514', null, 'customer needs phone or email');
select throws_ok(
  format($$update public.schedule_resources set capacity = 0 where business_id = %L$$, (select biz_b from ctx)),
  '23514', null, 'capacity must be at least 1');
select throws_ok(
  format($$insert into public.services (business_id, name, price_type, base_duration_min) values (%L, 'No price', 'fixed', 60)$$, (select biz_a from ctx)),
  '23514', null, 'fixed-price service requires a price (no invented prices)');
select throws_ok(
  format($$insert into public.schedule_resources (business_id, name, capacity) values (%L, 'Second general', 1)$$, (select biz_a from ctx)),
  '23505', null, 'only one active general capacity pool per business');
select throws_ok(
  format($$insert into public.schedule_blocks (business_id, resource_id, kind, during, appointment_id)
           values (%L, %L, 'appointment', tstzrange(now() + interval '1 day', now() + interval '1 day 5 minutes'), gen_random_uuid())$$,
         (select biz_a from ctx), pg_temp.resource_id((select biz_a from ctx))),
  '23514', null, 'blocks shorter than 15 minutes rejected');
select throws_ok(
  format($$insert into public.schedule_blocks (business_id, resource_id, kind, during, booking_request_id)
           values (%L, %L, 'hold', tstzrange(now() + interval '1 day', now() + interval '1 day 1 hour'), %L)$$,
         (select biz_a from ctx), pg_temp.resource_id((select biz_a from ctx)),
         pg_temp.make_request((select biz_a from ctx), pg_temp.at_local(6, '10:00'))),
  '23514', null, 'holds must have an expiry');
select throws_ok(
  format($$update public.businesses set accepting_requests = true, activated_at = null, account_status = 'pending_activation' where id = %L$$,
         (select biz_a from ctx)),
  'DH002', null, 'unactivated business cannot accept requests');

-- Status transitions -----------------------------------------------------------
create temp table req as select pg_temp.make_request((select biz_a from ctx), pg_temp.at_local(7, '10:00')) as id;
update public.booking_requests set status = 'declined' where id = (select id from req);
select throws_ok(
  format($$update public.booking_requests set status = 'pending' where id = %L$$, (select id from req)),
  'DH002', 'request cannot move from declined to pending', 'closed requests cannot reopen');
select throws_ok(
  format($$update public.booking_requests set status = 'approved' where id = %L$$,
         pg_temp.make_request((select biz_a from ctx), pg_temp.at_local(8, '10:00'))),
  '23514', null, 'approved request needs customer and vehicle');

-- Approved request without appointment fails at commit (deferred invariant I-4).
select throws_ok(
  format($q$do $d$ begin
             update public.booking_requests set customer_id = %1$L, vehicle_id = %2$L, status = 'approved' where id = %3$L;
             set constraints all immediate;
           end $d$ $q$,
         (select cust_a from rec), (select veh_a from rec),
         pg_temp.make_request((select biz_a from ctx), pg_temp.at_local(9, '10:00'))),
  'DH002', null, 'approved request without appointment is rejected (deferred check)');

-- Appointment from a request must use the request's customer and vehicle (I-5).
select throws_ok(
  format($q$do $d$ declare r uuid := %1$L; begin
             update public.booking_requests set customer_id = %2$L, vehicle_id = %3$L where id = r;
             insert into public.appointments (business_id, resource_id, customer_id, vehicle_id, booking_request_id, starts_at, ends_at, location_type, service_address_line1)
             values (%4$L, %5$L, %6$L, %7$L, r, now() + interval '3 days', now() + interval '3 days 2 hours', 'mobile', '1 Main');
           end $d$ $q$,
         pg_temp.make_request((select biz_a from ctx), pg_temp.at_local(10, '10:00')),
         (select cust_a from rec), (select veh_a from rec), (select biz_a from ctx),
         pg_temp.resource_id((select biz_a from ctx)), (select cust_a2 from rec), (select veh_a2 from rec)),
  'DH004', 'appointment must use the request''s customer and vehicle', 'appointment must use the request''s customer and vehicle');

-- Appointment transitions.
select pg_temp.as_user(pg_temp.owner_of((select biz_a from ctx)));
insert into appt2
select public.create_appointment((select cust_a from rec), (select veh_a from rec), pg_temp.at_local(11, '09:00'),
       array[pg_temp.service_id((select biz_a from ctx), 'Full detail')], 'mobile', '{"line1":"1 Main"}'::jsonb);
select throws_ok(
  format($$select public.complete_appointment(%L)$$, (select id from appt2)),
  'DH002', 'appointment cannot move from scheduled to completed', 'scheduled cannot jump to completed');
select throws_ok(
  format($$select public.mark_no_show(%L)$$, (select id from appt2)),
  'DH002', 'no-show can only be recorded after the start time', 'no-show only after start');
select lives_ok(format($$select public.cancel_appointment(%L, 'Customer asked')$$, (select id from appt2)), 'cancel works');
select throws_ok(
  format($$select public.reschedule_appointment(%L, %L)$$, (select id from appt2), pg_temp.at_local(12, '09:00')),
  'DH002', 'only scheduled appointments can be rescheduled', 'cancelled appointments cannot be rescheduled');
reset role;

-- History is append-only.
select throws_ok(
  $$update public.activity_events set kind = 'tampered'$$,
  'DH002', null, 'activity history is append-only');

select * from finish();
rollback;
