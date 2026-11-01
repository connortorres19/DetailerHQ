-- Phase 7: email automation — what each change queues (and doesn't), idempotency, reminders,
-- owner notifications, holding while a connection needs attention, the worker API, privileges and
-- isolation. Deferred triggers normally run at commit; `set constraints all immediate` runs them
-- here (the test is one transaction, rolled back).
begin;
\ir _helpers.psql
select plan(78);
-- Act as the worker role in this test (rolled back), with pgTAP callable.
grant email_worker to postgres;
grant usage on schema extensions to email_worker;
grant execute on all functions in schema extensions to email_worker;

select pg_temp.make_business('em-a@example.com', 'em-a', 'mobile') as a \gset
select pg_temp.make_business('em-b@example.com', 'em-b', 'mobile') as b \gset
select pg_temp.owner_of(:'a') as owner_a \gset
select pg_temp.owner_of(:'b') as owner_b \gset
create function pg_temp.outbox(p_business uuid, p_template text) returns int language sql as $$
  select count(*)::int from public.email_outbox where business_id = p_business and template::text = p_template $$;
create function pg_temp.connect(p_business uuid, p_status public.email_connection_status default 'verified') returns void language sql as $$
  insert into public.email_connections (business_id, provider, from_address, secret, status, verified_at)
  values (p_business, 'google', 'shop@example.com', extensions.gen_random_bytes(64), p_status, case when p_status <> 'pending' then now() end)
  on conflict (business_id) do update set status = excluded.status, verified_at = excluded.verified_at $$;
create function pg_temp.req(p_business uuid, p_start timestamptz, p_email text default null, p_notes text default null) returns uuid language sql as $$
  insert into public.booking_requests (business_id, token_hash, idempotency_key, requested_start, requested_end,
    location_type, service_address_line1, contact_first_name, contact_phone_e164, contact_email, customer_notes, vehicle_make, vehicle_model,
    vehicle_size_class_id, consent_at, estimated_total_cents, estimated_duration_min)
  values (p_business, sha256(gen_random_uuid()::text::bytea), gen_random_uuid(), p_start, p_start + interval '2 hours', 'mobile', '1234 Oak St',
          'Jordan', '+15125550' || lpad((floor(random() * 900) + 100)::text, 3, '0'), p_email, p_notes, 'Tesla', 'Model Y',
          pg_temp.size_class_id(p_business), now(), 26000, 120)
  returning id $$;
grant execute on function pg_temp.outbox(uuid, text) to authenticated;

-- ---- Not connected: everything works, nothing is queued -----------------------------------------
select pg_temp.req(:'a', pg_temp.at_local(3, '10:00'), 'jordan@example.com') as r0 \gset
set constraints all immediate;
set constraints all deferred;
select is((select count(*)::int from public.email_outbox where business_id = :'a'), 0, 'no connection: no emails queued');
select pg_temp.as_user(:'owner_a');
select lives_ok(format($$select public.approve_request(%L)$$, :'r0'), 'bookings work without email');
reset role;
set constraints all immediate;
set constraints all deferred;
select is((select count(*)::int from public.email_outbox where business_id = :'a'), 0, 'still nothing queued');

-- A pending (unverified) connection doesn't send either.
select pg_temp.connect(:'a', 'pending');
select pg_temp.req(:'a', pg_temp.at_local(4, '10:00'), 'pat@example.com') as rp \gset
set constraints all immediate;
set constraints all deferred;
select is(pg_temp.outbox(:'a', 'request_received'), 0, 'unverified connection: nothing queued');

-- ---- Connected: booking request lifecycle -------------------------------------------------------
select pg_temp.connect(:'a');
select pg_temp.req(:'a', pg_temp.at_local(5, '10:00'), 'Casey@Example.com', 'Gate code 1234') as r1 \gset
set constraints all immediate;
set constraints all deferred;
select is(pg_temp.outbox(:'a', 'request_received'), 1, 'request received → customer email');
select is((select recipient::text from public.email_outbox where template = 'request_received' and business_id = :'a'), 'casey@example.com', 'to the request''s address (lower-cased)');
select is(pg_temp.outbox(:'a', 'owner_new_request'), 1, 'and the owner is told');
select is((select recipient::text from public.email_outbox where template = 'owner_new_request' and business_id = :'a'), 'em-a@example.com', 'at their sign-in address');
-- Repeating the same event changes nothing (idempotency).
update public.booking_requests set updated_at = now() where id = :'r1';
select app.email_enqueue(:'a', 'request_received', 'casey@example.com', jsonb_build_object('request_id', :'r1'), 'request_received:' || :'r1');
select is(pg_temp.outbox(:'a', 'request_received'), 1, 'the same email is never queued twice');

-- Propose a time → declined by the customer → owner hears; propose again → accepted.
select pg_temp.as_user(:'owner_a');
select public.propose_time(:'r1', pg_temp.at_local(6, '13:00'), 'Afternoon works better') ;
reset role;
select is(pg_temp.outbox(:'a', 'time_proposed'), 1, 'time proposed → customer email');
update public.booking_requests set status = 'proposal_declined' where id = :'r1';
select is(pg_temp.outbox(:'a', 'proposal_declined'), 1, 'proposal declined → customer email');
select is((select count(*)::int from public.email_outbox where business_id = :'a' and template = 'owner_customer_response' and refs ->> 'response' = 'proposal_declined'), 1,
  'and the owner hears the customer declined');

select pg_temp.req(:'a', pg_temp.at_local(7, '10:00'), 'robin@example.com') as r2 \gset
select pg_temp.as_user(:'owner_a');
select public.decline_request(:'r2', 'Fully booked that week', 'too far');
reset role;
select is(pg_temp.outbox(:'a', 'booking_declined'), 1, 'declined → customer email');

select pg_temp.req(:'a', pg_temp.at_local(8, '10:00'), 'sam@example.com') as r3 \gset
select pg_temp.as_user(:'owner_a');
select public.approve_request(:'r3') as appt3 \gset
reset role;
set constraints all immediate;
set constraints all deferred;
select is(pg_temp.outbox(:'a', 'booking_confirmed'), 1, 'approved → confirmation');
select is((select count(*)::int from public.email_outbox where business_id = :'a' and template = 'owner_new_appointment'), 0,
  'the owner who approved it isn''t emailed about it');
select is((select count(*)::int from public.email_outbox where business_id = :'a' and template = 'appointment_reminder' and status = 'queued'), 1,
  'a 24-hour reminder is scheduled');
select ok((select abs(extract(epoch from next_attempt_at - (pg_temp.at_local(8, '10:00') - interval '24 hours'))) < 2
             from public.email_outbox where business_id = :'a' and template = 'appointment_reminder'), 'for 24 hours before');

-- Reschedule: new time email; old reminder cancelled, new one scheduled.
update public.appointments set starts_at = pg_temp.at_local(9, '11:00'), ends_at = pg_temp.at_local(9, '13:00') where id = :'appt3';
select is(pg_temp.outbox(:'a', 'booking_rescheduled'), 1, 'rescheduled → customer email');
select is((select count(*)::int from public.email_outbox where business_id = :'a' and template = 'appointment_reminder' and status = 'cancelled'), 1, 'old reminder cancelled');
select is((select count(*)::int from public.email_outbox where business_id = :'a' and template = 'appointment_reminder' and status = 'queued'), 1, 'new reminder queued');
-- Cancel by the customer: email + owner notification + reminder cancelled.
update public.appointments set status = 'cancelled', cancelled_by = 'customer', cancelled_at = now() where id = :'appt3';
select is(pg_temp.outbox(:'a', 'booking_cancelled'), 1, 'cancelled → customer email');
select is((select count(*)::int from public.email_outbox where business_id = :'a' and template = 'owner_customer_response' and refs ->> 'response' = 'appointment_cancelled'), 1,
  'the owner hears the customer cancelled');
select is((select count(*)::int from public.email_outbox where business_id = :'a' and template = 'appointment_reminder' and status = 'queued'), 0, 'no reminder for a cancelled appointment');

-- Reminder timing follows the business's choice (and reschedules upcoming ones).
select pg_temp.req(:'a', pg_temp.at_local(10, '10:00'), 'lee@example.com') as r4 \gset
select pg_temp.as_user(:'owner_a');
select public.approve_request(:'r4') as appt4 \gset
select lives_ok($$select public.save_email_settings(array[48, 2], '{}')$$, 'choose 48 h and 2 h reminders');
select throws_ok($$select public.save_email_settings(array[5], '{}')$$, 'DH004', 'choose reminder times from the list', 'only listed reminder times');
reset role;
set constraints all immediate;
set constraints all deferred;
select is((select array_agg((refs ->> 'hours')::int order by (refs ->> 'hours')::int) from public.email_outbox
            where business_id = :'a' and template = 'appointment_reminder' and status = 'queued' and refs ->> 'appointment_id' = :'appt4'),
  array[2, 48], 'reminders at 48 h and 2 h before');

-- A turned-off template isn't queued.
select pg_temp.as_user(:'owner_a');
select public.save_email_settings(array[24], '{"request_received": false}');
reset role;
select pg_temp.req(:'a', pg_temp.at_local(11, '10:00'), 'off@example.com') as r5 \gset
set constraints all immediate;
set constraints all deferred;
select is((select count(*)::int from public.email_outbox where recipient = 'off@example.com'), 0, 'turned off: not queued');
select is((select count(*)::int from public.email_outbox where business_id = :'a' and template = 'owner_new_request' and refs ->> 'request_id' = :'r5'), 1,
  'the owner is still told');

-- Owners choose their own notifications.
select pg_temp.as_user(:'owner_a');
select lives_ok($$select public.save_owner_email_prefs('{"owner_new_request": false}', 8)$$, 'turn off new-request emails');
select throws_ok($$select public.save_owner_email_prefs('{"marketing": true}', 8)$$, 'DH004', 'invalid preferences', 'unknown preferences refused');
reset role;
select pg_temp.req(:'a', pg_temp.at_local(12, '10:00')) as r6 \gset
set constraints all immediate;
set constraints all deferred;
select is((select count(*)::int from public.email_outbox where business_id = :'a' and template = 'owner_new_request' and refs ->> 'request_id' = :'r6'), 0,
  'owner preference respected');

-- ---- Instant booking: a confirmation, never "request received" -----------------------------------
select pg_temp.connect(:'b');
update public.booking_settings set booking_mode = 'instant' where business_id = :'b';
select pg_temp.req(:'b', pg_temp.at_local(5, '09:00'), 'instant@example.com') as rb \gset
insert into public.customers (business_id, first_name, phone_e164, email) values (:'b', 'Ivy', '+15125550700', 'instant@example.com') returning id as ic \gset
insert into public.vehicles (business_id, customer_id, make, model) values (:'b', :'ic', 'Kia', 'Soul') returning id as iv \gset
update public.booking_requests set customer_id = :'ic', vehicle_id = :'iv' where id = :'rb';
select app.appointment_from_request(:'rb', pg_temp.at_local(5, '09:00'), pg_temp.at_local(5, '11:00'));
update public.booking_requests set status = 'approved', decided_at = now() where id = :'rb';
set constraints all immediate;
set constraints all deferred;
select is(pg_temp.outbox(:'b', 'request_received'), 0, 'instant: no "request received"');
select is(pg_temp.outbox(:'b', 'booking_confirmed'), 1, 'instant: one confirmation');
select is(pg_temp.outbox(:'b', 'owner_new_appointment'), 1, 'instant: the owner hears about the new booking');

-- ---- Quotes ----------------------------------------------------------------------------------------
insert into public.customers (business_id, first_name, phone_e164, email) values (:'a', 'Quinn', '+15125550500', 'quinn@example.com') returning id as qc \gset
insert into public.vehicles (business_id, customer_id, make, model) values (:'a', :'qc', 'Ford', 'F-150') returning id as qv \gset
select pg_temp.as_user(:'owner_a');
select public.save_quote(null, jsonb_build_object('valid_until', (now() at time zone 'America/Chicago')::date + 10, 'internal_notes', 'MARGIN-SECRET'),
  :'qc', null, :'qv', null, '[{"name":"Ceramic coating","quantity":1,"price_cents":90000}]') as q1 \gset
select public.send_quote(:'q1', pg_temp.link_key());
reset role;
select is(pg_temp.outbox(:'a', 'quote_sent'), 1, 'quote sent → customer email');
select is(pg_temp.outbox(:'a', 'quote_expiring'), 1, 'and a follow-up before it expires');
select is((select category from public.email_outbox where business_id = :'a' and template = 'quote_expiring'), 'follow_up', 'the follow-up is non-essential (unsubscribable)');
select pg_temp.as_booking_api();
select public_api.accept_quote(pg_temp.quote_hash(:'q1'), sha256('em-ip'::bytea));
reset role;
select is(pg_temp.outbox(:'a', 'quote_accepted'), 1, 'accepted → customer email');
select is((select count(*)::int from public.email_outbox where business_id = :'a' and template = 'owner_customer_response' and refs ->> 'response' = 'quote_accepted'), 1, 'owner hears');
select is((select status::text from public.email_outbox where business_id = :'a' and template = 'quote_expiring'), 'cancelled', 'the expiry follow-up is withdrawn once answered');

-- Unsubscribed customers get no follow-ups, but still get transactional email.
insert into public.email_suppressions (business_id, email, category) values (:'a', 'quinn@example.com', 'follow_up');
select app.email_enqueue(:'a', 'quote_expired', 'quinn@example.com', '{}', 'test-suppressed', now(), 'follow_up');
select app.email_enqueue(:'a', 'booking_confirmed', 'quinn@example.com', '{}', 'test-transactional');
select is((select count(*)::int from public.email_outbox where idempotency_key = 'test-suppressed'), 0, 'unsubscribed: no follow-up');
select is((select count(*)::int from public.email_outbox where idempotency_key = 'test-transactional'), 1, 'transactional email unaffected');

-- ---- Leads from the booking page notify the owner; ones the owner types in don't ------------------
insert into public.leads (business_id, source, contact_first_name, contact_phone_e164) values (:'a', 'booking_page', 'Inquiry', '+15125550600') returning id as l1 \gset
select is((select count(*)::int from public.email_outbox where template = 'owner_new_lead' and refs ->> 'lead_id' = :'l1'), 1, 'inquiry → owner email');
select pg_temp.as_user(:'owner_a');
insert into public.leads (business_id, source, contact_first_name, contact_phone_e164) values (:'a', 'phone', 'Typed', '+15125550601') returning id as l2 \gset
reset role;
select is((select count(*)::int from public.email_outbox where template = 'owner_new_lead' and refs ->> 'lead_id' = :'l2'), 0, 'owner-entered lead: no email');

-- ---- Owner access: own rows only; never the credentials --------------------------------------------
select pg_temp.as_user(:'owner_a');
select throws_ok('select secret from public.email_connections', '42501', null, 'owners can''t read the encrypted credentials');
select throws_ok('select verification_hash from public.email_connections', '42501', null, 'or the verification hash');
select is((select from_address::text from public.email_connections), 'shop@example.com', 'owners see their connection''s address and status');
select throws_ok(format($$update public.email_outbox set status = 'sent' where business_id = %L$$, :'a'), '42501', null, 'owners can''t write the outbox');
select throws_ok(format($$insert into public.email_suppressions (business_id, email, category) values (%L, 'x@example.com', 'follow_up')$$, :'a'), '42501', null,
  'owners can''t add suppressions directly');
select throws_ok($$select * from email_api.claim(10)$$, '42501', null, 'owners can''t call the worker API');
select throws_ok(format($$select email_api.start_verification(%L)$$, :'a'), '42501', null, 'owners can''t make their own verification code');
select pg_temp.as_user(:'owner_b');
select is((select count(*)::int from public.email_outbox where business_id = :'a'), 0, 'B sees none of A''s emails');
select is((select count(*)::int from public.email_connections where business_id = :'a'), 0, 'or A''s connection');
select (select id from public.email_outbox where business_id = :'b' limit 1) as b_email \gset
reset role;
select id as a_failed from public.email_outbox where business_id = :'a' and template = 'booking_declined' \gset
update public.email_outbox set status = 'failed' where id = :'a_failed';
select pg_temp.as_user(:'owner_b');
select throws_ok(format($$select public.retry_email(%L)$$, :'a_failed'), 'DH002', null, 'B can''t retry A''s email');
select throws_ok(format($$select public.cancel_email(%L)$$, :'a_failed'), 'DH002', null, 'or cancel it');
reset role;
select pg_temp.as_anon();
select throws_ok('select 1 from public.email_outbox', '42501', null, 'anon has no access');
reset role;

-- Retry and cancel by the owner.
select pg_temp.as_user(:'owner_a');
select lives_ok(format($$select public.retry_email(%L)$$, :'a_failed'), 'retry a failed email');
reset role;
select is((select status::text from public.email_outbox where id = :'a_failed'), 'queued', 'queued again');

-- ---- SMTP verification code (made by the worker role, checked for the owner) -----------------------
insert into public.email_connections (business_id, provider, from_address, secret, smtp_host, smtp_port, smtp_username)
values (:'b', 'smtp', 'hello@bravo.example.com', extensions.gen_random_bytes(64), 'smtp.bravo.example.com', 587, 'hello@bravo.example.com')
on conflict (business_id) do update set provider = 'smtp', status = 'pending', verified_at = null, smtp_host = excluded.smtp_host,
  smtp_port = excluded.smtp_port, smtp_username = excluded.smtp_username, from_address = excluded.from_address;
set local role email_worker;
select email_api.start_verification(:'b') as code \gset
reset role;
select ok(:'code' ~ '^\d{6}$', 'a 6-digit code');
select isnt((select verification_hash from public.email_connections where business_id = :'b'), convert_to(:'code', 'UTF8'), 'only its hash is stored');
select pg_temp.as_user(:'owner_b');
select is(public.verify_email_code('000000'), :'code' = '000000', 'a wrong code fails');
select is(public.verify_email_code(:'code'), true, 'the right code verifies');
reset role;
select is((select status::text from public.email_connections where business_id = :'b'), 'verified', 'connection verified');

-- ---- Worker API ------------------------------------------------------------------------------------
set local role email_worker;
select throws_ok('select 1 from public.email_outbox', '42501', null, 'the worker role can''t read tables directly');
select ok((select count(*) from email_api.claim(50)) > 0, 'claims due emails');
reset role;
select ok(not exists (select 1 from public.email_outbox where status = 'queued' and next_attempt_at <= now() and template <> 'appointment_reminder'
                        and template <> 'quote_expiring' and business_id in (:'a', :'b')), 'claimed rows are marked sending');
select id as job from public.email_outbox where business_id = :'a' and template = 'quote_accepted' \gset
select ok(email_api.context(:'job')::text !~ 'MARGIN-SECRET|internal', 'context never includes internal notes');
select ok(email_api.context(:'job') -> 'quote' ->> 'nonce' is not null, 'context gives the worker what it needs to rebuild the link');
select email_api.finish(:'job', 'queued', 'busy', null, now() + interval '5 minutes');
select is((select status::text from public.email_outbox where id = :'job'), 'queued', 'a temporary failure is retried later');
select ok((select next_attempt_at > now() + interval '4 minutes' from public.email_outbox where id = :'job'), 'with backoff');

-- An auth failure holds the business's emails until it reconnects.
select email_api.connection_failed(:'a', 'invalid_grant');
select is((select status::text from public.email_connections where business_id = :'a'), 'needs_attention', 'connection needs attention');
select ok(not exists (select 1 from public.email_outbox where business_id = :'a' and status in ('queued', 'sending') and template <> 'appointment_reminder'
                        and next_attempt_at <= now()), 'its due emails are held');
select app.email_enqueue(:'a', 'booking_confirmed', 'new@example.com', '{}', 'while-broken');
select is((select status::text from public.email_outbox where idempotency_key = 'while-broken'), 'held', 'new emails are held too');
select email_api.mark_verified(:'a');
select is((select status::text from public.email_outbox where idempotency_key = 'while-broken'), 'queued', 'reconnecting releases held emails');

-- Disconnecting deletes the connection and skips what was waiting.
select pg_temp.as_user(:'owner_a');
select lives_ok($$select public.disconnect_email()$$, 'disconnect');
reset role;
select is((select count(*)::int from public.email_connections where business_id = :'a'), 0, 'credentials deleted');
select is((select count(*)::int from public.email_outbox where business_id = :'a' and status in ('queued', 'held')), 0, 'nothing left waiting');

-- Test emails are rate-limited.
select pg_temp.connect(:'a');
select pg_temp.as_user(:'owner_a');
select public.queue_test_email() from generate_series(1, 5);
select throws_ok($$select public.queue_test_email()$$, 'DH005', null, 'at most 5 test emails an hour');
reset role;

select * from finish();
rollback;
