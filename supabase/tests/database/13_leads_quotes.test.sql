-- Phase 5: leads and quotes (migration 14). Mobile business A (capacity 1, hours 06–22, no
-- notice, 30-minute buffer); 'Full detail' $260 / 2 h.
begin;
\ir _helpers.psql
select plan(78);

select pg_temp.make_business('lq-a@example.com', 'lq-a', 'mobile') as a \gset
select pg_temp.make_business('lq-b@example.com', 'lq-b', 'mobile') as b \gset
select pg_temp.owner_of(:'a') as owner_a \gset
select pg_temp.owner_of(:'b') as owner_b \gset
select pg_temp.service_id(:'a', 'Full detail') as full_a \gset
select pg_temp.service_id(:'b', 'Full detail') as full_b \gset
select pg_temp.size_class_id(:'a') as car_a \gset
create function pg_temp.t(p_days int, p_time text) returns timestamptz language sql as $$
  select ((now() at time zone 'America/Chicago')::date + p_days + p_time::time) at time zone 'America/Chicago' $$;
grant execute on function pg_temp.t(int, text) to authenticated;
create function pg_temp.today_plus(p_days int) returns date language sql as $$ select (now() at time zone 'America/Chicago')::date + p_days $$;
grant execute on function pg_temp.today_plus(int) to authenticated;

-- ---- Leads ------------------------------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
insert into public.leads (business_id, source, contact_first_name, contact_last_name, contact_phone_e164, contact_email,
                          vehicle_year, vehicle_make, vehicle_model, size_class_id, service_id, request_text, notes)
values (:'a', 'website', 'Jordan', 'Reyes', '+15125550142', 'jordan@example.com', 2021, 'Tesla', 'Model Y', :'car_a', :'full_a',
        'Ceramic coat + interior', 'Prefers mornings')
returning id as lead1 \gset
reset role;
select is((select kind from public.activity_events where lead_id = :'lead1'), 'lead_created', 'creating a lead is recorded');
select pg_temp.as_user(:'owner_a');
select lives_ok(format($$select public.log_lead_activity(%L, 'contacted', 'Left a voicemail', 'phone')$$, :'lead1'), 'log a call');
reset role;
select ok((select status = 'contacted' and last_contacted_at is not null from public.leads where id = :'lead1'), 'contacting a new lead marks it contacted');
select is((select metadata ->> 'note' from public.activity_events where lead_id = :'lead1' and kind = 'lead_contacted'), 'Left a voicemail', 'contact note kept');
select is((select count(*)::int from public.activity_events where lead_id = :'lead1' and kind = 'lead_status_changed'), 1, 'and the status change is in the history');
select pg_temp.as_user(:'owner_a');
select throws_ok(format($$select public.log_lead_activity(%L, 'note', '  ')$$, :'lead1'), 'DH004', 'invalid activity', 'empty note refused');
select throws_ok(format($$update public.leads set status = 'lost' where id = %L$$, :'lead1'), '23514', null, 'a lost lead needs a reason');
-- Follow-up: set directly, complete through the function.
update public.leads set next_follow_up_at = now() + interval '1 day', follow_up_note = 'Send quote' where id = :'lead1';
select lives_ok(format($$select public.complete_follow_up(%L, null, 'Called back')$$, :'lead1'), 'complete a follow-up');
select throws_ok(format($$select public.complete_follow_up(%L, null)$$, :'lead1'), 'DH002', 'there is no follow-up to complete', 'nothing left to complete');
reset role;
select ok((select next_follow_up_at is null and follow_up_note is null from public.leads where id = :'lead1'), 'follow-up cleared');
select is((select metadata ->> 'note' from public.activity_events where lead_id = :'lead1' and kind = 'follow_up_done'), 'Called back', 'and recorded');

-- B can't see or touch A's lead.
select pg_temp.as_user(:'owner_b');
select is((select count(*)::int from public.leads where id = :'lead1'), 0, 'B cannot read A''s lead');
update public.leads set notes = 'hijack' where id = :'lead1';
select throws_ok(format($$select public.log_lead_activity(%L, 'note', 'x')$$, :'lead1'), 'DH003', 'lead not found', 'B cannot log on A''s lead');
select throws_ok(format($$select public.convert_lead_to_customer(%L)$$, :'lead1'), 'DH003', 'lead not found', 'B cannot convert A''s lead');
reset role;
select is((select notes from public.leads where id = :'lead1'), 'Prefers mornings', 'A''s lead unchanged');

-- Convert the lead to a customer (new records from the lead; idempotent).
select pg_temp.as_user(:'owner_a');
select public.convert_lead_to_customer(:'lead1') as cust1 \gset
select is(public.convert_lead_to_customer(:'lead1'), :'cust1'::uuid, 'converting twice returns the same customer');
reset role;
select ok((select c.first_name = 'Jordan' and c.email = 'jordan@example.com' and c.source = 'website'
                  and v.make = 'Tesla' and v.size_class_id = :'car_a' and l.customer_id = c.id and l.vehicle_id = v.id
             from public.leads l join public.customers c on c.id = l.customer_id join public.vehicles v on v.id = l.vehicle_id
            where l.id = :'lead1'), 'customer and vehicle created from the lead and linked');
-- Link a second lead to an existing customer instead.
insert into public.customers (business_id, first_name, phone_e164) values (:'a', 'Dana', '+15125550301') returning id as dana \gset
insert into public.vehicles (business_id, customer_id, make, model) values (:'a', :'dana', 'Toyota', 'Tacoma') returning id as tacoma \gset
insert into public.leads (business_id, source, contact_first_name, contact_phone_e164) values (:'a', 'referral', 'Dana', '+15125550301') returning id as lead2 \gset
select pg_temp.as_user(:'owner_a');
select is(public.convert_lead_to_customer(:'lead2', :'dana'), :'dana'::uuid, 'link a lead to an existing customer');
reset role;
select is((select count(*)::int from public.customers where business_id = :'a' and phone_e164 = '+15125550301'), 1, 'no duplicate customer');

-- ---- Quotes: build ------------------------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select public.save_quote(null,
  jsonb_build_object('lead_id', :'lead1', 'valid_until', pg_temp.today_plus(14), 'notes', 'Full ceramic package',
                     'terms', '50% at drop-off', 'internal_notes', 'Margin is thin — no further discount', 'discount_cents', 5000),
  :'cust1', null, (select vehicle_id from public.leads where id = :'lead1'), null,
  jsonb_build_array(
    jsonb_build_object('service_id', :'full_a', 'name', 'Full detail', 'quantity', 1, 'price_cents', 26000, 'duration_min', 120),
    jsonb_build_object('name', 'Ceramic coating (3-year)', 'description', 'Paint correction + coating', 'quantity', 1, 'price_cents', 90000, 'duration_min', 360),
    jsonb_build_object('name', 'Wheel coating', 'quantity', 4, 'price_cents', 2500, 'duration_min', 15))) as q1 \gset
reset role;
select is((select array[subtotal_cents, discount_cents, total_cents] from public.quotes where id = :'q1'), array[126000, 5000, 121000],
  'subtotal = sum(price × qty) incl. custom lines; total = subtotal − discount');
select is((select status::text from public.quotes where id = :'q1'), 'draft', 'new quotes are drafts');
select is((select vehicle_text from public.quotes where id = :'q1'), '2021 Tesla Model Y', 'vehicle shown on the quote');
-- Catalog changes never touch the quote.
update public.services set base_price_cents = 99900 where id = :'full_a';
select is((select price_cents from public.quote_items where quote_id = :'q1' and name = 'Full detail'), 26000, 'later catalog price changes don''t alter the quote');

select pg_temp.as_user(:'owner_a');
select throws_ok(format($$select public.save_quote(%L, '{"discount_cents": 999999}', %L, null, %L, null, '[{"name":"X","quantity":1,"price_cents":100}]')$$,
                        :'q1', :'cust1', (select vehicle_id from public.quotes where id = :'q1')),
  'DH004', 'discount is more than the subtotal', 'discount above the subtotal refused');
select throws_ok(format($$select public.save_quote(%L, '{}', %L, null, %L, null, '[]')$$, :'q1', :'cust1', (select vehicle_id from public.quotes where id = :'q1')),
  'DH004', 'add between 1 and 50 line items', 'a quote needs line items');
select throws_ok(format($$select public.save_quote(%L, '{}', %L, null, %L, null, '[{"name":"X","quantity":0,"price_cents":100}]')$$, :'q1', :'cust1', (select vehicle_id from public.quotes where id = :'q1')),
  'DH004', 'invalid details', 'quantity must be 1–99');
select throws_ok(format($$select public.save_quote(%L, '{}', %L, null, %L, null, '[{"name":"X","quantity":1,"price_cents":-1}]')$$, :'q1', :'cust1', (select vehicle_id from public.quotes where id = :'q1')),
  'DH004', 'invalid details', 'negative prices refused');
select throws_ok(format($$select public.save_quote(%L, '{}', %L, null, %L, null, '[{"service_id":"%s","name":"X","quantity":1,"price_cents":1}]')$$,
                        :'q1', :'cust1', (select vehicle_id from public.quotes where id = :'q1'), :'full_b'),
  'DH004', 'unknown service or vehicle size', 'another business''s service refused');
reset role;
select is((select total_cents from public.quotes where id = :'q1'), 121000, 'refused saves change nothing');

-- New customer + new vehicle in the quote builder.
select pg_temp.as_user(:'owner_a');
select public.save_quote(null, jsonb_build_object('valid_until', pg_temp.today_plus(7)), null,
  '{"first_name":"Sam","phone_e164":"+15125550199"}', null, '{"make":"Ford","model":"F-150","year":2020}',
  '[{"name":"Fleet wash","quantity":3,"price_cents":4500,"duration_min":0}]') as q2 \gset
reset role;
select ok((select c.first_name = 'Sam' and v.make = 'Ford' and q.total_cents = 13500
             from public.quotes q join public.customers c on c.id = q.customer_id join public.vehicles v on v.id = q.vehicle_id
            where q.id = :'q2'), 'quote with a new customer and vehicle');

-- Direct writes are refused: decisions only through functions (customer's link, owner functions).
select pg_temp.as_user(:'owner_a');
select throws_ok(format($$update public.quotes set status = 'sent', sent_at = now() where id = %L$$, :'q1'), '42501', null, 'owners cannot set a quote''s status directly');
select throws_ok(format($$insert into public.quotes (business_id, number, status, sent_at) values (%L, 0, 'accepted', now())$$, :'a'), '42501', null, 'owners cannot insert quotes directly');
select throws_ok(format($$update public.quote_items set price_cents = 1 where quote_id = %L$$, :'q1'), '42501', null, 'owners cannot edit items directly');
select lives_ok(format($$update public.quotes set internal_notes = 'Call Tue', next_follow_up_at = now() + interval '2 days' where id = %L$$, :'q1'),
  'private notes and follow-ups stay directly editable');
reset role;

-- ---- Send ---------------------------------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select public.save_quote(null, jsonb_build_object('valid_until', pg_temp.today_plus(-1)), :'dana', null, :'tacoma', null,
  '[{"name":"Wash","quantity":1,"price_cents":5000}]') as q_old \gset
select throws_ok(format($$select public.send_quote(%L, pg_temp.link_key())$$, :'q_old'), 'DH004', 'set an expiry date from today on',
  'a quote whose expiry date has passed cannot be sent');
select public.send_quote(:'q1', pg_temp.link_key()) as n1 \gset
select pg_temp.quote_hash(:'q1') as h1 \gset
select ok(:'n1'::uuid is not null, 'send a quote');
select is(public.send_quote(:'q1', sha256('other'::bytea)), :'n1'::uuid, 'sending again keeps the same link');
select throws_ok(format($$select public.save_quote(%L, '{}', %L, null, %L, null, '[{"name":"X","quantity":1,"price_cents":1}]')$$, :'q1', :'cust1', (select vehicle_id from public.quotes where id = :'q1')),
  'DH002', 'only draft quotes can be edited', 'a sent quote is frozen');
reset role;
select ok((select status = 'sent' and sent_at is not null and token_hash = :'h1'::bytea from public.quotes where id = :'q1'), 'sent with its link');
select is((select status::text from public.leads where id = :'lead1'), 'quote_sent', 'the lead moves to "quoted"');

-- ---- The customer's link ----------------------------------------------------------------------
select pg_temp.as_booking_api();
select ok(public_api.get_quote(:'h1'::bytea, sha256('ip'::bytea))::text !~* 'Margin is thin|Call Tue|internal|follow_up|business_id|customer_id|lead',
  'the customer''s view never includes internal notes, follow-ups or ids');
select is(public_api.get_quote(:'h1'::bytea, sha256('ip'::bytea)) ->> 'total_cents', '121000', 'total shown');
select is(jsonb_array_length(public_api.get_quote(:'h1'::bytea, sha256('ip'::bytea)) -> 'items'), 3, 'all line items shown');
select is(public_api.get_quote(:'h1'::bytea, sha256('ip'::bytea)) ->> 'terms', '50% at drop-off', 'terms shown');
select is(public_api.accept_quote(:'h1'::bytea, sha256('ip'::bytea)) ->> 'status', 'accepted', 'customer accepts');
select is(public_api.accept_quote(:'h1'::bytea, sha256('ip'::bytea)) ->> 'already', 'true', 'accepting again changes nothing');
select is(public_api.decline_quote(:'h1'::bytea, sha256('ip'::bytea)) #>> '{error,message}', 'this quote can no longer be answered',
  'a decided quote cannot be flipped');
select is(public_api.get_quote(sha256('no-such-token'::bytea), sha256('ip'::bytea)) #>> '{error,message}', 'link not valid', 'unknown links: generic answer');
reset role;
select is((select actor_type::text from public.activity_events where quote_id = :'q1' and to_status = 'accepted'), 'customer', 'acceptance recorded as the customer''s');

-- Decline; expired; withdrawn (revoked) links.
select pg_temp.as_user(:'owner_a');
select public.send_quote(:'q2', pg_temp.link_key());
select pg_temp.quote_hash(:'q2') as h2 \gset
select public.save_quote(null, jsonb_build_object('valid_until', pg_temp.today_plus(3)), :'dana', null, :'tacoma', null,
  '[{"name":"Interior detail","quantity":1,"price_cents":15000,"duration_min":120}]') as q3 \gset
select public.send_quote(:'q3', pg_temp.link_key());
select pg_temp.quote_hash(:'q3') as h3 \gset
select public.save_quote(null, jsonb_build_object('valid_until', pg_temp.today_plus(3)), :'dana', null, :'tacoma', null,
  '[{"name":"Wash","quantity":1,"price_cents":5000,"duration_min":60}]') as q4 \gset
select public.send_quote(:'q4', pg_temp.link_key());
select pg_temp.quote_hash(:'q4') as h4 \gset
select lives_ok(format('select public.withdraw_quote(%L)', :'q4'), 'withdraw a sent quote');
reset role;
update public.quotes set valid_until = pg_temp.today_plus(-1) where id = :'q3';  -- (as if a day passed)
select pg_temp.as_booking_api();
select is(public_api.decline_quote(:'h2'::bytea, sha256('ip'::bytea)) ->> 'status', 'declined', 'customer declines');
select is(public_api.get_quote(:'h3'::bytea, sha256('ip'::bytea)) ->> 'status', 'expired', 'past its date the quote reads as expired');
select is(public_api.accept_quote(:'h3'::bytea, sha256('ip'::bytea)) ->> 'status', 'expired', 'and cannot be accepted');
select is(public_api.get_quote(:'h4'::bytea, sha256('ip'::bytea)) #>> '{error,message}', 'link not valid', 'a withdrawn quote''s link stops working');
reset role;
select is((select status::text from public.quotes where id = :'q3'), 'expired', 'expiry stored');
select ok((select status = 'draft' and token_hash is null and token_nonce is null from public.quotes where id = :'q4'), 'withdrawn quote is a draft again, link cleared');

-- ---- Convert to a booking ------------------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select throws_ok(format($$select public.convert_quote(%L, %L, 'mobile', '{"line1":"1 Main"}')$$, :'q2', pg_temp.t(4, '09:00')),
  'DH002', 'only accepted quotes can be booked', 'declined quotes cannot be booked');
select throws_ok(format($$select public.convert_quote(%L, %L, 'mobile', '{"line1":"1 Main"}')$$, :'q1', pg_temp.t(4, '20:00')),
  'DH004', 'time_unavailable', 'an unavailable time is refused (job runs past closing)');
reset role;
select is((select status::text from public.quotes where id = :'q1'), 'accepted', 'and the quote stays accepted');
-- Something already booked at the proposed time.
insert into public.customers (business_id, first_name, phone_e164) values (:'a', 'Busy', '+15125550666') returning id as busy \gset
insert into public.vehicles (business_id, customer_id, make, model) values (:'a', :'busy', 'Kia', 'Soul') returning id as soul \gset
select pg_temp.as_user(:'owner_a');
select public.create_owner_appointment(:'busy', null, :'soul', null, :'car_a', array[:'full_a']::uuid[], pg_temp.t(4, '10:00'), 'mobile', '{"line1":"2 Main"}', 'phone');
select throws_ok(format($$select public.convert_quote(%L, %L, 'mobile', '{"line1":"1 Main"}')$$, :'q1', pg_temp.t(4, '09:00')),
  'DH004', 'time_unavailable', 'a time overlapping a confirmed job is refused');
select public.convert_quote(:'q1', pg_temp.t(5, '06:00'), 'mobile', '{"line1":"1 Main St","city":"Austin","state":"tx","postal_code":"78701"}') as appt1 \gset
reset role;
select ok((select a.source = 'quote' and a.quote_id = :'q1' and a.lead_id = :'lead1' and a.customer_id = :'cust1'
                  and a.estimated_total_cents = 121000 and a.ends_at - a.starts_at = interval '9 hours' and a.internal_notes = 'Call Tue'
             from public.appointments a where a.id = :'appt1'),
  'booking carries the quote''s customer, vehicle, total and work (2 h + 6 h + 4 × 15 min)');
select results_eq(format($$select name, quantity, estimated_price_cents from public.appointment_items where appointment_id = %L order by name$$, :'appt1'),
  $$values ('Ceramic coating (3-year)', 1, 90000), ('Full detail', 1, 26000), ('Wheel coating', 4, 2500)$$, 'quoted lines and prices carried over');
select is((select status::text from public.quotes where id = :'q1'), 'converted', 'quote marked converted');
select is((select status::text from public.leads where id = :'lead1'), 'booked', 'lead marked converted');
select pg_temp.as_user(:'owner_a');
select throws_ok(format($$select public.convert_quote(%L, %L, 'mobile', '{"line1":"1 Main"}')$$, :'q1', pg_temp.t(6, '09:00')),
  'DH002', 'this quote is already booked', 'a quote is converted only once');
reset role;
select is((select count(*)::int from public.appointments where quote_id = :'q1'), 1, 'one booking for the quote');
select throws_ok(format($$insert into public.appointments (business_id, resource_id, customer_id, vehicle_id, quote_id, starts_at, ends_at, location_type, service_address_line1)
                          values (%L, %L, %L, %L, %L, %L, %L, 'mobile', 'x')$$, :'a', pg_temp.resource_id(:'a'), :'cust1',
                        (select vehicle_id from public.quotes where id = :'q1'), :'q1', pg_temp.t(7, '09:00'), pg_temp.t(7, '10:00')),
  '23505', null, 'even outside the function, a second booking for a quote is refused');

-- A quote with no job length needs one at conversion.
select pg_temp.as_user(:'owner_a');
select public.save_quote(null, jsonb_build_object('valid_until', pg_temp.today_plus(3)), :'dana', null, :'tacoma', null,
  '[{"name":"Odor treatment","quantity":1,"price_cents":12000}]') as q5 \gset
select public.send_quote(:'q5', pg_temp.link_key());
select pg_temp.quote_hash(:'q5') as h5 \gset
reset role;
select pg_temp.as_booking_api();
select public_api.accept_quote(:'h5'::bytea, sha256('ip'::bytea));
reset role;
select pg_temp.as_user(:'owner_a');
select throws_ok(format($$select public.convert_quote(%L, %L, 'mobile', '{"line1":"1 Main"}')$$, :'q5', pg_temp.t(8, '09:00')),
  'DH004', 'set how long the job takes (15 minutes to 72 hours)', 'no job length: the owner must set one');
select lives_ok(format($$select public.convert_quote(%L, %L, 'mobile', '{"line1":"1 Main"}', 90)$$, :'q5', pg_temp.t(8, '09:00')), 'with a length it books');
select ok(jsonb_array_length(public.owner_slots_for_duration(90, pg_temp.today_plus(9), 1) -> 'days' -> 0 -> 'slots') > 0, 'open times for a given job length');
reset role;

-- ---- Cross-business ----------------------------------------------------------------------------
select pg_temp.as_user(:'owner_b');
select is((select count(*)::int from public.quotes where business_id = :'a'), 0, 'B cannot read A''s quotes');
select is((select count(*)::int from public.quote_items where business_id = :'a'), 0, 'B cannot read A''s quote items');
select throws_ok(format($$select public.send_quote(%L, pg_temp.link_key())$$, :'q2'), 'DH003', 'quote not found', 'B cannot send A''s quote');
select throws_ok(format($$select public.convert_quote(%L, %L, 'mobile', '{"line1":"x"}')$$, :'q5', pg_temp.t(9, '09:00')), 'DH003', 'quote not found', 'B cannot book A''s quote');
select throws_ok(format($$select public.save_quote(%L, '{}', null, '{"first_name":"B","phone_e164":"+15125550998"}', null, '{"make":"A","model":"B"}', '[{"name":"X","quantity":1,"price_cents":1}]')$$, :'q4'),
  'DH003', 'quote not found', 'B cannot edit A''s draft');
select throws_ok(format($$select public.save_quote(null, '{}', %L, null, null, '{"make":"A","model":"B"}', '[{"name":"X","quantity":1,"price_cents":1}]')$$, :'dana'),
  'DH003', 'customer not found', 'B cannot quote A''s customer');
select throws_ok(format($$select public.save_quote(null, jsonb_build_object('lead_id', %L), null, '{"first_name":"B","phone_e164":"+15125550997"}', null, '{"make":"A","model":"B"}', '[{"name":"X","quantity":1,"price_cents":1}]')$$, :'lead2'),
  'DH003', 'lead not found', 'B cannot attach A''s lead');
reset role;
select ok(not has_function_privilege('anon', 'public_api.get_quote(bytea,bytea)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public_api.accept_quote(bytea,bytea)', 'EXECUTE')
          and has_function_privilege('booking_api', 'public_api.accept_quote(bytea,bytea)', 'EXECUTE')
          and not has_function_privilege('booking_api', 'public.convert_quote(uuid,timestamptz,location_type,jsonb,integer)', 'EXECUTE'),
  'privileges: quote links only through booking_api; owner functions only for owners');

select * from finish();
rollback;
