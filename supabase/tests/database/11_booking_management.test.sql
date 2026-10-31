-- Phase 4D: owner booking management on the existing workflow functions, plus calendar holds
-- (migration 12). Capacity 1 (mobile) unless noted; hours 06–22 daily; no minimum notice.
begin;
\ir _helpers.psql
select plan(54);

select pg_temp.make_business('mgmt-a@example.com', 'mgmt-a', 'mobile') as a \gset
select pg_temp.make_business('mgmt-b@example.com', 'mgmt-b', 'mobile') as b \gset
select pg_temp.owner_of(:'a') as owner_a \gset
select pg_temp.owner_of(:'b') as owner_b \gset
select ((now() at time zone 'America/Chicago')::date + 5) as day \gset
create function pg_temp.t(p_time text) returns timestamptz language sql as $$
  select ((now() at time zone 'America/Chicago')::date + 5 + p_time::time) at time zone 'America/Chicago' $$;
grant execute on function pg_temp.t(text) to authenticated, booking_api;

-- Requests: r1 10–12, r2 11–13 (overlaps r1), r3 15–17, r4 18–20, r5 08–09 (tokens for the status link).
create function pg_temp.req(p_time text, p_minutes int, p_phone text, p_token text) returns uuid language sql as $$
  insert into public.booking_requests (business_id, token_hash, idempotency_key, requested_start, requested_end,
    location_type, service_address_line1, contact_first_name, contact_last_name, contact_phone_e164, contact_email,
    vehicle_make, vehicle_model, vehicle_size_class_id, consent_at, estimated_total_cents, estimated_duration_min, customer_notes)
  values ((select id from public.businesses where slug = 'mgmt-a'), sha256(p_token::bytea), gen_random_uuid(),
          pg_temp.t(p_time), pg_temp.t(p_time) + make_interval(mins => p_minutes), 'mobile', '1234 Oak St', 'Jordan', 'Reyes',
          p_phone, 'jordan@example.com', 'Tesla', 'Model Y', pg_temp.size_class_id((select id from public.businesses where slug = 'mgmt-a')),
          now(), 26000, p_minutes, 'Gate code 1234')
  returning id $$;
select pg_temp.req('10:00', 120, '+15125550101', 'tok-r1') as r1 \gset
select pg_temp.req('11:00', 120, '+15125550102', 'tok-r2') as r2 \gset
select pg_temp.req('15:00', 120, '+15125550103', 'tok-r3') as r3 \gset
select pg_temp.req('18:00', 120, '+15125550104', 'tok-r4') as r4 \gset
select pg_temp.req('08:00', 60, '+15125550105', 'tok-r5') as r5 \gset
insert into public.booking_request_items (business_id, booking_request_id, service_id, name, price_type, price_cents, duration_min, is_addon)
select :'a', r, pg_temp.service_id(:'a', 'Full detail'), 'Full detail', 'fixed', 26000, 120, false
  from unnest(array[:'r1', :'r2', :'r3', :'r4', :'r5']::uuid[]) r;
-- An existing customer with r3's phone (possible duplicate).
insert into public.customers (business_id, first_name, last_name, phone_e164) values (:'a', 'Jordan', 'Reyes', '+15125550103')
returning id as existing \gset
insert into public.vehicles (business_id, customer_id, make, model) values (:'a', :'existing', 'Honda', 'Civic');

-- ---- Approve -------------------------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select public.approve_request(:'r1') as appt1 \gset
reset role;
select is((select status::text from public.booking_requests where id = :'r1'), 'approved', 'approve: request approved');
select ok((select a.status = 'scheduled' and a.starts_at = pg_temp.t('10:00') and c.source = 'booking_page' and v.make = 'Tesla'
             from public.appointments a join public.customers c on c.id = a.customer_id join public.vehicles v on v.id = a.vehicle_id
            where a.id = :'appt1'), 'approve: appointment at the requested time with a new customer and vehicle');
select is((select count(*)::int from public.schedule_blocks where appointment_id = :'appt1'), 1, 'approve: the appointment takes capacity');

select pg_temp.as_user(:'owner_a');
select throws_ok(format('select public.approve_request(%L)', :'r2'), 'DH001', 'capacity_exceeded', 'never overbook: overlapping approval refused');
select throws_ok(format('select public.approve_request(%L)', :'r1'), 'DH002', 'only pending requests can be approved', 'approving twice is refused');
reset role;
select is((select status::text from public.booking_requests where id = :'r2'), 'pending', 'the refused request is still pending');

-- Approve while linking an existing customer the owner chose (no automatic merging otherwise).
select pg_temp.as_user(:'owner_a');
select public.approve_request(:'r3', :'existing') as appt3 \gset
reset role;
select is((select customer_id from public.appointments where id = :'appt3'), :'existing'::uuid, 'owner-chosen existing customer is used');
select is((select count(*)::int from public.customers where business_id = :'a' and phone_e164 = '+15125550103'), 1,
  'no second customer was created when the owner linked the existing one');
select is((select count(*)::int from public.vehicles where customer_id = :'existing'), 2, 'the request''s vehicle was added to that customer');

-- ---- Decline: internal reason stays private; message shown only when the owner writes one ---
select pg_temp.as_user(:'owner_a');
select lives_ok(format('select public.decline_request(%L, null, %L)', :'r2', 'Too far to travel'), 'decline with an internal reason only');
reset role;
select is((select decline_reason from public.booking_requests where id = :'r2'), 'Too far to travel', 'internal reason stored for the owner');
select pg_temp.as_booking_api();
select ok(public_api.get_request_status(sha256('tok-r2'::bytea), sha256('ip'::bytea))::text !~ 'Too far',
  'the internal reason never reaches the customer''s status link');
select is(public_api.get_request_status(sha256('tok-r2'::bytea), sha256('ip'::bytea)) ->> 'decline_message', null, 'no message shared');
reset role;

-- ---- Propose another time; customer accepts / rejects; expiry; no longer available ---------
select pg_temp.as_user(:'owner_a');
select lives_ok(format('select public.propose_time(%L, %L, %L)', :'r4', pg_temp.t('13:00'), 'Could you do 1 PM?'), 'propose 13:00 for r4');
select throws_ok(format('select public.propose_time(%L, %L)', :'r5', pg_temp.t('10:30')), 'DH001', 'capacity_exceeded',
  'a proposal into a full time is refused (capacity)');
reset role;
select is((select status::text from public.booking_requests where id = :'r4'), 'time_proposed', 'proposal stored; not confirmed');
select is((select count(*)::int from public.appointments where booking_request_id = :'r4'), 0, 'no appointment until the customer accepts');
select is((select count(*)::int from public.schedule_blocks where booking_request_id = :'r4' and kind = 'proposal'), 1, 'the proposed time is held for the customer');
select pg_temp.as_booking_api();
select is(public_api.accept_proposal(sha256('tok-r4'::bytea), sha256('ip'::bytea)) ->> 'status', 'approved', 'customer accepts through the link');
reset role;
select is((select starts_at from public.appointments where booking_request_id = :'r4'), pg_temp.t('13:00'), 'appointment at the proposed time');

-- Reject.
select pg_temp.as_user(:'owner_a');
select public.propose_time(:'r5', pg_temp.t('20:00'));
reset role;
select pg_temp.as_booking_api();
select is(public_api.decline_proposal(sha256('tok-r5'::bytea), sha256('ip'::bytea)) ->> 'status', 'proposal_declined', 'customer rejects the proposal');
reset role;
select is((select count(*)::int from public.schedule_blocks where booking_request_id = :'r5'), 0, 'rejecting frees the proposed time');

-- Expired proposal: accepting it is refused.
select pg_temp.req('19:00', 60, '+15125550106', 'tok-r6') as r6 \gset
select pg_temp.as_user(:'owner_a');
select public.propose_time(:'r6', pg_temp.t('20:00'));
reset role;
update public.booking_requests set proposal_expires_at = now() - interval '1 minute' where id = :'r6';
select pg_temp.as_booking_api();
select is(public_api.get_request_status(sha256('tok-r6'::bytea), sha256('ip'::bytea)) ->> 'status', 'expired', 'an expired proposal reads as expired');
select is(public_api.accept_proposal(sha256('tok-r6'::bytea), sha256('ip'::bytea)) ->> 'status', 'expired', 'and accepting it books nothing');
reset role;
select is((select count(*)::int from public.appointments where booking_request_id = :'r6'), 0, 'no appointment from an expired proposal');

-- Proposed time no longer available when the customer accepts: request goes back to pending.
select pg_temp.req('06:00', 60, '+15125550107', 'tok-r7') as r7 \gset
select pg_temp.as_user(:'owner_a');
select public.propose_time(:'r7', pg_temp.t('21:00'));
reset role;
delete from public.schedule_blocks where booking_request_id = :'r7';   -- e.g. the proposal block was cleared…
-- …and the time was booked meanwhile.
select pg_temp.req('21:00', 60, '+15125550108', 'tok-r8') as r8 \gset
select pg_temp.as_user(:'owner_a');
select public.approve_request(:'r8');
reset role;
select pg_temp.as_booking_api();
select is(public_api.accept_proposal(sha256('tok-r7'::bytea), sha256('ip'::bytea)) ->> 'reason', 'time_no_longer_available',
  'acceptance rechecks availability');
reset role;
select is((select status::text from public.booking_requests where id = :'r7'), 'pending', 'and the request returns to pending for the owner');

-- ---- Calendar holds ------------------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select public.place_calendar_hold(pg_temp.t('06:00'), pg_temp.t('08:00'), 24, 'Possible fleet job') as hold1 \gset
select throws_ok(format('select public.place_calendar_hold(%L, %L, 24)', pg_temp.t('10:30'), pg_temp.t('11:30')),
  'DH001', 'capacity_exceeded', 'a hold never overrides a confirmed appointment');
select throws_ok(format('select public.place_calendar_hold(%L, %L, 24)', pg_temp.t('12:00'), pg_temp.t('11:00')),
  'DH004', 'the hold must end after it starts', 'end before start refused');
select throws_ok(format('select public.place_calendar_hold(%L, %L, 100)', pg_temp.t('12:00'), pg_temp.t('13:00')),
  'DH004', 'hold length must be 2 to 72 hours', 'hold length limits');
select throws_ok(format('select public.place_calendar_hold(%L, %L, 24)', now() - interval '2 hours', now() - interval '1 hour'),
  'DH004', 'the hold must start in the future', 'holds are for future times');
reset role;
select ok((select note = 'Possible fleet job' and booking_request_id is null and expires_at <= pg_temp.t('06:00')
             from public.schedule_blocks where id = :'hold1'), 'hold stored with its note; expires no later than its start');
select pg_temp.req('06:30', 60, '+15125550109', 'tok-r9') as r9 \gset
select pg_temp.as_user(:'owner_a');
select throws_ok(format('select public.approve_request(%L)', :'r9'), 'DH001', 'capacity_exceeded', 'an active hold takes capacity');
-- Owner B can neither see nor release A's hold.
reset role;
select pg_temp.as_user(:'owner_b');
select is((select count(*)::int from public.schedule_blocks where id = :'hold1'), 0, 'B cannot see A''s hold');
select throws_ok(format('select public.release_calendar_hold(%L)', :'hold1'), 'DH003', 'not found', 'B cannot release A''s hold');
reset role;
select pg_temp.as_user(:'owner_a');
select is(public.release_calendar_hold(:'hold1'), true, 'A releases the hold');
select lives_ok(format('select public.approve_request(%L)', :'r9'), 'the released time can be booked');
reset role;
-- An expired hold stops counting at its expiry instant (no clean-up needed).
set local session_replication_role = replica; -- insert an already-expired hold directly (bypassing the trigger)
insert into public.schedule_blocks (business_id, resource_id, kind, during, expires_at, note)
values (:'a', pg_temp.resource_id(:'a'), 'hold', tstzrange(pg_temp.t('16:00'), pg_temp.t('17:00')), now() - interval '1 second', 'expired');
set local session_replication_role = origin;
select is(app.peak_usage(pg_temp.resource_id(:'a'), tstzrange(pg_temp.t('17:00'), pg_temp.t('18:00'))), 0, 'expired hold uses no capacity');
-- A note on a request's hold is refused by the table check (triggers skipped to reach it).
set local session_replication_role = replica;
select throws_ok(format($$insert into public.schedule_blocks (business_id, resource_id, kind, during, booking_request_id, expires_at, note)
                          values (%L, %L, 'hold', tstzrange(now() + interval '2 days', now() + interval '2 days 1 hour'), %L, now() + interval '1 hour', 'x')$$,
                        :'a', pg_temp.resource_id(:'a'), :'r7'),
  '23514', null, 'notes are only for calendar holds');
set local session_replication_role = origin;

-- ---- Cancel releases capacity; reschedule never overbooks -----------------------------------
select pg_temp.as_user(:'owner_a');
select lives_ok(format('select public.cancel_appointment(%L, %L, %L)', :'appt3', 'Customer called', 'Sorry — we had to cancel.'), 'cancel an appointment');
reset role;
select is((select count(*)::int from public.schedule_blocks where appointment_id = :'appt3'), 0, 'cancelled appointment released its capacity');
select pg_temp.as_user(:'owner_a');
select throws_ok(format('select public.reschedule_appointment(%L, %L)', :'appt1', pg_temp.t('13:30')), 'DH001', 'capacity_exceeded',
  'reschedule into a booked time is refused');
reset role;
select is((select starts_at from public.appointments where id = :'appt1'), pg_temp.t('10:00'), 'and the appointment is unchanged');
select pg_temp.as_user(:'owner_a');
select lives_ok(format('select public.reschedule_appointment(%L, %L)', :'appt1', pg_temp.t('11:00')), 'reschedule overlapping its own old time (capacity 1)');
select lives_ok(format('select public.reschedule_appointment(%L, %L)', :'appt1', pg_temp.t('15:00')), 'reschedule into the cancelled slot');
reset role;
select ok((select during = tstzrange(pg_temp.t('15:00'), pg_temp.t('17:00')) from public.schedule_blocks where appointment_id = :'appt1'),
  'the capacity block moved with it in the same transaction');

-- ---- Complete and no-show ------------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select throws_ok(format('select public.complete_appointment(%L)', :'appt1'), 'DH002', 'a job can only be completed after its start time',
  'a future job cannot be completed');
reset role;
-- A job that started yesterday (inserted directly with its past times).
insert into public.customers (business_id, first_name, phone_e164) values (:'a', 'Sam', '+15125550199') returning id as past_c \gset
insert into public.vehicles (business_id, customer_id, make, model) values (:'a', :'past_c', 'Ford', 'F-150') returning id as past_v \gset
insert into public.appointments (business_id, resource_id, customer_id, vehicle_id, starts_at, ends_at, location_type, estimated_total_cents)
values (:'a', pg_temp.resource_id(:'a'), :'past_c', :'past_v', now() - interval '1 day', now() - interval '22 hours', 'shop', 9000) returning id as past1 \gset
insert into public.appointments (business_id, resource_id, customer_id, vehicle_id, starts_at, ends_at, location_type, estimated_total_cents)
values (:'a', pg_temp.resource_id(:'a'), :'past_c', :'past_v', now() - interval '3 days', now() - interval '70 hours', 'shop', 9000) returning id as past2 \gset
select pg_temp.as_user(:'owner_a');
select lives_ok(format('select public.complete_appointment(%L)', :'past1'), 'a started job is marked completed straight from scheduled');
select lives_ok(format('select public.mark_no_show(%L)', :'past2'), 'a past job is marked no-show');
reset role;
select is((select array_agg(status::text order by starts_at) from public.appointments where id in (:'past1', :'past2')), array['no_show', 'completed'],
  'statuses recorded');

-- ---- Cross-business: B can't act on A's bookings --------------------------------------------
select pg_temp.as_user(:'owner_b');
select throws_ok(format('select public.decline_request(%L)', :'r9'), 'DH003', 'not found', 'B cannot decline A''s request');
select throws_ok(format('select public.cancel_appointment(%L)', :'appt1'), 'DH003', 'not found', 'B cannot cancel A''s appointment');
select is((select count(*)::int from public.booking_requests where business_id = :'a'), 0, 'B cannot read A''s requests');
reset role;
select ok(not has_function_privilege('anon', 'public.place_calendar_hold(timestamptz,timestamptz,integer,text)', 'EXECUTE')
          and not has_function_privilege('booking_api', 'public.release_calendar_hold(uuid)', 'EXECUTE'),
  'calendar holds: owners only');

select * from finish();
rollback;
