-- Phase 7 (SMTP-only connections): the encryption setting, the last successful connection time,
-- replacing a password without losing verification, "Test connection" recovery, privileges and
-- isolation. One transaction, rolled back.
begin;
\ir _helpers.psql
select plan(26);
grant email_worker to postgres;

select pg_temp.make_business('sm-a@example.com', 'sm-a', 'mobile') as a \gset
select pg_temp.make_business('sm-b@example.com', 'sm-b', 'mobile') as b \gset
select pg_temp.owner_of(:'a') as owner_a \gset
select pg_temp.owner_of(:'b') as owner_b \gset

-- ---- New SMTP connection: pending until the emailed code, encryption stored -----------------------
select pg_temp.as_user(:'owner_a');
select is(public.save_email_connection('smtp', 'Shop@Example.com', 'Shop', '\x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d'::bytea,
          'SMTP.Gmail.com', 465, 'shop@example.com', 'ssl'), 'pending', 'a new address waits for its code');
select is((select smtp_security from public.email_connections), 'ssl', 'the chosen encryption is saved');
select is((select smtp_host from public.email_connections), 'smtp.gmail.com', 'host normalised');
select isnt((select last_checked_at from public.email_connections), null, 'the login check time is recorded');
select throws_ok($$select secret from public.email_connections$$, '42501', null, 'owners still can''t read the credentials');
select throws_ok($$select public.save_email_connection('smtp', 'shop@example.com', 'Shop', '\x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d'::bytea,
          'smtp.gmail.com', 587, 'shop@example.com', 'none')$$, 'DH004', null, 'only STARTTLS or SSL/TLS');
select throws_ok($$select public.save_email_connection('smtp', 'shop@example.com', 'Shop', '\x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d'::bytea,
          'smtp.gmail.com', 25, 'shop@example.com', 'starttls')$$, 'DH004', null, 'only submission ports (465, 587, 2525)');
select is(public.save_email_connection('smtp', 'shop@example.com', 'Shop', '\x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d'::bytea,
          'smtp.gmail.com', 587, 'shop@example.com'), 'pending', 'encryption defaults from the port');
select is((select smtp_security from public.email_connections), 'starttls', '587 → STARTTLS');
reset role;

-- Verify with the code.
select email_api.start_verification(:'a') as code \gset
select pg_temp.as_user(:'owner_a');
select ok(public.verify_email_code(:'code'), 'code verifies');
reset role;
select is((select status::text from public.email_connections where business_id = :'a'), 'verified', 'verified');
select verified_at as first_verified from public.email_connections where business_id = :'a' \gset

-- ---- The password stops working: emails are held ---------------------------------------------------
insert into public.email_outbox (business_id, template, recipient, refs, idempotency_key, category)
values (:'a', 'booking_confirmed', 'c@example.com', '{}'::jsonb, 'sm-test-1', 'transactional') returning id as held_id \gset
select email_api.connection_failed(:'a', 'The mail server refused the username or password.');
select is((select status::text from public.email_outbox where id = :'held_id'), 'held', 'refused login → held');

-- ---- Replace the password for the same address: still verified, held emails go out ----------------
select pg_temp.as_user(:'owner_a');
select is(public.save_email_connection('smtp', 'shop@example.com', 'Shop', '\xffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100'::bytea,
          'smtp.gmail.com', 587, 'shop@example.com', 'starttls'), 'verified', 'same verified address: no new code needed');
reset role;
select is((select status::text from public.email_connections where business_id = :'a'), 'verified', 'connection back to verified');
select is((select verified_at from public.email_connections where business_id = :'a'), :'first_verified'::timestamptz, 'original verification kept');
select is((select secret from public.email_connections where business_id = :'a'),
          '\xffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100'::bytea, 'new credentials stored');
select is((select status::text from public.email_outbox where id = :'held_id'), 'queued', 'held email released');
select is((select last_error from public.email_connections where business_id = :'a'), null, 'error cleared');

-- ---- "Test connection" with the saved password ----------------------------------------------------
select email_api.connection_failed(:'a', 'temporary refusal');
select is(email_api.connection_ok(:'a')::text, 'verified', 'a working login restores a verified connection');
select is((select status::text from public.email_outbox where id = :'held_id'), 'queued', 'and releases held emails');
select is((select smtp_security from email_api.connection(:'a')), 'starttls', 'the worker gets the encryption setting');
select pg_temp.as_user(:'owner_a');
select throws_ok(format($$select email_api.connection_ok(%L)$$, :'a'), '42501', null, 'owners can''t call the worker API');

-- ---- A different address needs a new code ---------------------------------------------------------
select is(public.save_email_connection('smtp', 'new@example.com', 'Shop', '\x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d'::bytea,
          'smtp.example.com', 465, 'new@example.com', 'ssl'), 'pending', 'new address → pending');
reset role;
select is((select verified_at from public.email_connections where business_id = :'a'), null, 'verification reset');

-- ---- Isolation -------------------------------------------------------------------------------------
select pg_temp.as_user(:'owner_b');
select is((select count(*)::int from public.email_connections), 0, 'another business sees no connection');
select public.save_email_connection('smtp', 'new@example.com', 'B', '\x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d'::bytea,
       'smtp.example.com', 587, 'new@example.com', 'starttls');
reset role;
select is((select from_name from public.email_connections where business_id = :'a'), 'Shop', 'saving in business B never changes business A');

select * from finish();
rollback;
