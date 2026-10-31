-- Restricted public booking path (D-13, D-21, D-25), executed as the booking_api role.
begin;
\ir _helpers.psql
select plan(36);

create temp table ctx as
select pg_temp.make_business('a@example.com', 'alpha-detail', 'mobile') as biz_a,
       pg_temp.make_business('b@example.com', 'bravo-detail', 'shop', 2) as biz_b;
update public.booking_settings set cancel_cutoff_hours = 24 where business_id = (select biz_a from ctx);

create temp table k as
select sha256('ip-1'::bytea) as ip1, sha256('ip-2'::bytea) as ip2,
       sha256('token-1'::bytea) as tok1, sha256('token-2'::bytea) as tok2, sha256('token-3'::bytea) as tok3,
       gen_random_uuid() as idem1,
       pg_temp.service_id((select biz_a from ctx), 'Full detail') as svc_a,
       pg_temp.service_id((select biz_a from ctx), 'Pet hair removal') as addon_a,
       pg_temp.service_id((select biz_a from ctx), 'Ceramic coating') as quote_a,
       pg_temp.service_id((select biz_b from ctx), 'Full detail') as svc_b,
       pg_temp.size_class_id((select biz_a from ctx)) as size_a,
       pg_temp.size_class_id((select biz_b from ctx)) as size_b;
grant select on ctx, k to booking_api, authenticated;

create function pg_temp.payload(p_start timestamptz, p_services uuid[], p_size uuid, p_phone text default '+15125550142',
                                p_extra jsonb default '{}') returns jsonb
language sql as $$
  select jsonb_build_object(
    'service_ids', to_jsonb(p_services), 'vehicle_size_class_id', p_size, 'requested_start', p_start,
    'location_type', 'mobile', 'service_address_line1', '1234 Oak St', 'service_city', 'Austin',
    'service_state', 'TX', 'service_postal_code', '78701', 'contact_first_name', 'Jordan',
    'contact_last_name', 'Reyes', 'contact_phone_e164', p_phone, 'contact_email', 'jordan@example.com',
    'preferred_contact', 'text', 'vehicle_year', 2021, 'vehicle_make', 'Tesla', 'vehicle_model', 'Model Y',
    'vehicle_color', 'White', 'consent', true) || p_extra
$$;
grant execute on function pg_temp.payload(timestamptz, uuid[], uuid, text, jsonb) to booking_api;

-- Public functions return errors as results (migration 11, R2/D3) so failed attempts are counted.
create function pg_temp.returns_error(p_sql text, p_code text, p_message text, p_description text) returns text
language plpgsql as $$
declare v jsonb;
begin
  execute p_sql into v;
  return is(concat_ws(' ', v #>> '{error,code}', v #>> '{error,message}'), concat_ws(' ', p_code, p_message), p_description);
end
$$;
grant execute on function pg_temp.returns_error(text, text, text, text) to booking_api;
-- Phase 6: a business email exists, so the check below proves it isn't published by default.
update public.businesses set email = 'alpha-owner@example.com' where slug = 'alpha-detail';

select pg_temp.as_booking_api();

-- Booking page: allow-listed public fields only ----------------------------------
select is(
  (select array_agg(key order by key) from jsonb_object_keys(public_api.get_booking_page('alpha-detail')) key),
  array['accepting_requests','booking_mode','branding','categories','intro','name','phone','policies','service_area','service_mode','services',
        'shop_address','size_classes','slug','timezone'],
  'booking page returns only the allow-listed keys');
select is(
  (select array_agg(key order by key) from jsonb_array_elements(public_api.get_booking_page('alpha-detail') -> 'services') s,
          jsonb_object_keys(s) key where s ->> 'name' = 'Full detail'),
  array['by_size','category_id','description','duration_min','id','is_addon','name','price_cents','price_type'],
  'service entries expose only public service fields');
select ok(public_api.get_booking_page('alpha-detail')::text !~* 'account_status|capacity|customer'
          and public_api.get_booking_page('alpha-detail')::text not like '%alpha-owner@example.com%',
          'booking page leaks no email (unless the owner publishes it: 16_branding_media), account status, capacity or customer data');
select is(public_api.get_booking_page('no-such-business'), null, 'unknown slug returns nothing');

-- Submission ---------------------------------------------------------------------------
select is(
  public_api.submit_booking_request('alpha-detail',
    pg_temp.payload(pg_temp.at_local(3, '10:00'), array[(select svc_a from k), (select addon_a from k)], (select size_a from k)),
    (select idem1 from k), (select tok1 from k), (select ip1 from k)) - 'request_number',
  '{"status": "pending", "replayed": false}'::jsonb,
  'valid request accepted as pending (returns no private data)');
select is(
  (public_api.submit_booking_request('alpha-detail',
    pg_temp.payload(pg_temp.at_local(3, '10:00'), array[(select svc_a from k)], (select size_a from k)),
    (select idem1 from k), sha256('other-token'::bytea), (select ip1 from k)) ->> 'replayed')::boolean,
  true, 'same idempotency key replays the original request instead of creating a duplicate');

select pg_temp.returns_error(format('select public_api.submit_booking_request(''alpha-detail'', %L, gen_random_uuid(), %L, %L)',
                        pg_temp.payload(pg_temp.at_local(3, '12:00'), array[(select svc_b from k)], (select size_a from k)),
                        (select tok2 from k), (select ip2 from k)),
                 'DH004', 'unknown or unavailable service', 'another business''s service is rejected');
select pg_temp.returns_error(format('select public_api.submit_booking_request(''alpha-detail'', %L, gen_random_uuid(), %L, %L)',
                        pg_temp.payload(pg_temp.at_local(3, '12:00'), array[(select quote_a from k)], (select size_a from k)),
                        (select tok2 from k), (select ip2 from k)),
                 'DH004', 'unknown or unavailable service', 'non-bookable (quote-required) service is rejected');
select pg_temp.returns_error(format('select public_api.submit_booking_request(''alpha-detail'', %L, gen_random_uuid(), %L, %L)',
                        pg_temp.payload(pg_temp.at_local(3, '12:00'), array[(select addon_a from k)], (select size_a from k)),
                        (select tok2 from k), (select ip2 from k)),
                 'DH004', 'add-ons need a main service', 'add-on alone is rejected');
select pg_temp.returns_error(format('select public_api.submit_booking_request(''alpha-detail'', %L, gen_random_uuid(), %L, %L)',
                        pg_temp.payload(pg_temp.at_local(3, '12:00'), array[(select svc_a from k)], (select size_b from k)),
                        (select tok2 from k), (select ip2 from k)),
                 'DH004', 'unknown vehicle size', 'another business''s size class is rejected');
select pg_temp.returns_error(format('select public_api.submit_booking_request(''alpha-detail'', %L, gen_random_uuid(), %L, %L)',
                        pg_temp.payload(pg_temp.at_local(3, '12:00'), array[(select svc_a from k)], (select size_a from k),
                                        '+15125550142', '{"business_id":"00000000-0000-0000-0000-000000000000"}'),
                        (select tok2 from k), (select ip2 from k)),
                 'DH004', 'invalid request', 'unknown fields (e.g. business_id) are rejected');
select pg_temp.returns_error(format('select public_api.submit_booking_request(''alpha-detail'', %L, gen_random_uuid(), %L, %L)',
                        pg_temp.payload(pg_temp.at_local(3, '12:00'), array[(select svc_a from k)], (select size_a from k),
                                        '+15125550142', '{"consent":false}'),
                        (select tok2 from k), (select ip2 from k)),
                 'DH004', 'consent is required', 'consent is required');
select pg_temp.returns_error(format('select public_api.submit_booking_request(''alpha-detail'', %L, gen_random_uuid(), %L, %L)',
                        pg_temp.payload(pg_temp.at_local(3, '12:00'), array[(select svc_a from k)], (select size_a from k),
                                        'not-a-phone'),
                        (select tok2 from k), (select ip2 from k)),
                 'DH004', 'invalid request', 'invalid phone rejected');
select pg_temp.returns_error(format('select public_api.submit_booking_request(''alpha-detail'', %L, gen_random_uuid(), %L, %L)',
                        pg_temp.payload(pg_temp.at_local(3, '23:00'), array[(select svc_a from k)], (select size_a from k)),
                        (select tok2 from k), (select ip2 from k)),
                 'DH004', 'time_unavailable', 'time outside working hours rejected');
select pg_temp.returns_error(format('select public_api.submit_booking_request(''alpha-detail'', %L, gen_random_uuid(), %L, %L)',
                        pg_temp.payload(now() - interval '1 hour', array[(select svc_a from k)], (select size_a from k)),
                        (select tok2 from k), (select ip2 from k)),
                 'DH004', 'time_unavailable', 'time in the past rejected');
select pg_temp.returns_error(format('select public_api.submit_booking_request(''alpha-detail'', %L, gen_random_uuid(), %L, %L)',
                        pg_temp.payload(pg_temp.at_local(3, '12:00'), array[(select svc_a from k)], (select size_a from k),
                                        '+15125550142', '{"location_type":"shop"}'),
                        (select tok2 from k), (select ip2 from k)),
                 'DH004', 'invalid request', 'shop visit at a mobile-only business rejected');
select throws_ok(format('select public_api.submit_booking_request(''alpha-detail'', ''not json object'', gen_random_uuid(), %L, %L)',
                        (select tok2 from k), (select ip2 from k)),
                 null, null, 'malformed payload rejected');

-- R2/D3: the ten failed attempts above were counted against ip-2 even though each failed, so
-- a further (valid) attempt from that IP is refused for the next 10 minutes.
select pg_temp.returns_error(format('select public_api.submit_booking_request(''alpha-detail'', %L, gen_random_uuid(), %L, %L)',
                        pg_temp.payload(pg_temp.at_local(3, '10:00'), array[(select svc_a from k)], (select size_a from k), '+15125550199'),
                        sha256('token-r2'::bytea), (select ip2 from k)),
                 'DH005', 'too many requests', 'failed submissions count toward the rate limit (R2 fixed)');
reset role;
select is((select count(*)::int from public.rate_limit_events where action = 'submit_failed' and key_hash = (select ip2 from k)), 10,
          'each failed submission left a rate-limit record');
select pg_temp.as_booking_api();

-- Pending requests do not consume capacity: a second customer can request 10:00 too.
select is(
  public_api.submit_booking_request('alpha-detail',
    pg_temp.payload(pg_temp.at_local(3, '10:00'), array[(select svc_a from k)], (select size_a from k), '+15125550199',
                    '{"contact_email":"sam@example.com"}'),
    gen_random_uuid(), (select tok3 from k), sha256('ip-4'::bytea)) ->> 'status',
  'pending', 'pending requests do not block the same time for others');

-- Status by token: masked, scoped to one request ---------------------------------------
select is(public_api.get_request_status((select tok1 from k), (select ip1 from k)) -> 'contact',
          '{"phone": "ending 0142", "email": "j•••@example.com"}'::jsonb, 'contact details are masked');
select ok(public_api.get_request_status((select tok1 from k), (select ip1 from k))::text !~* 'Reyes|1234 Oak|token|ip_hash|business_id',
          'status page omits name, address, hashes and internal ids');
select pg_temp.returns_error(format('select public_api.get_request_status(%L, %L)', sha256('guess'::bytea), (select ip1 from k)),
                 'DH003', 'link not valid', 'guessed token gives a generic error');

-- Duplicate detection: same contact, same vehicle, same day.
select is(
  (public_api.submit_booking_request('alpha-detail',
     pg_temp.payload(pg_temp.at_local(3, '14:00'), array[(select svc_a from k)], (select size_a from k)),
     gen_random_uuid(), sha256('token-dup'::bytea), (select ip1 from k)) ->> 'status'),
  'pending', 'second request from the same contact is accepted');
reset role;
select isnt((select duplicate_of_id from public.booking_requests where token_hash = sha256('token-dup'::bytea)), null,
            'and flagged as a possible duplicate');

-- Open-request cap (REC-05: 3 per contact) with a generic message.
select pg_temp.as_booking_api();
select lives_ok(format('select public_api.submit_booking_request(''alpha-detail'', %L, gen_random_uuid(), %L, %L)',
                       pg_temp.payload(pg_temp.at_local(4, '10:00'), array[(select svc_a from k)], (select size_a from k)),
                       sha256('token-cap3'::bytea), sha256('ip-3'::bytea)),
                'third open request from the same contact accepted');
select pg_temp.returns_error(format('select public_api.submit_booking_request(''alpha-detail'', %L, gen_random_uuid(), %L, %L)',
                        pg_temp.payload(pg_temp.at_local(5, '10:00'), array[(select svc_a from k)], (select size_a from k)),
                        sha256('token-cap4'::bytea), sha256('ip-3'::bytea)),
                 'DH004', 'request not accepted', 'fourth open request rejected without revealing why');

-- Rate limit: 5 submissions per IP per business per 10 minutes.
reset role;
insert into public.rate_limit_events (action, key_hash, business_id)
select 'submit_request', sha256('ip-flood'::bytea), (select biz_a from ctx) from generate_series(1, 5);
select pg_temp.as_booking_api();
select pg_temp.returns_error(format('select public_api.submit_booking_request(''alpha-detail'', %L, gen_random_uuid(), %L, %L)',
                        pg_temp.payload(pg_temp.at_local(6, '10:00'), array[(select svc_a from k)], (select size_a from k), '+15125550177'),
                        sha256('token-flood'::bytea), sha256('ip-flood'::bytea)),
                 'DH005', 'too many requests', 'rate limit enforced per hashed IP');

-- Proposal accepted by the customer creates the appointment at the proposed time.
reset role;
select pg_temp.as_user(pg_temp.owner_of((select biz_a from ctx)));
select lives_ok(format('select public.propose_time((select id from public.booking_requests where token_hash = %L), %L)',
                       (select tok1 from k), pg_temp.at_local(3, '15:00')),
                'owner proposes 15:00');
reset role;
select pg_temp.as_booking_api();
select is(public_api.accept_proposal((select tok1 from k), (select ip1 from k)) ->> 'status', 'approved',
          'customer accepts the proposed time');
select is((public_api.get_request_status((select tok1 from k), (select ip1 from k)) -> 'appointment' ->> 'starts_at')::timestamptz,
          pg_temp.at_local(3, '15:00'), 'appointment is at the proposed time');

-- Customer cancellation honours the owner's cutoff (24 h): 3 days ahead -> allowed.
select is(public_api.cancel_appointment((select tok1 from k), (select ip1 from k)) ->> 'status', 'cancelled',
          'customer cancels before the cutoff');

-- Withdraw a pending request.
select is(public_api.withdraw_request((select tok3 from k), (select ip2 from k)) ->> 'status', 'withdrawn',
          'customer withdraws a pending request');

-- Unpublished / paused businesses accept nothing.
reset role;
update public.businesses set accepting_requests = false where id = (select biz_b from ctx);
select pg_temp.as_booking_api();
select pg_temp.returns_error(format('select public_api.submit_booking_request(''bravo-detail'', %L, gen_random_uuid(), %L, %L)',
                        pg_temp.payload(pg_temp.at_local(3, '10:00'), array[(select svc_b from k)], (select size_b from k)),
                        sha256('token-b'::bytea), sha256('ip-b'::bytea)),
                 'DH003', 'not accepting requests', 'paused business accepts no requests');

-- Regression (review finding): temp objects created in the caller's session cannot shadow
-- type names inside SECURITY DEFINER functions (search_path = pg_catalog, pg_temp).
reset role;
select pg_temp.as_booking_api();
create temp table bytea (evil int);
create temp table jsonb (evil int);
create temp table text (evil int);
select pg_temp.returns_error(format('select public_api.get_request_status(%L, %L)', sha256('guess'::pg_catalog.bytea), sha256('ip-9'::pg_catalog.bytea)),
                 'DH003', 'link not valid', 'shadowing temp tables do not change definer function behaviour');
select is(public_api.get_request_status((select tok3 from k), (select ip2 from k)) ->> 'status', 'withdrawn',
          'definer functions still work normally with shadowing temp tables present');
reset role;

select * from finish();
rollback;
