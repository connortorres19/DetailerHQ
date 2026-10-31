-- Phase 4C: slot listing, instant booking, counted failures (R2/D3), status links,
-- customer cancellation, publishing and owner preview.
begin;
\ir _helpers.psql
select plan(43);

-- Businesses (America/Chicago, 06:00–22:00 daily, no notice, hourly slots, 30-minute buffer,
-- 'Full detail' 120 min, add-on 30 min, quote-only 'Ceramic coating').
select pg_temp.make_business('slots@example.com', 'slots-co', 'mobile') as a \gset
select pg_temp.make_business('instant@example.com', 'instant-co', 'mobile') as c \gset
select pg_temp.make_business('draft@example.com', 'draft-co', 'mobile') as d \gset
select pg_temp.owner_of(:'a') as owner_a \gset
select pg_temp.owner_of(:'c') as owner_c \gset
select pg_temp.owner_of(:'d') as owner_d \gset
select pg_temp.service_id(:'a', 'Full detail') as svc_a \gset
select pg_temp.service_id(:'a', 'Pet hair removal') as addon_a \gset
select pg_temp.service_id(:'a', 'Ceramic coating') as quote_a \gset
select id as small_a from public.vehicle_size_classes where business_id = :'a' order by sort_order limit 1 \gset
select id as large_a from public.vehicle_size_classes where business_id = :'a' order by sort_order offset 2 limit 1 \gset
select pg_temp.service_id(:'c', 'Full detail') as svc_c \gset
select pg_temp.size_class_id(:'c') as size_c \gset
select pg_temp.service_id(:'d', 'Full detail') as svc_d \gset
select pg_temp.size_class_id(:'d') as size_d \gset
-- Large vehicles take 3 hours and cost more.
insert into public.service_prices (business_id, service_id, size_class_id, price_cents, duration_min)
values (:'a', :'svc_a', :'large_a', 32000, 180);
-- A day four days out (never today, so "now" never interferes).
select ((now() at time zone 'America/Chicago')::date + 4) as day \gset

create function pg_temp.slots(p_slug text, p_services uuid[], p_size uuid, p_day date, p_ip text default 'slot-ip')
returns text[] language sql as $$
  select coalesce(array_agg(to_char(s::text::timestamptz at time zone 'America/Chicago', 'HH24:MI') order by s::text), '{}')
    from jsonb_array_elements(public_api.get_available_slots(p_slug, p_services, p_size, p_day, 1, sha256(p_ip::bytea)) -> 'days' -> 0 -> 'slots') s
$$;
create function pg_temp.payload(p_start timestamptz, p_services uuid[], p_size uuid, p_phone text, p_email text) returns jsonb
language sql as $$
  select jsonb_build_object(
    'service_ids', to_jsonb(p_services), 'vehicle_size_class_id', p_size, 'requested_start', p_start,
    'location_type', 'mobile', 'service_address_line1', '1234 Oak St', 'service_city', 'Austin',
    'service_state', 'TX', 'service_postal_code', '78701', 'contact_first_name', 'Jordan',
    'contact_last_name', 'Reyes', 'contact_phone_e164', p_phone, 'contact_email', p_email,
    'preferred_contact', 'text', 'vehicle_year', 2021, 'vehicle_make', 'Tesla', 'vehicle_model', 'Model Y', 'consent', true)
$$;
create function pg_temp.submit(p_slug text, p_payload jsonb, p_token text, p_ip text default 'submit-ip') returns jsonb
language sql as $$
  select public_api.submit_booking_request(p_slug, p_payload, gen_random_uuid(), sha256(p_token::bytea), sha256(p_ip::bytea))
$$;
create function pg_temp.status(p_token text, p_ip text default 'status-ip') returns jsonb
language sql as $$ select public_api.get_request_status(sha256(p_token::bytea), sha256(p_ip::bytea)) $$;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = pg_my_temp_schema() loop
    execute format('grant execute on function %s to booking_api, authenticated', f);
  end loop;
end
$$;

-- ---- Slot listing ------------------------------------------------------------------------
select pg_temp.as_booking_api();
select is(pg_temp.slots('slots-co', array[:'svc_a'::uuid], :'small_a', :'day'),
  array['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'],
  'open day: hourly starts from opening until the job still ends by closing (2 h job, 06–22)');
select is(pg_temp.slots('slots-co', array[:'svc_a'::uuid, :'addon_a'::uuid], :'large_a', :'day'),
  array['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'],
  'large vehicle (3 h) + add-on (30 min): last start 18:00');
select is((public_api.get_available_slots('slots-co', array[:'svc_a'::uuid, :'addon_a'::uuid], :'large_a', :'day', 1, sha256('slot-ip'::bytea)) ->> 'duration_min')::int,
  210, 'duration comes from the database price grid, not from the caller');
reset role;

-- A lunch break, a blocked hour and a confirmed job with its buffer.
update public.availability_rules set end_time = '12:00' where business_id = :'a' and weekday = extract(dow from :'day'::date);
insert into public.availability_rules (business_id, weekday, start_time, end_time)
values (:'a', extract(dow from :'day'::date), '13:00', '22:00');
insert into public.time_off (business_id, during, label)
values (:'a', tstzrange((:'day'::date + time '17:00') at time zone 'America/Chicago', (:'day'::date + time '18:00') at time zone 'America/Chicago'), 'Dentist');
select pg_temp.make_request(:'a', (:'day'::date + time '07:00') at time zone 'America/Chicago', 120, '+15125550111') as job \gset
select pg_temp.as_user(:'owner_a');
select public.approve_request(:'job');
reset role;
select pg_temp.as_booking_api();
select is(pg_temp.slots('slots-co', array[:'svc_a'::uuid], :'small_a', :'day'),
  array['10:00','13:00','14:00','15:00','18:00','19:00','20:00'],
  'job 07–09 + 30 min buffer, lunch 12–13, blocked 17–18 (15:00 ends exactly at 17:00): only times passing every rule');
select is(pg_temp.slots('slots-co', array[:'quote_a'::uuid], :'small_a', :'day'), '{}',
  'quote-only services have no times (they are not bookable)');
select is(public_api.get_available_slots('slots-co', array[:'quote_a'::uuid], :'small_a', :'day', 1, sha256('slot-ip'::bytea)) #>> '{error,message}',
  'unknown or unavailable service', 'and the reason is returned as a result');
select is(jsonb_array_length(public_api.get_available_slots('slots-co', array[:'svc_a'::uuid], :'small_a', :'day', 14, sha256('slot-ip'::bytea)) -> 'days'),
  14, 'up to 14 days per call');
select is(public_api.get_available_slots('slots-co', array[:'svc_a'::uuid], :'small_a', :'day', 15, sha256('slot-ip'::bytea)) #>> '{error,message}',
  'invalid request', 'more than 14 days refused');
-- Horizon: days past the booking window are not returned.
reset role;
update public.booking_settings set horizon_days = 2 where business_id = :'a';
select pg_temp.as_booking_api();
select is(jsonb_array_length(public_api.get_available_slots('slots-co', array[:'svc_a'::uuid], :'small_a', :'day', 7, sha256('slot-ip'::bytea)) -> 'days'),
  0, 'nothing beyond the booking window');
reset role;
update public.booking_settings set horizon_days = 365 where business_id = :'a';
select pg_temp.as_booking_api();
-- Every listed time is accepted by the submission check; a time between slots is not.
select is(pg_temp.submit('slots-co', pg_temp.payload((:'day'::date + time '13:00') at time zone 'America/Chicago',
           array[:'svc_a'::uuid], :'small_a', '+15125550122', 'pat@example.com'), 'tok-listed') ->> 'status',
  'pending', 'a listed time is accepted (approval mode → pending)');
select is(pg_temp.submit('slots-co', pg_temp.payload((:'day'::date + time '13:30') at time zone 'America/Chicago',
           array[:'svc_a'::uuid], :'small_a', '+15125550123', 'lee@example.com'), 'tok-unlisted') #>> '{error,detail}',
  'not an offered start time', 'a time that was never listed is refused by the server');
select is(pg_temp.slots('slots-co', array[:'svc_a'::uuid], :'small_a', :'day'),
  array['10:00','13:00','14:00','15:00','18:00','19:00','20:00'], 'pending requests do not remove times (D-32)');

-- ---- Instant booking ---------------------------------------------------------------------
reset role;
insert into public.customers (business_id, first_name, phone_e164, email) values (:'c', 'Jordan', '+15125550142', 'jordan@example.com');
select pg_temp.as_user(:'owner_c');
update public.booking_settings set booking_mode = 'instant', cancel_cutoff_hours = 24 where business_id = :'c';
reset role;
select pg_temp.as_booking_api();
select is(pg_temp.submit('instant-co', pg_temp.payload((:'day'::date + time '10:00') at time zone 'America/Chicago',
           array[:'svc_c'::uuid], :'size_c', '+15125550142', 'jordan@example.com'), 'tok-instant', 'ip-c1') - 'request_number',
  '{"status": "approved", "replayed": false}'::jsonb, 'instant mode: the booking is confirmed in the same call');
reset role;
select is((select a.status::text from public.appointments a join public.booking_requests r on r.id = a.booking_request_id
            where r.token_hash = sha256('tok-instant'::bytea)), 'scheduled', 'an appointment exists for it');
select is((select count(*)::int from public.customers where business_id = :'c' and phone_e164 = '+15125550142'), 2,
  'a new customer record was created, not merged into the existing one with the same phone');
select ok((select c.source = 'booking_page' and v.make = 'Tesla' and v.customer_id = c.id
             from public.booking_requests r join public.customers c on c.id = r.customer_id join public.vehicles v on v.id = r.vehicle_id
            where r.token_hash = sha256('tok-instant'::bytea)), 'and a vehicle record, linked to the request');
select pg_temp.as_booking_api();
select is(pg_temp.submit('instant-co', pg_temp.payload((:'day'::date + time '11:00') at time zone 'America/Chicago',
           array[:'svc_c'::uuid], :'size_c', '+15125550155', 'kim@example.com'), 'tok-overlap', 'ip-c2') #>> '{error,detail}',
  'fully booked', 'capacity 1: an overlapping instant booking is refused');
select is(pg_temp.submit('instant-co', pg_temp.payload((:'day'::date + time '12:00') at time zone 'America/Chicago',
           array[:'svc_c'::uuid], :'size_c', '+15125550155', 'kim@example.com'), 'tok-buffer', 'ip-c2') #>> '{error,detail}',
  'fully booked', 'the 30-minute buffer after the confirmed job is kept free');
select is(pg_temp.submit('instant-co', pg_temp.payload((:'day'::date + time '13:00') at time zone 'America/Chicago',
           array[:'svc_c'::uuid], :'size_c', '+15125550155', 'kim@example.com'), 'tok-after', 'ip-c2') ->> 'status',
  'approved', 'the next free start time books instantly');
reset role;
select is((select count(*)::int from public.booking_requests where business_id = :'c' and token_hash in (sha256('tok-overlap'::bytea), sha256('tok-buffer'::bytea))),
  0, 'refused instant bookings leave nothing behind');
select is((select count(*)::int from public.customers where business_id = :'c'), 3, 'only successful bookings created customers');

-- ---- Status link, price breakdown, cancellation cutoff -----------------------------------
select pg_temp.as_booking_api();
select is(pg_temp.status('tok-instant') -> 'items' -> 0 ->> 'price_cents', '26000', 'status shows the price breakdown');
select is(pg_temp.status('tok-instant') -> 'appointment' ->> 'can_cancel', 'true', 'cancellable more than 24 h ahead');
select ok(pg_temp.status('tok-instant')::text !~* 'Reyes|1234 Oak|jordan@|business_id|customer_id|token', 'status payload stays masked');
reset role;
update public.booking_settings set cancel_cutoff_hours = 168 where business_id = :'c';
select pg_temp.as_booking_api();
select is(pg_temp.status('tok-instant') -> 'appointment' ->> 'can_cancel', 'false', 'inside a 7-day cutoff: not cancellable online');
select is(public_api.cancel_appointment(sha256('tok-instant'::bytea), sha256('status-ip'::bytea)) #>> '{error,message}',
  'online cancellation is not available for this appointment', 'and the server refuses it');
reset role;
update public.booking_settings set cancel_cutoff_hours = 24 where business_id = :'c';
select pg_temp.as_booking_api();
select is(public_api.cancel_appointment(sha256('tok-instant'::bytea), sha256('status-ip'::bytea)) ->> 'status', 'cancelled',
  'before the cutoff the customer can cancel');
select is(pg_temp.submit('instant-co', pg_temp.payload((:'day'::date + time '10:00') at time zone 'America/Chicago',
           array[:'svc_c'::uuid], :'size_c', '+15125550166', 'ash@example.com'), 'tok-rebook', 'ip-c3') ->> 'status',
  'approved', 'the cancelled time is bookable again');
select is(pg_temp.status('tok-listed') ->> 'can_withdraw', 'true', 'a pending request can be withdrawn');

-- ---- Guessed links are counted (R2/D3) ---------------------------------------------------
select is((select count(*)::int from generate_series(1, 10) g
            where public_api.get_request_status(sha256(('guess-' || g)::bytea), sha256('guesser'::bytea)) #>> '{error,message}' = 'link not valid'),
  10, 'ten wrong links: each answered "link not valid"');
select is(public_api.get_request_status(sha256('tok-listed'::bytea), sha256('guesser'::bytea)) #>> '{error,code}', 'DH005',
  'the 11th lookup from that IP is refused, even with a real link');
select is(public_api.get_request_status(sha256('tok-listed'::bytea), sha256('someone-else'::bytea)) ->> 'status', 'pending',
  'other IPs are unaffected');
reset role;
select is((select count(*)::int from public.rate_limit_events where action = 'token_failed' and key_hash = sha256('guesser'::bytea)), 10,
  'failed lookups were recorded even though they failed');

-- ---- Publishing and preview --------------------------------------------------------------
update public.businesses set accepting_requests = false, published_at = null where id = :'d';
select pg_temp.as_booking_api();
select is(public_api.get_booking_page('draft-co'), null, 'an unpublished business has no public page');
select is(public_api.get_available_slots('draft-co', array[:'svc_d'::uuid], :'size_d', :'day', 1,
          sha256('slot-ip'::bytea)) #>> '{error,message}', 'not accepting requests', 'and no public times');
reset role;
select pg_temp.as_user(:'owner_d');
select is(public.preview_booking_page() ->> 'published', 'false', 'the owner can preview it anyway');
select is(jsonb_array_length(public.preview_available_slots(array[:'svc_d'::uuid], :'size_d', :'day', 1) -> 'days' -> 0 -> 'slots'),
  15, 'including the times customers would see');
select is(public.preview_booking_page() ->> 'name', 'Draft Co', 'preview shows the owner''s own business');
delete from public.availability_rules where business_id = :'d';
select throws_ok('select public.set_booking_page_live(true)', 'DH004', 'add working hours before publishing', 'publishing needs working hours');
reset role;
insert into public.availability_rules (business_id, weekday, start_time, end_time) values (:'d', 1, '09:00', '17:00');
select pg_temp.as_user(:'owner_d');
select is(public.set_booking_page_live(true), true, 'with hours and a bookable service the page goes live');
reset role;
select pg_temp.as_booking_api();
select is(public_api.get_booking_page('draft-co') ->> 'name', 'Draft Co', 'and is public');
reset role;
select pg_temp.as_user(:'owner_d');
select public.set_booking_page_live(false);
reset role;
select pg_temp.as_booking_api();
select is(public_api.get_booking_page('draft-co'), null, 'taking it offline hides it again');
reset role;
-- Owners can't reach the public API, and the public role can't reach owner functions.
select ok(not has_function_privilege('authenticated', 'public_api.get_available_slots(text,uuid[],uuid,date,integer,bytea)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.preview_booking_page()', 'EXECUTE')
          and not has_function_privilege('booking_api', 'public.set_booking_page_live(boolean)', 'EXECUTE'),
  'privileges: slots only for booking_api; preview and publish only for signed-in owners');

select * from finish();
rollback;
