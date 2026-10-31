-- Phase 5 security review: owners can't bypass the quote functions with direct writes; one business
-- can't read or change another's leads, quotes, customers or vehicles; the public quote link exposes
-- only the allow-listed fields; expired, repeated and conflicting answers and duplicate bookings are
-- refused. Runs in a transaction that is rolled back.
begin;
\ir _helpers.psql
select plan(80);

select pg_temp.make_business('qs-a@example.com', 'qs-a', 'mobile') as a \gset
select pg_temp.make_business('qs-b@example.com', 'qs-b', 'mobile') as b \gset
select pg_temp.owner_of(:'a') as owner_a \gset
select pg_temp.owner_of(:'b') as owner_b \gset
select pg_temp.service_id(:'a', 'Full detail') as full_a \gset
select pg_temp.size_class_id(:'a') as car_a \gset
create function pg_temp.today_plus(p_days int) returns date language sql as $$ select (now() at time zone 'America/Chicago')::date + p_days $$;
grant execute on function pg_temp.today_plus(int) to authenticated;
create function pg_temp.t(p_days int, p_time text) returns timestamptz language sql as $$
  select ((now() at time zone 'America/Chicago')::date + p_days + p_time::time) at time zone 'America/Chicago' $$;
grant execute on function pg_temp.t(int, text) to authenticated;

-- Business A: a lead, and a quote for a new customer and vehicle with an internal note, sent.
select pg_temp.as_user(:'owner_a');
insert into public.leads (business_id, source, contact_first_name, contact_phone_e164) values (:'a', 'phone', 'Avery', '+15125550401')
returning id as lead_a \gset
select public.save_quote(null,
  jsonb_build_object('lead_id', :'lead_a', 'valid_until', pg_temp.today_plus(14), 'notes', 'Customer-facing note',
                     'internal_notes', 'SECRET-INTERNAL margin note'),
  null, '{"first_name":"Avery","last_name":"Private-Lastname","phone_e164":"+15125550401","email":"avery.private@example.com"}',
  null, '{"make":"Honda","model":"Pilot"}',
  '[{"name":"Full detail","quantity":1,"price_cents":20000,"duration_min":120}]') as qa \gset
select public.send_quote(:'qa', pg_temp.link_key());
select pg_temp.quote_hash(:'qa') as ha \gset
select public.save_quote(null, jsonb_build_object('valid_until', pg_temp.today_plus(14)), null, '{"first_name":"Drew","phone_e164":"+15125550402"}',
  null, '{"make":"Ford","model":"Ranger"}', '[{"name":"Wash","quantity":1,"price_cents":5000}]') as qa_draft \gset
reset role;
select customer_id as cust_a, vehicle_id as veh_a from public.quotes where id = :'qa' \gset

-- Business B: its own customer, vehicle and lead.
insert into public.customers (business_id, first_name, phone_e164) values (:'b', 'Blake', '+15125550501') returning id as cust_b \gset
insert into public.vehicles (business_id, customer_id, make, model) values (:'b', :'cust_b', 'Kia', 'Soul') returning id as veh_b \gset
insert into public.leads (business_id, source, contact_first_name, contact_phone_e164) values (:'b', 'phone', 'Blake', '+15125550501')
returning id as lead_b \gset

-- ---- 1. Direct writes by the owning business are refused (functions only) ------------------------
select pg_temp.as_user(:'owner_a');
select throws_ok(format($$update public.quotes set status = 'accepted', decided_at = now() where id = %L$$, :'qa'), '42501', null, 'owner cannot mark a quote accepted');
select throws_ok(format($$update public.quotes set status = 'converted' where id = %L$$, :'qa'), '42501', null, 'owner cannot mark a quote converted');
select throws_ok(format($$update public.quotes set subtotal_cents = 1, discount_cents = 0 where id = %L$$, :'qa'), '42501', null, 'owner cannot change amounts directly');
select throws_ok(format($$update public.quotes set token_hash = sha256('guessable'::bytea) where id = %L$$, :'qa'), '42501', null, 'owner cannot set a link hash directly');
select throws_ok(format($$update public.quotes set customer_id = null, vehicle_id = null where id = %L$$, :'qa'), '42501', null, 'owner cannot re-point a quote directly');
select throws_ok(format($$update public.quotes set decided_at = now(), sent_at = now() where id = %L$$, :'qa'), '42501', null, 'owner cannot forge timestamps');
select throws_ok(format($$insert into public.quotes (business_id, status, sent_at) values (%L, 'accepted', now())$$, :'a'), '42501', null, 'owner cannot insert quotes');
select throws_ok(format($$delete from public.quotes where id = %L$$, :'qa'), '42501', null, 'owner cannot delete quotes directly');
select throws_ok(format($$insert into public.quote_items (business_id, quote_id, name, quantity, price_cents) values (%L, %L, 'Extra', 1, 1)$$, :'a', :'qa'),
  '42501', null, 'owner cannot add items to a sent quote directly');
select throws_ok(format($$update public.quote_items set price_cents = 1 where quote_id = %L$$, :'qa'), '42501', null, 'owner cannot reprice items directly');
select throws_ok(format($$delete from public.quote_items where quote_id = %L$$, :'qa'), '42501', null, 'owner cannot delete items directly');
select throws_ok(format($$insert into public.appointments (business_id, resource_id, customer_id, vehicle_id, quote_id, starts_at, ends_at, location_type, service_address_line1)
                         values (%L, %L, %L, %L, %L, now() + interval '3 days', now() + interval '3 days 2 hours', 'mobile', 'x')$$,
                        :'a', pg_temp.resource_id(:'a'), :'cust_a', :'veh_a', :'qa'),
  '42501', null, 'owner cannot create a booking for a quote directly');
select throws_ok(format($$insert into public.activity_events (business_id, quote_id, kind, to_status, actor_type) values (%L, %L, 'quote_status_changed', 'accepted', 'customer')$$, :'a', :'qa'),
  '42501', null, 'owner cannot forge a "customer accepted" history entry');
-- The customer-side functions are not callable by owners.
select throws_ok(format($$select app.quote_action_core('accept', sha256('x'::bytea), sha256('ip'::bytea))$$), '42501', null, 'owner cannot call the accept core');
select throws_ok($$select app.quote_token_call('accept', sha256('x'::bytea), sha256('ip'::bytea))$$, '42501', null, 'owner cannot call the token wrapper');
select throws_ok($$select app.quote_by_token(sha256('x'::bytea), sha256('ip'::bytea), false)$$, '42501', null, 'owner cannot look up by token');
select throws_ok($$select public_api.accept_quote(sha256('x'::bytea), sha256('ip'::bytea))$$, '42501', null, 'owner cannot call the public accept');
select throws_ok(format($$select app.owner_customer_vehicle(%L, null, '{"first_name":"x"}', null, null, 'phone')$$, :'b'), '42501', null, 'owner cannot call the shared customer helper');
-- What owners may change directly: private notes and follow-ups, which never touch status or price.
update public.quotes set internal_notes = 'updated note', next_follow_up_at = now() + interval '2 days' where id = :'qa';
reset role;
select ok((select status = 'sent' and total_cents = 20000 and internal_notes = 'updated note' from public.quotes where id = :'qa'),
  'private notes editable; status and total unchanged');
select is((select count(*)::int from public.quotes where id = :'qa' and status <> 'sent'), 0, 'every refused write left the quote sent');
select is((select count(*)::int from public.quote_items where quote_id = :'qa'), 1, 'and its items intact');

-- ---- 2. Cross-business: B cannot read or change A's leads, quotes, customers or vehicles --------
select pg_temp.as_user(:'owner_b');
select is((select count(*)::int from public.quotes where business_id = :'a'), 0, 'B reads no A quotes');
select is((select count(*)::int from public.quote_items where business_id = :'a'), 0, 'B reads no A quote items');
select is((select count(*)::int from public.leads where business_id = :'a'), 0, 'B reads no A leads');
select is((select count(*)::int from public.customers where business_id = :'a'), 0, 'B reads no A customers');
select is((select count(*)::int from public.vehicles where business_id = :'a'), 0, 'B reads no A vehicles');
select is((select count(*)::int from public.activity_events where business_id = :'a'), 0, 'B reads no A history');
update public.quotes set internal_notes = 'B was here', next_follow_up_at = now() where id = :'qa';
update public.leads set notes = 'B was here', status = 'lost', lost_reason = 'other' where id = :'lead_a';
update public.customers set first_name = 'B was here' where id = :'cust_a';
update public.vehicles set make = 'B was here' where id = :'veh_a';
delete from public.leads where id = :'lead_a';
delete from public.vehicles where id = :'veh_a';
select throws_ok(format($$insert into public.leads (business_id, source, contact_first_name, contact_phone_e164) values (%L, 'phone', 'Spam', '+15125550999')$$, :'a'),
  '42501', null, 'B cannot add a lead to A');
select throws_ok(format($$update public.leads set business_id = %L where id = %L$$, :'a', :'lead_b'), 'DH004', 'business_id cannot be changed', 'B cannot move its lead into A');
select throws_ok(format($$update public.leads set customer_id = %L where id = %L$$, :'cust_a', :'lead_b'), '23503', null, 'B cannot link its lead to A''s customer');
select throws_ok(format($$insert into public.leads (business_id, source, contact_first_name, customer_id) values (%L, 'phone', 'X', %L)$$, :'b', :'cust_a'),
  '23503', null, 'B cannot create a lead for A''s customer');
select throws_ok(format($$insert into public.vehicles (business_id, customer_id, make, model) values (%L, %L, 'X', 'Y')$$, :'b', :'cust_a'),
  '23503', null, 'B cannot add a vehicle to A''s customer');
-- Every B function call with an A id answers "not found" (the same as an id that doesn't exist).
select throws_ok(format($$select public.send_quote(%L, pg_temp.link_key())$$, :'qa_draft'), 'DH003', 'quote not found', 'B cannot send A''s quote');
select throws_ok(format($$select public.withdraw_quote(%L)$$, :'qa'), 'DH003', 'quote not found', 'B cannot withdraw A''s quote');
select throws_ok(format($$select public.delete_quote(%L)$$, :'qa_draft'), 'DH002', null, 'B cannot delete A''s draft');
select throws_ok(format($$select public.convert_quote(%L, now() + interval '3 days', 'mobile', '{"line1":"x"}')$$, :'qa'), 'DH003', 'quote not found', 'B cannot book A''s quote');
select throws_ok(format($$select public.complete_follow_up(null, %L)$$, :'qa'), 'DH002', null, 'B cannot complete A''s quote follow-up');
select throws_ok(format($$select public.complete_follow_up(%L, null)$$, :'lead_a'), 'DH002', null, 'B cannot complete A''s lead follow-up');
select throws_ok(format($$select public.log_lead_activity(%L, 'contacted', null, 'phone')$$, :'lead_a'), 'DH003', 'lead not found', 'B cannot log contact on A''s lead');
select throws_ok(format($$select public.convert_lead_to_customer(%L, %L)$$, :'lead_b', :'cust_a'), 'DH003', 'customer not found', 'B cannot link its lead to A''s customer via the function');
select throws_ok(format($$select public.save_quote(%L, '{}', %L, null, %L, null, '[{"name":"X","quantity":1,"price_cents":1}]')$$, :'qa_draft', :'cust_b', :'veh_b'),
  'DH003', 'quote not found', 'B cannot overwrite A''s draft');
select throws_ok(format($$select public.save_quote(null, '{}', %L, null, %L, null, '[{"name":"X","quantity":1,"price_cents":1}]')$$, :'cust_a', :'veh_a'),
  'DH003', 'customer not found', 'B cannot quote A''s customer');
select throws_ok(format($$select public.save_quote(null, '{}', %L, null, %L, null, '[{"name":"X","quantity":1,"price_cents":1}]')$$, :'cust_b', :'veh_a'),
  'DH003', 'vehicle not found for this customer', 'B cannot quote A''s vehicle');
select throws_ok(format($$select public.save_quote(null, %L, %L, null, %L, null, '[{"name":"X","quantity":1,"price_cents":1}]')$$, jsonb_build_object('lead_id', :'lead_a'), :'cust_b', :'veh_b'),
  'DH003', 'lead not found', 'B cannot attach A''s lead');
select throws_ok(format($$select public.save_quote(null, '{}', %L, null, %L, null, %L)$$, :'cust_b', :'veh_b',
                        jsonb_build_array(jsonb_build_object('service_id', :'full_a', 'name', 'X', 'quantity', 1, 'price_cents', 1))),
  'DH004', 'unknown service or vehicle size', 'B cannot use A''s service');
select throws_ok(format($$select public.save_quote(null, '{}', %L, null, null, %L, '[{"name":"X","quantity":1,"price_cents":1}]')$$, :'cust_b',
                        jsonb_build_object('make', 'X', 'model', 'Y', 'size_class_id', :'car_a')),
  'DH004', 'unknown service or vehicle size', 'B cannot use A''s vehicle size');
reset role;
select ok((select internal_notes = 'updated note' from public.quotes where id = :'qa'), 'A''s quote untouched by B');
select ok((select notes is null and status = 'quote_sent' from public.leads where id = :'lead_a'), 'A''s lead untouched and not deleted by B');
select ok((select first_name = 'Avery' from public.customers where id = :'cust_a'), 'A''s customer untouched by B');
select ok((select make = 'Honda' from public.vehicles where id = :'veh_a'), 'A''s vehicle untouched and not deleted by B');
select ok(exists (select 1 from public.quotes where id = :'qa_draft' and status = 'draft'), 'A''s draft not deleted by B');
select is((select count(*)::int from public.quotes where business_id = :'b'), 0, 'no stray quote created for B by the refused calls');

-- ---- 3. Anonymous and booking_api roles have no table access ------------------------------------
select pg_temp.as_anon();
select throws_ok('select 1 from public.quotes limit 1', '42501', null, 'anon cannot read quotes');
select throws_ok($$select public_api.get_quote(sha256('x'::bytea), sha256('ip'::bytea))$$, '42501', null, 'anon cannot call the quote API directly');
reset role;
select pg_temp.as_booking_api();
select throws_ok('select 1 from public.quotes limit 1', '42501', null, 'booking_api cannot read the quotes table');
select throws_ok('select 1 from public.customers limit 1', '42501', null, 'booking_api cannot read customers');
select throws_ok(format($$select public.save_quote(null, '{}', null, null, null, null, '[]')$$), '42501', null, 'booking_api cannot call owner functions');

-- ---- 4. The link shows only the allow-listed fields ---------------------------------------------
select public_api.get_quote(:'ha'::bytea, sha256('ip-view'::bytea)) as view \gset
reset role;
select is((select array_agg(k order by k) from jsonb_object_keys(:'view'::jsonb) k),
  array['business','customer_first_name','decided_at','discount_cents','items','notes','number','proposed_start','sent_at','status',
        'subtotal_cents','terms','total_cents','valid_until','vehicle'], 'exactly the allow-listed fields');
select is((select array_agg(k order by k) from jsonb_object_keys(:'view'::jsonb -> 'business') k), array['name','phone','slug','timezone'],
  'business: public contact fields only');
select is((select array_agg(distinct k order by k) from jsonb_array_elements(:'view'::jsonb -> 'items') i, jsonb_object_keys(i) k),
  array['description','name','price_cents','quantity'], 'items: no ids, durations or service links');
select ok(:'view' not like '%SECRET%' and :'view' not like '%updated note%', 'no internal notes');
select ok(:'view' not like '%Private-Lastname%' and :'view' not like '%avery.private%' and :'view' not like '%5550401%',
  'no customer last name, email or phone');
select ok(:'view' not like '%' || :'qa' || '%' and :'view' not like '%' || :'cust_a' || '%' and :'view' not like '%' || :'a' || '%',
  'no quote, customer or business ids');

-- ---- 5. Answers: wrong, repeated, conflicting, expired ----------------------------------------
select pg_temp.as_booking_api();
select is(public_api.accept_quote(sha256('qs-token-x'::bytea), sha256('ip-1'::bytea)) -> 'error' ->> 'code', 'DH003', 'unknown token refused');
select is(public_api.accept_quote('\x00'::bytea, sha256('ip-1'::bytea)) -> 'error' ->> 'code', 'DH003', 'malformed token refused');
select is(public_api.accept_quote(:'ha'::bytea, sha256('ip-2'::bytea)) ->> 'status', 'accepted', 'customer accepts');
reset role;
select decided_at as first_decided from public.quotes where id = :'qa' \gset
select pg_temp.as_booking_api();
select is(public_api.accept_quote(:'ha'::bytea, sha256('ip-3'::bytea)) ->> 'already', 'true', 'accepting again is a no-op');
select is(public_api.decline_quote(:'ha'::bytea, sha256('ip-4'::bytea)) -> 'error' ->> 'code', 'DH002', 'an accepted quote cannot then be declined');
reset role;
select ok((select status = 'accepted' and decided_at = :'first_decided'::timestamptz from public.quotes where id = :'qa'), 'still accepted, decision time unchanged');
select is((select count(*)::int from public.activity_events where quote_id = :'qa' and to_status = 'accepted'), 1, 'one acceptance in the history');
select is((select actor_type::text from public.activity_events where quote_id = :'qa' and to_status = 'accepted'), 'customer', 'recorded as the customer');

-- An expired quote: past its date it can't be accepted, and the expiry is stored.
select pg_temp.as_user(:'owner_a');
select public.send_quote(:'qa_draft', pg_temp.link_key());
select pg_temp.quote_hash(:'qa_draft') as hb \gset
reset role;
update public.quotes set valid_until = pg_temp.today_plus(-1) where id = :'qa_draft';
select pg_temp.as_booking_api();
select is(public_api.get_quote(:'hb'::bytea, sha256('ip-5'::bytea)) ->> 'status', 'expired', 'shown as expired');
select is(public_api.accept_quote(:'hb'::bytea, sha256('ip-6'::bytea)) ->> 'status', 'expired', 'acceptance refused: expired');
select is(public_api.accept_quote(:'hb'::bytea, sha256('ip-7'::bytea)) -> 'error' ->> 'code', 'DH002', 'and stays refused');
reset role;
select ok((select status = 'expired' and decided_at is null from public.quotes where id = :'qa_draft'), 'stored as expired, never accepted');

-- ---- 6. Conversion: only accepted quotes, only once ---------------------------------------------
select pg_temp.as_user(:'owner_a');
select throws_ok(format($$select public.convert_quote(%L, %L, 'mobile', '{"line1":"1 Main St"}')$$, :'qa_draft', pg_temp.t(5, '09:00')),
  'DH002', 'only accepted quotes can be booked', 'an expired quote cannot be booked');
select lives_ok(format($$select public.convert_quote(%L, %L, 'mobile', '{"line1":"1 Main St"}')$$, :'qa', pg_temp.t(5, '09:00')), 'the accepted quote books');
select throws_ok(format($$select public.convert_quote(%L, %L, 'mobile', '{"line1":"1 Main St"}')$$, :'qa', pg_temp.t(6, '09:00')),
  'DH002', 'this quote is already booked', 'booking it again is refused');
reset role;
select throws_ok(format($$insert into public.appointments (business_id, resource_id, customer_id, vehicle_id, quote_id, starts_at, ends_at, location_type, service_address_line1)
                         values (%L, %L, %L, %L, %L, %L, %L, 'mobile', 'x')$$,
                        :'a', pg_temp.resource_id(:'a'), :'cust_a', :'veh_a', :'qa', pg_temp.t(7, '09:00'), pg_temp.t(7, '11:00')),
  '23505', null, 'even a privileged second booking for the quote is refused');
select is((select count(*)::int from public.appointments where quote_id = :'qa'), 1, 'exactly one booking for the quote');

select * from finish();
rollback;
