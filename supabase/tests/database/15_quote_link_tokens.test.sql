-- Quote link tokens (migration 15): made by the database from CSPRNG randomness, never chosen by
-- owners; 256-bit, URL-safe, stored only as SHA-256; unique; revoked on withdraw; expiry and
-- business status enforced; malformed and repeated bad lookups refused. Rolled back.
begin;
\ir _helpers.psql
select plan(46);

select pg_temp.make_business('lt-a@example.com', 'lt-a', 'mobile') as a \gset
select pg_temp.owner_of(:'a') as owner_a \gset
create function pg_temp.today_plus(p_days int) returns date language sql as $$ select (now() at time zone 'America/Chicago')::date + p_days $$;
grant execute on function pg_temp.today_plus(int) to authenticated;
insert into public.customers (business_id, first_name, phone_e164) values (:'a', 'Riley', '+15125550601') returning id as cust \gset
insert into public.vehicles (business_id, customer_id, make, model) values (:'a', :'cust', 'Subaru', 'Outback') returning id as veh \gset
create function pg_temp.new_quote(p_days int default 14) returns uuid language sql as $$
  select public.save_quote(null, jsonb_build_object('valid_until', pg_temp.today_plus(p_days), 'internal_notes', 'PRIVATE'),
                           (select id from public.customers where first_name = 'Riley'), null,
                           (select id from public.vehicles where make = 'Subaru'), null,
                           '[{"name":"Full detail","quantity":1,"price_cents":20000}]') $$;
grant execute on function pg_temp.new_quote(int) to authenticated;

-- ---- The owner can no longer choose a token -------------------------------------------------
select is(to_regprocedure('public.send_quote(uuid,uuid,bytea)'), null, 'the caller-chosen-token send_quote is gone');
select is(to_regprocedure('app.send_quote_impl(uuid,uuid,bytea)'), null, 'and its implementation');
select is(array(select p.oid::regprocedure::text from pg_proc p where p.proname = 'send_quote'), array['send_quote(uuid,bytea)'],
  'send_quote takes only a quote and the server''s link key');
select pg_temp.as_user(:'owner_a');
select pg_temp.new_quote() as q \gset
select throws_ok($$select app.quote_link_token(gen_random_uuid(), sha256('k'::bytea))$$, '42501', null, 'owners cannot call the token function');
select throws_ok(format($$select public.send_quote(%L, '\x00'::bytea)$$, :'q'), 'DH004', 'invalid link key', 'a short key is refused');
select throws_ok(format($$select public.send_quote(%L, null)$$, :'q'), 'DH004', 'invalid link key', 'a missing key is refused');
select throws_ok(format($$select public.send_quote(%L, substring(sha256('k'::bytea) from 2))$$, :'q'), 'DH004', 'invalid link key', 'a 31-byte key is refused');
select throws_ok(format($$update public.quotes set token_nonce = gen_random_uuid(), link_version = 2 where id = %L$$, :'q'), '42501', null,
  'owners cannot write the nonce or version directly');
select throws_ok(format($$update public.quotes set token_hash = sha256('guessable'::bytea) where id = %L$$, :'q'), '42501', null,
  'owners cannot write the hash directly');
reset role;
select is((select status::text from public.quotes where id = :'q'), 'draft', 'refused sends leave the quote a draft');

-- ---- Sending: random nonce, 256-bit URL-safe token, only its hash stored ---------------------
select pg_temp.as_user(:'owner_a');
select public.send_quote(:'q', pg_temp.link_key()) as n \gset
reset role;
select ok(:'n'::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', 'the nonce is a random (v4) UUID from the database');
select is((select token_nonce from public.quotes where id = :'q'), :'n'::uuid, 'and is the stored nonce');
select pg_temp.quote_token(:'q') as tok \gset
select ok(:'tok' ~ '^[A-Za-z0-9_-]{43}$', 'the token is 43 URL-safe characters (256 bits)');
select is((select token_hash from public.quotes where id = :'q'), sha256(convert_to(:'tok', 'UTF8')), 'only SHA-256(token) is stored');
select is((select link_version from public.quotes where id = :'q'), 2::smallint, 'link version 2');
select ok((select q::text from public.quotes q where id = :'q') not like '%' || :'tok' || '%', 'the raw token is not in the quote row');
select ok(not exists (select 1 from public.activity_events e where e.quote_id = :'q' and e::text like '%' || :'tok' || '%'),
  'nor in the history');
select is(app.quote_link_token('00000000-0000-4000-8000-000000000000', sha256('k'::bytea)), 'lt4hjBBFo6wyQmi6QL7xhicb3XN57l3XBsGJkyEDOGw',
  'derivation matches the server (fixed vector computed with node:crypto)');
-- Sending again keeps the same link, whatever key is passed.
select pg_temp.as_user(:'owner_a');
select is(public.send_quote(:'q', sha256('another key'::bytea)), :'n'::uuid, 'sending again returns the same nonce');
reset role;
select is((select token_hash from public.quotes where id = :'q'), sha256(convert_to(:'tok', 'UTF8')), 'and keeps the same token');

-- Even with one fixed (or caller-known) key, every quote gets different randomness.
select pg_temp.as_user(:'owner_a');
create temp table sent_many as select public.send_quote(pg_temp.new_quote(), sha256('same key for all'::bytea)) as nonce from generate_series(1, 25);
reset role;
select is((select count(distinct nonce)::int from sent_many), 25, '25 sends with the same key: 25 different nonces');
select is((select count(distinct q.token_hash)::int from public.quotes q join sent_many s on s.nonce = q.token_nonce), 25, 'and 25 different tokens');

-- ---- The customer's view never shows link material -----------------------------------------
select pg_temp.as_booking_api();
select public_api.get_quote(pg_temp.quote_hash(:'q'), sha256('lt-ip-1'::bytea)) as view \gset
reset role;
select ok(:'view' not like '%' || :'n' || '%' and :'view' not like '%' || :'tok' || '%' and :'view' not like '%PRIVATE%',
  'the view has no nonce, token or internal notes');
select is((:'view'::jsonb) ->> 'status', 'sent', 'the link works');

-- ---- Uniqueness -------------------------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select pg_temp.new_quote() as q2 \gset
reset role;
select throws_ok(format($$update public.quotes set status = 'sent', sent_at = now(), token_nonce = gen_random_uuid(), link_version = 2,
                                                 token_hash = (select token_hash from public.quotes where id = %L) where id = %L$$, :'q', :'q2'),
  '23505', null, 'two quotes can never share a token hash');
select throws_ok(format($$update public.quotes set status = 'sent', sent_at = now(), token_nonce = %L, link_version = 2,
                                                 token_hash = sha256('unique'::bytea) where id = %L$$, :'n', :'q2'),
  '23505', null, 'or a nonce');
select throws_ok(format($$update public.quotes set status = 'sent', sent_at = now(), token_nonce = gen_random_uuid(), link_version = null,
                                                 token_hash = sha256('no-version'::bytea) where id = %L$$, :'q2'),
  '23514', null, 'a stored link always records its version');

-- ---- Validation -------------------------------------------------------------------------------
select pg_temp.as_booking_api();
select is(public_api.get_quote(null, sha256('lt-ip-2'::bytea)) #>> '{error,code}', 'DH003', 'no token: refused');
select is(public_api.get_quote(substring(pg_temp.quote_hash(:'q') from 2), sha256('lt-ip-2'::bytea)) #>> '{error,code}', 'DH003', 'a 31-byte hash: refused');
select is(public_api.get_quote(pg_temp.quote_hash(:'q'), '\x01'::bytea) #>> '{error,code}', 'DH003', 'a malformed client hash: refused');
select is(public_api.get_quote(sha256(convert_to(upper(:'tok'), 'UTF8')), sha256('lt-ip-2'::bytea)) #>> '{error,code}', 'DH003',
  'a near-miss token (case changed): refused');
-- Guessing is rate-limited: 10 failed lookups from one address, then even a valid link is refused there.
select public_api.get_quote(sha256(('guess-' || g)::bytea), sha256('lt-ip-guess'::bytea)) from generate_series(1, 10) g;
select is(public_api.get_quote(pg_temp.quote_hash(:'q'), sha256('lt-ip-guess'::bytea)) #>> '{error,code}', 'DH005', 'guessing from one address is locked out');
select is(public_api.get_quote(pg_temp.quote_hash(:'q'), sha256('lt-ip-other'::bytea)) ->> 'status', 'sent', 'other addresses are unaffected');
reset role;

-- ---- Revocation: withdraw kills the link; re-sending makes a new one -------------------------
select pg_temp.quote_hash(:'q') as old_hash \gset
select pg_temp.as_user(:'owner_a');
select public.withdraw_quote(:'q');
reset role;
select ok((select token_hash is null and token_nonce is null and link_version is null from public.quotes where id = :'q'), 'withdraw clears the hash, nonce and version');
select pg_temp.as_booking_api();
select is(public_api.get_quote(:'old_hash'::bytea, sha256('lt-ip-3'::bytea)) #>> '{error,code}', 'DH003', 'the withdrawn link no longer opens');
select is(public_api.accept_quote(:'old_hash'::bytea, sha256('lt-ip-3'::bytea)) #>> '{error,code}', 'DH003', 'or accepts');
reset role;
select pg_temp.as_user(:'owner_a');
select public.send_quote(:'q', pg_temp.link_key()) as n2 \gset
reset role;
select isnt(:'n2'::uuid, :'n'::uuid, 're-sending makes a new nonce');
select isnt(pg_temp.quote_hash(:'q'), :'old_hash'::bytea, 'and a new token');
select pg_temp.as_booking_api();
select is(public_api.get_quote(:'old_hash'::bytea, sha256('lt-ip-4'::bytea)) #>> '{error,code}', 'DH003', 'the old link stays dead');
select is(public_api.get_quote(pg_temp.quote_hash(:'q'), sha256('lt-ip-4'::bytea)) ->> 'status', 'sent', 'the new link works');
reset role;

-- ---- Business status: no answers while the business can't operate ---------------------------
update public.businesses set account_status = 'suspended' where id = :'a';
select pg_temp.as_booking_api();
select is(public_api.accept_quote(pg_temp.quote_hash(:'q'), sha256('lt-ip-5'::bytea)) #>> '{error,message}', 'this business is not taking answers right now',
  'a suspended business''s quote cannot be accepted');
select is(public_api.decline_quote(pg_temp.quote_hash(:'q'), sha256('lt-ip-5'::bytea)) #>> '{error,code}', 'DH002', 'or declined');
reset role;
select is((select status::text from public.quotes where id = :'q'), 'sent', 'and nothing changed');
update public.businesses set account_status = 'active' where id = :'a';

-- ---- Expiry: valid through its last day, then expired -----------------------------------------
select pg_temp.as_user(:'owner_a');
select pg_temp.new_quote(0) as q_today \gset
select public.send_quote(:'q_today', pg_temp.link_key());
reset role;
select pg_temp.as_booking_api();
select is(public_api.accept_quote(pg_temp.quote_hash(:'q_today'), sha256('lt-ip-6'::bytea)) ->> 'status', 'accepted', 'a quote is still valid on its last day');
select is(public_api.accept_quote(pg_temp.quote_hash(:'q'), sha256('lt-ip-6'::bytea)) ->> 'status', 'accepted', 'and an open quote accepts');
reset role;

-- ---- Links sent before migration 15 (version 1) keep working ---------------------------------
select pg_temp.as_user(:'owner_a');
select pg_temp.new_quote() as q_v1 \gset
reset role;
update public.quotes set status = 'sent', sent_at = now(), token_nonce = gen_random_uuid(), link_version = 1,
                         token_hash = sha256('legacy-v1-token'::bytea) where id = :'q_v1';
select pg_temp.as_booking_api();
select is(public_api.get_quote(sha256('legacy-v1-token'::bytea), sha256('lt-ip-7'::bytea)) ->> 'status', 'sent', 'a version 1 link still opens');
reset role;

select * from finish();
rollback;
