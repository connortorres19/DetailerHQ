-- Phase 4E: owner-created appointments (migration 13). Mobile business A, capacity 1, hours
-- 06–22 daily, no minimum notice, 30-minute buffer, hourly slots; 'Full detail' $260 / 2 h,
-- add-on 'Pet hair removal' $40 / 30 min, quote-only 'Ceramic coating'.
begin;
\ir _helpers.psql
select plan(52);

select pg_temp.make_business('own-a@example.com', 'own-a', 'mobile') as a \gset
select pg_temp.make_business('own-b@example.com', 'own-b', 'mobile') as b \gset
select pg_temp.owner_of(:'a') as owner_a \gset
select pg_temp.owner_of(:'b') as owner_b \gset
select pg_temp.service_id(:'a', 'Full detail') as full_a \gset
select pg_temp.service_id(:'a', 'Pet hair removal') as addon_a \gset
select pg_temp.service_id(:'a', 'Ceramic coating') as quote_a \gset
select id as car_a from public.vehicle_size_classes where business_id = :'a' order by sort_order limit 1 \gset
select id as large_a from public.vehicle_size_classes where business_id = :'a' order by sort_order offset 2 limit 1 \gset
select pg_temp.size_class_id(:'b') as car_b \gset
insert into public.service_prices (business_id, service_id, size_class_id, price_cents, duration_min) values (:'a', :'full_a', :'large_a', 32000, 180);
-- A service the owner offers by phone only (not bookable online).
insert into public.services (business_id, name, price_type, base_price_cents, base_duration_min, is_bookable)
values (:'a', 'Fleet wash', 'fixed', 9000, 60, false) returning id as fleet_a \gset
-- Existing customers.
insert into public.customers (business_id, first_name, last_name, phone_e164) values (:'a', 'Dana', 'Lopez', '+15125550301') returning id as dana \gset
insert into public.vehicles (business_id, customer_id, year, make, model) values (:'a', :'dana', 2019, 'Toyota', 'Tacoma') returning id as tacoma \gset
insert into public.customers (business_id, first_name, phone_e164) values (:'a', 'Eli', '+15125550302') returning id as eli \gset
insert into public.vehicles (business_id, customer_id, make, model) values (:'a', :'eli', 'Honda', 'Civic') returning id as civic \gset
insert into public.customers (business_id, first_name, phone_e164) values (:'b', 'Bravo', '+15125550399') returning id as cust_b \gset
insert into public.vehicles (business_id, customer_id, make, model) values (:'b', :'cust_b', 'Ford', 'Focus') returning id as veh_b \gset

create function pg_temp.t(p_days int, p_time text) returns timestamptz language sql as $$
  select ((now() at time zone 'America/Chicago')::date + p_days + p_time::time) at time zone 'America/Chicago' $$;
grant execute on function pg_temp.t(int, text) to authenticated;
-- Owner A creates: (customer id | new, vehicle id | new, size, services, start, source, hold).
create function pg_temp.book(p_customer uuid, p_new_customer jsonb, p_vehicle uuid, p_new_vehicle jsonb, p_size uuid,
                             p_services uuid[], p_start timestamptz, p_source text, p_hold uuid default null) returns uuid
language sql as $$
  select public.create_owner_appointment(p_customer, p_new_customer, p_vehicle, p_new_vehicle, p_size, p_services, p_start,
    'mobile', '{"line1":"500 Elm St","city":"Austin","state":"tx","postal_code":"78702"}', p_source::public.appointment_source,
    'Gate code 4411', p_hold) $$;
grant execute on function pg_temp.book(uuid, jsonb, uuid, jsonb, uuid, uuid[], timestamptz, text, uuid) to authenticated;

-- ---- New customer + new vehicle (phone) --------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select pg_temp.book(null, '{"first_name":"Jordan","last_name":"Reyes","phone_e164":"+15125550142","email":"Jordan@Example.com"}',
                    null, '{"year":2021,"make":"Tesla","model":"Model Y","color":"White"}', :'car_a',
                    array[:'full_a', :'addon_a']::uuid[], pg_temp.t(3, '09:00'), 'phone') as appt1 \gset
reset role;
select ok((select a.status = 'scheduled' and a.source = 'phone' and a.estimated_total_cents = 30000
                  and a.ends_at - a.starts_at = interval '150 minutes' and a.internal_notes = 'Gate code 4411'
                  and a.service_state = 'TX' and a.created_by = :'owner_a'
             from public.appointments a where a.id = :'appt1'),
  'phone booking: confirmed, priced and timed from saved prices ($260 + $40, 2h30), notes and address stored');
select ok((select c.first_name = 'Jordan' and c.email = 'jordan@example.com' and c.source = 'phone' and v.make = 'Tesla' and v.size_class_id = :'car_a'
             from public.appointments a join public.customers c on c.id = a.customer_id join public.vehicles v on v.id = a.vehicle_id
            where a.id = :'appt1'), 'new customer and vehicle created with the chosen size');
select results_eq(format($$select name, estimated_price_cents, duration_min from public.appointment_items where appointment_id = %L order by name$$, :'appt1'),
  $$values ('Full detail', 26000, 120), ('Pet hair removal', 4000, 30)$$, 'items carry the saved prices');
select is((select count(*)::int from public.schedule_blocks where appointment_id = :'appt1'), 1, 'it takes capacity like any appointment');
select is((select kind || ':' || (metadata ->> 'source') from public.activity_events where appointment_id = :'appt1'), 'appointment_created:phone', 'history records how it was made');

-- ---- Existing customer + existing vehicle (text), size pricing -------------------------------
select pg_temp.as_user(:'owner_a');
select pg_temp.book(:'dana', null, :'tacoma', null, :'large_a', array[:'full_a']::uuid[], pg_temp.t(3, '13:00'), 'text') as appt2 \gset
reset role;
select ok((select a.customer_id = :'dana' and a.vehicle_id = :'tacoma' and a.source = 'text' and a.estimated_total_cents = 32000
                  and a.ends_at - a.starts_at = interval '3 hours'
             from public.appointments a where a.id = :'appt2'), 'existing customer + vehicle; large-vehicle price and duration');
select is((select size_class_id from public.vehicles where id = :'tacoma'), :'large_a'::uuid, 'a vehicle without a size gets the chosen one');
select is((select count(*)::int from public.customers where business_id = :'a' and phone_e164 = '+15125550301'), 1, 'no duplicate customer created');

-- ---- Existing customer + new vehicle (walk-in); in person; other ------------------------------
select pg_temp.as_user(:'owner_a');
select pg_temp.book(:'eli', null, null, '{"make":"Subaru","model":"Outback"}', :'car_a', array[:'fleet_a']::uuid[], pg_temp.t(4, '09:00'), 'walk_in') as appt3 \gset
select pg_temp.book(:'eli', null, :'civic', null, :'car_a', array[:'full_a']::uuid[], pg_temp.t(4, '12:00'), 'in_person') as appt4 \gset
select pg_temp.book(:'eli', null, :'civic', null, :'car_a', array[:'full_a']::uuid[], pg_temp.t(5, '09:00'), 'other') as appt5 \gset
reset role;
select is((select array_agg(source::text order by starts_at) from public.appointments where id in (:'appt3', :'appt4', :'appt5')),
  array['walk_in', 'in_person', 'other'], 'walk-in, in-person and other sources recorded');
select ok((select v.customer_id = :'eli' and v.make = 'Subaru' from public.appointments a join public.vehicles v on v.id = a.vehicle_id where a.id = :'appt3'),
  'a new vehicle is added to the existing customer');
select is((select estimated_total_cents from public.appointments where id = :'appt3'), 9000, 'owners can book services not offered online, at their saved price');
select is((select source::text from public.appointments where booking_request_id is not null limit 1), null, '(no public bookings yet in A)');

select pg_temp.as_user(:'owner_a');
select throws_ok(format('select pg_temp.book(%L, null, %L, null, %L, array[%L]::uuid[], %L, %L)', :'eli', :'civic', :'car_a', :'full_a', pg_temp.t(6, '09:00'), 'booking_page'),
  'DH004', 'choose where the booking came from', '"booking page" is reserved for public bookings');
select throws_ok(format('select pg_temp.book(%L, null, %L, null, %L, array[%L]::uuid[], %L, %L)', :'eli', :'civic', :'car_a', :'quote_a', pg_temp.t(6, '09:00'), 'phone'),
  'DH004', 'quote-required services need a quote first', 'quote-only services cannot be booked without a price');
select throws_ok(format('select pg_temp.book(%L, null, %L, null, null, array[%L]::uuid[], %L, %L)', :'eli', :'civic', :'full_a', pg_temp.t(6, '09:00'), 'phone'),
  'DH004', 'choose a vehicle size', 'a vehicle size is required for pricing');
select throws_ok(format('select pg_temp.book(%L, %L, %L, null, %L, array[%L]::uuid[], %L, %L)', :'eli', '{"first_name":"X","phone_e164":"+15125550000"}', :'civic', :'car_a', :'full_a', pg_temp.t(6, '09:00'), 'phone'),
  'DH004', 'choose or add exactly one customer and one vehicle', 'customer id and new customer together refused');
select throws_ok(format('select pg_temp.book(null, %L, null, %L, %L, array[%L]::uuid[], %L, %L)', '{"first_name":"X","phone_e164":"+15125550000","business_id":"x"}', '{"make":"A","model":"B"}', :'car_a', :'full_a', pg_temp.t(6, '09:00'), 'phone'),
  'DH004', 'invalid customer', 'unknown fields refused');
select throws_ok(format('select pg_temp.book(null, %L, null, %L, %L, array[%L]::uuid[], %L, %L)', '{"first_name":"No contact"}', '{"make":"A","model":"B"}', :'car_a', :'full_a', pg_temp.t(6, '09:00'), 'phone'),
  'DH004', 'invalid details', 'a new customer needs a phone or email (table check)');
reset role;
-- A start that isn't on the slot interval is fine for owners (alignment is a booking-page rule).
select pg_temp.as_user(:'owner_a');
select lives_ok(format('select pg_temp.book(%L, null, %L, null, %L, array[%L]::uuid[], %L, %L)', :'eli', :'civic', :'car_a', :'full_a', pg_temp.t(6, '10:15'), 'phone'),
  'owner start at 10:15 (hourly slots) is allowed');
reset role;

-- ---- Unavailable times: every rule, and nothing is left behind -------------------------------
create function pg_temp.why(p_start timestamptz, p_new_customer boolean default true) returns text language plpgsql as $$
declare v_detail text;
begin
  perform pg_temp.book(null, '{"first_name":"Ghost","phone_e164":"+15125550666"}', null, '{"make":"Ghost","model":"Car"}',
                       (select id from public.vehicle_size_classes where business_id = (select id from public.businesses where slug = 'own-a') order by sort_order limit 1),
                       array[(select id from public.services where name = 'Full detail' and business_id = (select id from public.businesses where slug = 'own-a'))],
                       p_start, 'phone');
  return 'ok';
exception when sqlstate 'DH004' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail;
end $$;
grant execute on function pg_temp.why(timestamptz, boolean) to authenticated;
select pg_temp.as_user(:'owner_a');
select is(pg_temp.why(pg_temp.t(3, '10:00')), 'fully booked', 'overlapping a confirmed appointment is refused');
select is(pg_temp.why(pg_temp.t(3, '11:45')), 'fully booked', 'the 30-minute buffer after a job is kept');
select is(pg_temp.why(pg_temp.t(3, '21:00')), 'outside working hours', 'a job running past closing is refused');
reset role;
insert into public.time_off (business_id, during) values (:'a', tstzrange(pg_temp.t(7, '12:00'), pg_temp.t(7, '13:00')));
update public.booking_settings set max_jobs_per_day = 2 where business_id = :'a';
update public.booking_settings set min_notice_min = 1440 where business_id = :'a';
select pg_temp.as_user(:'owner_a');
select is(pg_temp.why(pg_temp.t(7, '11:00')), 'time off', 'blocked time is refused');
select is(pg_temp.why(pg_temp.t(3, '16:30')), 'daily limit reached', 'the daily job limit applies (2 jobs already that day)');
select is(pg_temp.why(now() + interval '2 hours'), 'too soon', 'minimum notice applies');
select is(pg_temp.why(pg_temp.t(400, '09:00')), 'too far ahead', 'the booking window applies');
reset role;
update public.booking_settings set max_jobs_per_day = null, min_notice_min = 0 where business_id = :'a';
select is((select count(*)::int from public.customers where first_name = 'Ghost'), 0, 'refused bookings leave no customer or vehicle behind');

-- ---- Owner slot listing ------------------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select ok(jsonb_array_length(public.owner_available_slots(array[:'fleet_a']::uuid[], :'car_a', ((now() at time zone 'America/Chicago')::date + 8), 1) -> 'days' -> 0 -> 'slots') > 0,
  'open times are listed for services not offered online');
select is((public.owner_available_slots(array[:'full_a']::uuid[], :'large_a', ((now() at time zone 'America/Chicago')::date + 8), 1) ->> 'duration_min')::int, 180,
  'durations follow the chosen size');
select throws_ok(format('select public.owner_available_slots(array[%L]::uuid[], %L, current_date + 8, 1)', :'quote_a', :'car_a'),
  'DH004', 'quote-required services need a quote first', 'no times for quote-only services');
reset role;

-- ---- Converting a calendar hold ----------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select public.place_calendar_hold(pg_temp.t(8, '14:15'), pg_temp.t(8, '16:15'), 24, 'Called back') as hold1 \gset
select pg_temp.book(:'dana', null, :'tacoma', null, :'car_a', array[:'full_a']::uuid[], null, 'phone', :'hold1') as appt6 \gset
reset role;
select is((select starts_at from public.appointments where id = :'appt6'), pg_temp.t(8, '14:15'), 'the appointment takes the hold''s start time');
select is((select count(*)::int from public.schedule_blocks where id = :'hold1'), 0, 'the hold is gone');
select is((select (metadata ->> 'from_hold')::boolean from public.activity_events where appointment_id = :'appt6'), true, 'history notes the conversion');
select is(app.peak_usage(pg_temp.resource_id(:'a'), tstzrange(pg_temp.t(8, '14:15'), pg_temp.t(8, '16:15'))), 1, 'exactly one unit of capacity in use there');

-- A hold over the only free capacity can be converted (it doesn't compete with itself).
select pg_temp.as_user(:'owner_a');
select public.place_calendar_hold(pg_temp.t(9, '09:00'), pg_temp.t(9, '12:00'), 24) as hold2 \gset
select lives_ok(format('select pg_temp.book(%L, null, %L, null, %L, array[%L]::uuid[], null, %L, %L)', :'eli', :'civic', :'car_a', :'full_a', 'text', :'hold2'),
  'converting a hold that fills the time succeeds');
-- A failure after removing the hold puts it back (one transaction).
select public.place_calendar_hold(pg_temp.t(10, '09:00'), pg_temp.t(10, '11:00'), 24) as hold3 \gset
select throws_ok(format('select pg_temp.book(%L, null, %L, null, %L, array[%L]::uuid[], null, %L, %L)', :'eli', :'civic', :'car_a', :'quote_a', 'phone', :'hold3'),
  'DH004', 'quote-required services need a quote first', 'a refused conversion…');
reset role;
select is((select count(*)::int from public.schedule_blocks where id = :'hold3'), 1, '…keeps the hold (rolled back)');
-- A hold whose job would run past closing can't be converted; the hold stays.
select pg_temp.as_user(:'owner_a');
select public.place_calendar_hold(pg_temp.t(10, '20:30'), pg_temp.t(10, '21:30'), 24) as hold4 \gset
select throws_ok(format('select pg_temp.book(%L, null, %L, null, %L, array[%L]::uuid[], null, %L, %L)', :'eli', :'civic', :'car_a', :'full_a', 'phone', :'hold4'),
  'DH004', 'time_unavailable', 'a hold whose job doesn''t fit the hours is refused');
reset role;
select is((select count(*)::int from public.schedule_blocks where id = :'hold4'), 1, 'and the hold is kept');
-- Expired hold.
set local session_replication_role = replica;
insert into public.schedule_blocks (business_id, resource_id, kind, during, expires_at)
values (:'a', pg_temp.resource_id(:'a'), 'hold', tstzrange(pg_temp.t(11, '09:00'), pg_temp.t(11, '11:00')), now() - interval '1 minute')
returning id as expired \gset
set local session_replication_role = origin;
select pg_temp.as_user(:'owner_a');
select throws_ok(format('select pg_temp.book(%L, null, %L, null, %L, array[%L]::uuid[], null, %L, %L)', :'eli', :'civic', :'car_a', :'full_a', 'phone', :'expired'),
  'DH002', 'this hold has expired', 'an expired hold cannot be converted');
select throws_ok(format('select pg_temp.book(%L, null, %L, null, %L, array[%L]::uuid[], null, %L, %L)', :'eli', :'civic', :'car_a', :'full_a', 'phone', gen_random_uuid()),
  'DH003', 'hold not found', 'an unknown hold is not found');
reset role;

-- ---- Cross-business ----------------------------------------------------------------------------
select pg_temp.as_user(:'owner_b');
select throws_ok(format('select pg_temp.book(%L, null, %L, null, %L, array[%L]::uuid[], %L, %L)', :'dana', :'tacoma', :'car_b', pg_temp.service_id(:'b', 'Full detail'), pg_temp.t(3, '15:00'), 'phone'),
  'DH003', 'customer not found', 'B cannot book A''s customer');
select throws_ok(format('select pg_temp.book(%L, null, %L, null, %L, array[%L]::uuid[], %L, %L)', :'cust_b', :'tacoma', :'car_b', pg_temp.service_id(:'b', 'Full detail'), pg_temp.t(3, '15:00'), 'phone'),
  'DH003', 'vehicle not found for this customer', 'B cannot use A''s vehicle');
select throws_ok(format('select pg_temp.book(%L, null, %L, null, %L, array[%L]::uuid[], %L, %L)', :'cust_b', :'veh_b', :'car_b', :'full_a', pg_temp.t(3, '15:00'), 'phone'),
  'DH004', 'unknown or unavailable service', 'B cannot price with A''s service');
select throws_ok(format('select pg_temp.book(%L, null, %L, null, %L, array[%L]::uuid[], %L, %L)', :'cust_b', :'veh_b', :'large_a', pg_temp.service_id(:'b', 'Full detail'), pg_temp.t(3, '15:00'), 'phone'),
  'DH004', 'unknown vehicle size', 'B cannot use A''s size classes');
select throws_ok(format('select pg_temp.book(%L, null, %L, null, %L, array[%L]::uuid[], null, %L, %L)', :'cust_b', :'veh_b', :'car_b', pg_temp.service_id(:'b', 'Full detail'), 'phone', :'hold3'),
  'DH003', 'hold not found', 'B cannot convert A''s hold');
select is((select count(*)::int from public.appointments where business_id = :'a'), 0, 'B cannot see A''s appointments');
reset role;
select is((select count(*)::int from public.schedule_blocks where id = :'hold3'), 1, 'A''s hold is untouched');
select ok(not has_function_privilege('anon', 'public.create_owner_appointment(uuid,jsonb,uuid,jsonb,uuid,uuid[],timestamptz,location_type,jsonb,appointment_source,text,uuid)', 'EXECUTE')
          and not has_function_privilege('booking_api', 'public.owner_available_slots(uuid[],uuid,date,integer)', 'EXECUTE'),
  'owner functions: signed-in owners only');
-- JSON null (as the Data API sends it) means "not given", like SQL NULL.
select pg_temp.as_user(:'owner_a');
select lives_ok(format($$select public.create_owner_appointment(%L, 'null'::jsonb, %L, 'null'::jsonb, %L, array[%L]::uuid[], %L, 'mobile', '{"line1":"1 Main St"}'::jsonb, 'phone')$$,
                       :'eli', :'civic', :'car_a', :'full_a', pg_temp.t(12, '09:00')),
  'JSON null for the new customer/vehicle is treated as absent');
select throws_ok(format($$select public.create_owner_appointment(%L, null, %L, null, %L, array[%L]::uuid[], %L, 'mobile', 'null'::jsonb, 'phone')$$,
                       :'eli', :'civic', :'car_a', :'full_a', pg_temp.t(13, '09:00')),
  'DH004', 'invalid details', 'a mobile job needs a street address (table check)');
reset role;
-- Public bookings are always "booking page" whatever is sent.
select ok(not exists (select 1 from public.appointments where booking_request_id is not null and source <> 'booking_page'), 'public bookings keep their source');

select * from finish();
rollback;
