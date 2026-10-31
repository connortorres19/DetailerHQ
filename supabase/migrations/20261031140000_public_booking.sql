-- DetailerHQ — Phase 4C, migration 11: public booking pages.
-- Builds on the Phase 1 restricted public API (migration 6) instead of replacing it:
--   1. One availability engine: app.public_time_problem() answers "why not this time?" and is
--      used both by the submission check (check_public_time) and by the new slot listing.
--   2. Slot listing for the booking page (public_api.get_available_slots).
--   3. Instant booking (D-28): when the business is in instant mode, the same submission creates
--      the customer, vehicle and appointment in one transaction, under the capacity lock.
--   4. Review finding R2 / decision D3: failed public calls now count toward rate limits. Public
--      functions return {"error": …} instead of raising, so the attempt row survives.
--   5. Publishing and owner preview: set_booking_page_live() and preview functions that show the
--      owner exactly what customers will see, before the page is live.
-- No new tables.

-- ---------------------------------------------------------------------------
-- 1. Availability: one function that names the first rule a time breaks (null = bookable).
-- ---------------------------------------------------------------------------
create function app.public_time_problem(p_business public.businesses, p_start timestamptz, p_end timestamptz)
returns text
language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
declare
  s public.booking_settings;
  v_local_start timestamp := p_start at time zone p_business.timezone;
  v_local_end timestamp := p_end at time zone p_business.timezone;
  v_day date := (p_start at time zone p_business.timezone)::date;
  v_ends_midnight boolean := v_local_end = (v_day + 1)::timestamp;
  v_resource uuid := app.general_resource_id(p_business.id);
  v_capacity smallint;
  v_window_start time;
begin
  select * into s from public.booking_settings where business_id = p_business.id;
  if p_end <= p_start then return 'invalid range'; end if;
  if p_start < now() + make_interval(mins => s.min_notice_min) then return 'too soon'; end if;
  if p_start > now() + make_interval(days => s.horizon_days) then return 'too far ahead'; end if;
  if v_local_end::date <> v_day and not v_ends_midnight then return 'spans more than one day'; end if;

  select ar.start_time into v_window_start
    from public.availability_rules ar
   where ar.business_id = p_business.id
     and ar.weekday = extract(dow from v_local_start)
     and v_local_start::time >= ar.start_time
     and case when v_ends_midnight then ar.end_time = time '24:00' else v_local_end::time <= ar.end_time end
   limit 1;
  if v_window_start is null then return 'outside working hours'; end if;
  if (extract(epoch from (v_local_start::time - v_window_start)) / 60)::integer % s.slot_interval_min <> 0 then
    return 'not an offered start time';
  end if;

  if exists (select 1 from public.time_off t
              where t.business_id = p_business.id and t.during && tstzrange(p_start, p_end, '[)')) then
    return 'time off';
  end if;

  select capacity into v_capacity from public.schedule_resources where id = v_resource;
  if app.peak_usage(v_resource, tstzrange(p_start - make_interval(mins => s.buffer_min),
                                          p_end + make_interval(mins => s.buffer_min), '[)')) + 1 > v_capacity then
    return 'fully booked';
  end if;
  if s.max_jobs_per_day is not null
     and (select count(*) from public.schedule_blocks b
           where b.resource_id = v_resource
             and (b.kind = 'appointment' or b.expires_at > now())
             and b.during && tstzrange(v_day::timestamp at time zone p_business.timezone,
                                       (v_day + 1)::timestamp at time zone p_business.timezone, '[)')
             and (lower(b.during) at time zone p_business.timezone)::date = v_day) >= s.max_jobs_per_day then
    return 'daily limit reached';
  end if;
  return null;
end
$$;

-- Same contract as before (migrations 6 and 10): raise DH004 time_unavailable, detail = rule.
create or replace function app.check_public_time(p_business public.businesses, p_start timestamptz, p_end timestamptz)
returns void
language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
declare v_problem text := app.public_time_problem(p_business, p_start, p_end);
begin
  if v_problem is not null then
    raise exception 'time_unavailable' using errcode = 'DH004', detail = v_problem;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Open start times for a choice of services and vehicle size, day by day (local dates).
--    Candidates step through each working window at the slot interval; each one is judged by
--    public_time_problem, so the list and the submission can never disagree.
-- ---------------------------------------------------------------------------
create function app.available_slots(p_business public.businesses, p_service_ids uuid[], p_size_class_id uuid,
                                    p_from date, p_days integer)
returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
as $$
declare
  s public.booking_settings;
  v_tz text := p_business.timezone;
  v_today date := (now() at time zone p_business.timezone)::date;
  v_duration integer;
  v_day date;
  v_last date;
  v_days jsonb := '[]'::jsonb;
  v_slots jsonb;
  v_prev timestamptz;
  v_start timestamptz;
  v_offset integer;
  w record;
begin
  if p_days is null or p_days < 1 or p_days > 14 then
    raise exception 'invalid request' using errcode = 'DH004';
  end if;
  select * into s from public.booking_settings where business_id = p_business.id;
  select sum(ps.duration_min)::integer into v_duration
    from app.priced_services(p_business.id, p_service_ids, p_size_class_id, true) ps;

  v_day := greatest(coalesce(p_from, v_today), v_today);
  v_last := least(v_day + p_days - 1, ((now() + make_interval(days => s.horizon_days)) at time zone v_tz)::date);
  while v_day <= v_last loop
    v_slots := '[]'::jsonb;
    v_prev := null;
    for w in select ar.start_time, ar.end_time from public.availability_rules ar
              where ar.business_id = p_business.id and ar.weekday = extract(dow from v_day)
              order by ar.start_time loop
      v_offset := 0;
      while extract(epoch from w.start_time) / 60 + v_offset + v_duration <= extract(epoch from w.end_time) / 60 loop
        v_start := (v_day + w.start_time + make_interval(mins => v_offset)) at time zone v_tz;
        -- A local time skipped by a DST change maps onto the next real instant; list it once.
        if v_start is distinct from v_prev
           and app.public_time_problem(p_business, v_start, v_start + make_interval(mins => v_duration)) is null then
          v_slots := v_slots || to_jsonb(v_start);
        end if;
        v_prev := v_start;
        v_offset := v_offset + s.slot_interval_min;
      end loop;
    end loop;
    v_days := v_days || jsonb_build_object('date', v_day, 'slots', v_slots);
    v_day := v_day + 1;
  end loop;

  return jsonb_build_object(
    'duration_min', v_duration,
    'last_bookable_date', ((now() + make_interval(days => s.horizon_days)) at time zone v_tz)::date,
    'days', v_days);
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Booking page payload (allow-listed; shared by the public page and the owner preview).
-- ---------------------------------------------------------------------------
create function app.booking_page_json(b public.businesses) returns jsonb
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'name', b.name,
    'slug', b.slug,
    'timezone', b.timezone,
    'service_mode', b.service_mode,
    'service_area', b.service_area_text,
    'shop_address', case when b.service_mode in ('shop', 'both') and b.shop_city is not null then jsonb_build_object(
                      'line1', b.shop_address_line1, 'city', b.shop_city, 'state', b.shop_state, 'postal_code', b.shop_postal_code) end,
    'phone', b.phone_e164,
    'accepting_requests', b.accepting_requests and b.account_status in ('pilot','trialing','active','past_due','cancelled'),
    'booking_mode', bs.booking_mode,
    'intro', bs.intro_text,
    'policies', jsonb_build_object(
      'cancellation', bs.cancellation_policy_text, 'rescheduling', bs.reschedule_policy_text,
      'prep_instructions', bs.prep_instructions, 'online_cancellation', bs.customer_can_cancel,
      'cancel_cutoff_hours', bs.cancel_cutoff_hours, 'min_notice_min', bs.min_notice_min,
      'horizon_days', bs.horizon_days),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.sort_order, c.name)
                              from public.service_categories c where c.business_id = b.id), '[]'::jsonb),
    'size_classes', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'examples', v.examples)
                                               order by v.sort_order)
                                from public.vehicle_size_classes v
                               where v.business_id = b.id and v.archived_at is null), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object(
                                   'id', s.id, 'name', s.name, 'description', s.description, 'category_id', s.category_id,
                                   'price_type', s.price_type, 'price_cents', s.base_price_cents,
                                   'duration_min', s.base_duration_min, 'is_addon', s.is_addon,
                                   'by_size', (select coalesce(jsonb_agg(jsonb_build_object('size_class_id', sp.size_class_id,
                                                         'price_cents', sp.price_cents, 'duration_min', sp.duration_min)), '[]'::jsonb)
                                                 from public.service_prices sp where sp.service_id = s.id and sp.business_id = b.id))
                                 order by s.sort_order, s.name)
                            from public.services s
                           where s.business_id = b.id and s.archived_at is null
                             and (s.is_bookable or s.price_type = 'quote_required')), '[]'::jsonb))
    from public.booking_settings bs
   where bs.business_id = b.id
$$;

create or replace function public_api.get_booking_page(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare b public.businesses := app.public_business(p_slug);
begin
  if b.id is null then
    return null;
  end if;
  return app.booking_page_json(b);
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Errors as results (R2/D3). A raised error rolls back the rate-limit row it would have
--    written, so failed guesses and probes were never counted. Public functions now catch
--    DH001–DH005, record the failed attempt outside the rolled-back part, and return
--    {"error": {"code", "message", "detail"}}. Unexpected errors still raise.
-- ---------------------------------------------------------------------------
create function app.public_error(p_code text, p_message text, p_detail text, p_action text, p_ip_hash bytea,
                                 p_business uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if p_action is not null and p_code <> 'DH005' and octet_length(p_ip_hash) = 32 then
    perform app.record_rate_event(p_action, p_ip_hash, p_business);
  end if;
  return jsonb_build_object('error', jsonb_build_object('code', p_code, 'message', p_message,
                                                        'detail', nullif(p_detail, '')));
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Submission. The Phase 1 body, unchanged except: the capacity lock is taken first in
--    instant mode, and instant mode books the appointment in the same transaction.
-- ---------------------------------------------------------------------------
create function app.submit_booking_request_core(
  b public.businesses, p_request jsonb, p_idempotency_key uuid, p_token_hash bytea, p_ip_hash bytea
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_mode public.booking_mode;
  v_existing public.booking_requests;
  v_service_ids uuid[];
  v_size_class uuid;
  v_start timestamptz;
  v_duration integer;
  v_total integer;
  v_minimum boolean;
  v_phone text := nullif(p_request ->> 'contact_phone_e164', '');
  v_email text := nullif(lower(p_request ->> 'contact_email'), '');
  v_duplicate uuid;
  v_request public.booking_requests;
  v_allowed_keys text[] := array['service_ids','vehicle_size_class_id','requested_start','location_type',
    'service_address_line1','service_city','service_state','service_postal_code','contact_first_name',
    'contact_last_name','contact_phone_e164','contact_email','preferred_contact','vehicle_year','vehicle_make',
    'vehicle_model','vehicle_color','vehicle_notes','customer_notes','consent'];
begin
  if b.id is null or not b.accepting_requests or not app.can_write(b.id) then
    raise exception 'not accepting requests' using errcode = 'DH003';
  end if;
  if p_idempotency_key is null or p_token_hash is null or octet_length(p_token_hash) <> 32
     or p_ip_hash is null or octet_length(p_ip_hash) <> 32 then
    raise exception 'invalid request' using errcode = 'DH004';
  end if;
  if jsonb_typeof(p_request) <> 'object' or octet_length(p_request::text) > 16384
     or exists (select 1 from jsonb_object_keys(p_request) k where k <> all (v_allowed_keys)) then
    raise exception 'invalid request' using errcode = 'DH004';
  end if;

  -- Idempotent replay: same form session returns the original request.
  select * into v_existing from public.booking_requests
   where business_id = b.id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('request_number', v_existing.number, 'status', v_existing.status, 'replayed', true);
  end if;

  perform app.enforce_rate_limit('submit_request', p_ip_hash, b.id, 5, interval '10 minutes');
  perform app.enforce_rate_limit('submit_request', p_ip_hash, null, 20, interval '1 day');
  perform app.enforce_rate_limit('submit_request', null, b.id, 60, interval '1 hour');

  if coalesce((p_request ->> 'consent')::boolean, false) is not true then
    raise exception 'consent is required' using errcode = 'DH004';
  end if;
  if v_phone is null and v_email is null then
    raise exception 'phone or email is required' using errcode = 'DH004';
  end if;

  -- Open-request cap per contact (REC-05). Generic message: never reveals other requests.
  if (select count(*) from public.booking_requests r
       where r.business_id = b.id and r.status in ('pending', 'time_proposed')
         and ((v_phone is not null and r.contact_phone_e164 = v_phone)
              or (v_email is not null and r.contact_email = v_email::extensions.citext))) >= 3 then
    raise exception 'request not accepted' using errcode = 'DH004';
  end if;

  begin
    v_service_ids := array(select jsonb_array_elements_text(p_request -> 'service_ids')::uuid);
    v_size_class := (p_request ->> 'vehicle_size_class_id')::uuid;
    v_start := (p_request ->> 'requested_start')::timestamptz;
  exception when others then
    raise exception 'invalid request' using errcode = 'DH004';
  end;
  if v_size_class is null or v_start is null then
    raise exception 'invalid request' using errcode = 'DH004';
  end if;
  if (b.service_mode = 'mobile' and p_request ->> 'location_type' <> 'mobile')
     or (b.service_mode = 'shop' and p_request ->> 'location_type' <> 'shop') then
    raise exception 'invalid request' using errcode = 'DH004';
  end if;

  select bs.booking_mode into v_mode from public.booking_settings bs where bs.business_id = b.id;
  -- Instant: serialise with every other booking for this business before checking the time,
  -- so the check and the appointment insert see the same schedule.
  if v_mode = 'instant' then
    perform app.lock_resource(app.general_resource_id(b.id));
  end if;

  select sum(ps.duration_min)::integer, sum(ps.price_cents)::integer, bool_or(ps.price_type = 'starting_at')
    into v_duration, v_total, v_minimum
    from app.priced_services(b.id, v_service_ids, v_size_class, true) ps;

  perform app.check_public_time(b, v_start, v_start + make_interval(mins => v_duration));

  select r.id into v_duplicate from public.booking_requests r
   where r.business_id = b.id and r.status in ('pending', 'time_proposed')
     and ((v_phone is not null and r.contact_phone_e164 = v_phone)
          or (v_email is not null and r.contact_email = v_email::extensions.citext))
     and lower(r.vehicle_make) = lower(p_request ->> 'vehicle_make')
     and lower(r.vehicle_model) = lower(p_request ->> 'vehicle_model')
     and (r.requested_start at time zone b.timezone)::date = (v_start at time zone b.timezone)::date
   order by r.created_at
   limit 1;

  insert into public.booking_requests (
    business_id, token_hash, idempotency_key, requested_start, requested_end, location_type,
    service_address_line1, service_city, service_state, service_postal_code,
    contact_first_name, contact_last_name, contact_phone_e164, contact_email, preferred_contact,
    vehicle_year, vehicle_make, vehicle_model, vehicle_color, vehicle_size_class_id, vehicle_notes,
    customer_notes, consent_at, estimated_total_cents, estimate_is_minimum, estimated_duration_min,
    duplicate_of_id, ip_hash)
  values (
    b.id, p_token_hash, p_idempotency_key, v_start, v_start + make_interval(mins => v_duration),
    (p_request ->> 'location_type')::public.location_type,
    p_request ->> 'service_address_line1', p_request ->> 'service_city', p_request ->> 'service_state',
    p_request ->> 'service_postal_code',
    p_request ->> 'contact_first_name', p_request ->> 'contact_last_name', v_phone, v_email,
    (p_request ->> 'preferred_contact')::public.contact_preference,
    (p_request ->> 'vehicle_year')::smallint, p_request ->> 'vehicle_make', p_request ->> 'vehicle_model',
    p_request ->> 'vehicle_color', v_size_class, p_request ->> 'vehicle_notes',
    p_request ->> 'customer_notes', now(), v_total, v_minimum, v_duration, v_duplicate, p_ip_hash)
  returning * into v_request;

  insert into public.booking_request_items (business_id, booking_request_id, service_id, name, price_type,
                                            price_cents, duration_min, is_addon)
  select b.id, v_request.id, ps.service_id, ps.name, ps.price_type, ps.price_cents, ps.duration_min, ps.is_addon
    from app.priced_services(b.id, v_service_ids, v_size_class, true) ps;

  insert into public.activity_events (business_id, booking_request_id, kind, to_status, actor_type)
  values (b.id, v_request.id, 'request_submitted', 'pending', 'customer');

  -- Instant booking (D-28/D-32): new customer + vehicle from the request (never merged; possible
  -- duplicates are shown to the owner), then the appointment. The capacity trigger re-checks
  -- under the lock taken above; any failure rolls the whole submission back.
  if v_mode = 'instant' then
    perform set_config('app.actor_type', 'customer', true);
    perform app.link_request_customer(v_request, null, null);
    perform app.appointment_from_request(v_request.id, v_request.requested_start, v_request.requested_end);
    update public.booking_requests set status = 'approved', decided_at = now() where id = v_request.id;
  end if;

  perform app.record_rate_event('submit_request', p_ip_hash, b.id);
  return jsonb_build_object('request_number', v_request.number,
                            'status', case when v_mode = 'instant' then 'approved' else 'pending' end,
                            'replayed', false);
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range or check_violation or not_null_violation then
    raise exception 'invalid request' using errcode = 'DH004';
end
$$;

-- Failed submissions count too: 10 per hashed IP per 10 minutes, across businesses.
create or replace function public_api.submit_booking_request(
  p_slug text, p_request jsonb, p_idempotency_key uuid, p_token_hash bytea, p_ip_hash bytea
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  b public.businesses := app.public_business(p_slug);
  v_code text; v_message text; v_detail text;
begin
  if octet_length(p_ip_hash) = 32 then
    perform app.enforce_rate_limit('submit_failed', p_ip_hash, null, 10, interval '10 minutes');
  end if;
  return app.submit_booking_request_core(b, p_request, p_idempotency_key, p_token_hash, p_ip_hash);
exception when sqlstate 'DH001' or sqlstate 'DH002' or sqlstate 'DH003' or sqlstate 'DH004' or sqlstate 'DH005' then
  get stacked diagnostics v_code = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail;
  -- Capacity taken between the check and the insert (instant mode): same answer as a taken slot.
  if v_code = 'DH001' then
    v_code := 'DH004'; v_message := 'time_unavailable'; v_detail := 'fully booked';
  end if;
  return app.public_error(v_code, v_message, v_detail, 'submit_failed', p_ip_hash, b.id);
end
$$;

create function public_api.get_available_slots(p_slug text, p_service_ids uuid[], p_size_class_id uuid,
                                               p_from date, p_days integer, p_ip_hash bytea)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  b public.businesses := app.public_business(p_slug);
  v_result jsonb;
  v_code text; v_message text; v_detail text;
begin
  if p_ip_hash is null or octet_length(p_ip_hash) <> 32 then
    raise exception 'invalid request' using errcode = 'DH004';
  end if;
  perform app.enforce_rate_limit('slots', p_ip_hash, null, 120, interval '10 minutes');
  if b.id is null or not b.accepting_requests or not app.can_write(b.id) then
    raise exception 'not accepting requests' using errcode = 'DH003';
  end if;
  v_result := app.available_slots(b, p_service_ids, p_size_class_id, p_from, p_days);
  perform app.record_rate_event('slots', p_ip_hash, null);
  return v_result;
exception when sqlstate 'DH003' or sqlstate 'DH004' or sqlstate 'DH005' then
  get stacked diagnostics v_code = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail;
  return app.public_error(v_code, v_message, v_detail, 'slots', p_ip_hash, null);
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Status-link functions: Phase 1 bodies moved to app.*_core (status payload extended with
--    the price breakdown); the public wrappers count failed lookups — 10 per hashed IP per
--    10 minutes — on top of the existing 30 successful token actions.
-- ---------------------------------------------------------------------------
create function app.request_status_core(p_token_hash bytea, p_ip_hash bytea) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  r public.booking_requests := app.request_by_token(p_token_hash, p_ip_hash, false);
  b public.businesses;
  s public.booking_settings;
  a public.appointments;
  v_status public.request_status := app.effective_request_status(r);
  v_hold boolean;
begin
  select * into b from public.businesses where id = r.business_id;
  select * into s from public.booking_settings where business_id = r.business_id;
  select * into a from public.appointments where booking_request_id = r.id and business_id = r.business_id;
  select exists (select 1 from public.schedule_blocks where booking_request_id = r.id and kind = 'hold' and expires_at > now())
    into v_hold;

  return jsonb_build_object(
    'request_number', r.number,
    'status', v_status,
    'time_held', v_status = 'pending' and v_hold,
    'business', jsonb_build_object('name', b.name, 'phone', b.phone_e164, 'timezone', b.timezone,
                                   'slug', case when b.published_at is not null then b.slug end),
    'requested_start', r.requested_start,
    'requested_end', r.requested_end,
    'proposal', case when v_status = 'time_proposed' then jsonb_build_object(
                  'start', r.proposed_start, 'end', r.proposed_end,
                  'message', r.proposal_message, 'answer_by', r.proposal_expires_at) end,
    'decline_message', case when v_status = 'declined' then r.decline_message end,
    'services', (select jsonb_agg(i.name order by i.is_addon, i.name) from public.booking_request_items i
                  where i.booking_request_id = r.id and i.business_id = r.business_id),
    'items', (select jsonb_agg(jsonb_build_object('name', i.name, 'price_type', i.price_type, 'price_cents', i.price_cents,
                                                  'duration_min', i.duration_min, 'is_addon', i.is_addon)
                               order by i.is_addon, i.name)
                from public.booking_request_items i
               where i.booking_request_id = r.id and i.business_id = r.business_id),
    'size_class', (select v.name from public.vehicle_size_classes v where v.id = r.vehicle_size_class_id and v.business_id = r.business_id),
    'vehicle', concat_ws(' ', r.vehicle_year::text, r.vehicle_make, r.vehicle_model, r.vehicle_color),
    'location_type', r.location_type,
    'estimate_cents', r.estimated_total_cents,
    'estimate_is_minimum', r.estimate_is_minimum,
    'duration_min', r.estimated_duration_min,
    'contact', jsonb_build_object('phone', app.mask_phone(r.contact_phone_e164), 'email', app.mask_email(r.contact_email::text)),
    'can_withdraw', r.status in ('pending', 'time_proposed') and v_status in ('pending', 'time_proposed'),
    'appointment', case when a.id is not null then jsonb_build_object(
                     'status', a.status, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
                     'cancelled_by', a.cancelled_by, 'customer_message', a.customer_message,
                     'can_cancel', a.status = 'scheduled' and s.customer_can_cancel
                                   and now() < a.starts_at - make_interval(hours => s.cancel_cutoff_hours)) end,
    'policies', jsonb_build_object('cancellation', s.cancellation_policy_text, 'rescheduling', s.reschedule_policy_text,
                                   'prep_instructions', s.prep_instructions,
                                   'online_cancellation', s.customer_can_cancel,
                                   'cancel_cutoff_hours', s.cancel_cutoff_hours,
                                   'reschedule_cutoff_hours', s.reschedule_cutoff_hours)
  );
end
$$;

create function app.withdraw_request_core(p_token_hash bytea, p_ip_hash bytea) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare r public.booking_requests := app.request_by_token(p_token_hash, p_ip_hash, true);
begin
  if r.status not in ('pending', 'time_proposed') then
    raise exception 'request can no longer be withdrawn' using errcode = 'DH002';
  end if;
  perform set_config('app.actor_type', 'customer', true);
  update public.booking_requests set status = 'withdrawn' where id = r.id;
  return jsonb_build_object('status', 'withdrawn');
end
$$;

create function app.decline_proposal_core(p_token_hash bytea, p_ip_hash bytea) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare r public.booking_requests := app.request_by_token(p_token_hash, p_ip_hash, true);
begin
  if app.effective_request_status(r) <> 'time_proposed' then
    raise exception 'there is no suggested time to decline' using errcode = 'DH002';
  end if;
  perform set_config('app.actor_type', 'customer', true);
  update public.booking_requests set status = 'proposal_declined' where id = r.id;
  return jsonb_build_object('status', 'proposal_declined');
end
$$;

create function app.accept_proposal_core(p_token_hash bytea, p_ip_hash bytea) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare r public.booking_requests := app.request_by_token(p_token_hash, p_ip_hash, true);
begin
  if r.status <> 'time_proposed' then
    raise exception 'there is no suggested time to accept' using errcode = 'DH002';
  end if;
  perform set_config('app.actor_type', 'customer', true);
  if r.proposal_expires_at <= now() then
    update public.booking_requests set status = 'expired' where id = r.id;
    return jsonb_build_object('status', 'expired');
  end if;

  begin
    perform app.appointment_from_request(r.id, r.proposed_start, r.proposed_end);
    update public.booking_requests set status = 'approved', decided_at = now() where id = r.id;
    return jsonb_build_object('status', 'approved');
  exception when sqlstate 'DH001' then
    -- The held time is no longer available: back to pending, owner follows up (§6.6.7).
    update public.booking_requests
       set status = 'pending', proposed_start = null, proposed_end = null, proposal_expires_at = null
     where id = r.id;
    return jsonb_build_object('status', 'pending', 'reason', 'time_no_longer_available');
  end;
end
$$;

create function app.cancel_appointment_core(p_token_hash bytea, p_ip_hash bytea, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  r public.booking_requests := app.request_by_token(p_token_hash, p_ip_hash, true);
  s public.booking_settings;
  a public.appointments;
begin
  select * into s from public.booking_settings where business_id = r.business_id;
  select * into a from public.appointments where booking_request_id = r.id and business_id = r.business_id for update;
  if a.id is null or a.status <> 'scheduled' then
    raise exception 'there is no upcoming appointment to cancel' using errcode = 'DH002';
  end if;
  -- Exactly at the cutoff counts as after it (§6.9).
  if not s.customer_can_cancel or now() >= a.starts_at - make_interval(hours => s.cancel_cutoff_hours) then
    raise exception 'online cancellation is not available for this appointment' using errcode = 'DH002';
  end if;
  perform set_config('app.actor_type', 'customer', true);
  update public.appointments
     set status = 'cancelled', cancelled_by = 'customer', cancelled_at = now(), cancel_reason = left(p_reason, 500)
   where id = a.id;
  return jsonb_build_object('status', 'cancelled');
end
$$;

-- One wrapper shape for every token action: failed-lookup limit, then the core, errors as results.
-- 'link not valid' (DH003) is the only failure recorded as a guess.
create function app.token_call(p_action text, p_token_hash bytea, p_ip_hash bytea, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_code text; v_message text; v_detail text;
begin
  if octet_length(p_ip_hash) = 32 then
    perform app.enforce_rate_limit('token_failed', p_ip_hash, null, 10, interval '10 minutes');
  end if;
  return case p_action
    when 'status' then app.request_status_core(p_token_hash, p_ip_hash)
    when 'withdraw' then app.withdraw_request_core(p_token_hash, p_ip_hash)
    when 'decline' then app.decline_proposal_core(p_token_hash, p_ip_hash)
    when 'accept' then app.accept_proposal_core(p_token_hash, p_ip_hash)
    when 'cancel' then app.cancel_appointment_core(p_token_hash, p_ip_hash, p_reason)
  end;
exception when sqlstate 'DH001' or sqlstate 'DH002' or sqlstate 'DH003' or sqlstate 'DH004' or sqlstate 'DH005' then
  get stacked diagnostics v_code = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail;
  return app.public_error(v_code, v_message, v_detail, case when v_code = 'DH003' then 'token_failed' end, p_ip_hash, null);
end
$$;

create or replace function public_api.get_request_status(p_token_hash bytea, p_ip_hash bytea) returns jsonb
language sql security definer set search_path = pg_catalog, pg_temp
as $$ select app.token_call('status', p_token_hash, p_ip_hash, null) $$;
create or replace function public_api.withdraw_request(p_token_hash bytea, p_ip_hash bytea) returns jsonb
language sql security definer set search_path = pg_catalog, pg_temp
as $$ select app.token_call('withdraw', p_token_hash, p_ip_hash, null) $$;
create or replace function public_api.decline_proposal(p_token_hash bytea, p_ip_hash bytea) returns jsonb
language sql security definer set search_path = pg_catalog, pg_temp
as $$ select app.token_call('decline', p_token_hash, p_ip_hash, null) $$;
create or replace function public_api.accept_proposal(p_token_hash bytea, p_ip_hash bytea) returns jsonb
language sql security definer set search_path = pg_catalog, pg_temp
as $$ select app.token_call('accept', p_token_hash, p_ip_hash, null) $$;
create or replace function public_api.cancel_appointment(p_token_hash bytea, p_ip_hash bytea, p_reason text default null) returns jsonb
language sql security definer set search_path = pg_catalog, pg_temp
as $$ select app.token_call('cancel', p_token_hash, p_ip_hash, p_reason) $$;

-- ---------------------------------------------------------------------------
-- 7. Owner: put the booking page live / take it offline, and preview it in any state.
--    Going live needs an activated account (email confirmed), working hours and at least one
--    bookable main service. Offline = unpublished (the public page shows "not available").
-- ---------------------------------------------------------------------------
create function app.set_booking_page_live_impl(p_live boolean) returns boolean
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  b public.businesses;
begin
  perform app.require_member(v_business); -- members only; read-only accounts refused
  select * into b from public.businesses where id = v_business for update;
  if p_live then
    if b.activated_at is null then
      raise exception 'confirm your email before publishing' using errcode = 'DH004', detail = 'publish_needs_activation';
    end if;
    if not exists (select 1 from public.availability_rules r where r.business_id = v_business) then
      raise exception 'add working hours before publishing' using errcode = 'DH004', detail = 'publish_needs_hours';
    end if;
    if not exists (select 1 from public.services s where s.business_id = v_business and s.archived_at is null
                     and s.is_bookable and not s.is_addon) then
      raise exception 'add a bookable service before publishing' using errcode = 'DH004', detail = 'publish_needs_services';
    end if;
    update public.businesses set published_at = coalesce(published_at, now()), accepting_requests = true where id = v_business;
  else
    update public.businesses set accepting_requests = false, published_at = null where id = v_business;
  end if;
  return p_live;
end
$$;

create function app.preview_booking_page_impl() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare b public.businesses;
begin
  perform app.require_member(app.caller_business_id(), false);
  select * into b from public.businesses where id = app.caller_business_id();
  return app.booking_page_json(b) || jsonb_build_object('published', b.published_at is not null);
end
$$;

create function app.preview_available_slots_impl(p_service_ids uuid[], p_size_class_id uuid, p_from date, p_days integer)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare b public.businesses;
begin
  perform app.require_member(app.caller_business_id(), false);
  select * into b from public.businesses where id = app.caller_business_id();
  return app.available_slots(b, p_service_ids, p_size_class_id, p_from, p_days);
end
$$;

create function public.set_booking_page_live(p_live boolean) returns boolean
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.set_booking_page_live_impl(p_live) $$;
create function public.preview_booking_page() returns jsonb
language sql stable security invoker set search_path = pg_catalog, pg_temp
as $$ select app.preview_booking_page_impl() $$;
create function public.preview_available_slots(p_service_ids uuid[], p_size_class_id uuid, p_from date, p_days integer)
returns jsonb
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.preview_available_slots_impl(p_service_ids, p_size_class_id, p_from, p_days) $$;

-- ---------------------------------------------------------------------------
-- Privileges. New functions are executable by PUBLIC by default: remove that everywhere,
-- then grant exactly what each caller needs.
-- ---------------------------------------------------------------------------
revoke all on function
  app.public_time_problem(public.businesses, timestamptz, timestamptz),
  app.available_slots(public.businesses, uuid[], uuid, date, integer),
  app.booking_page_json(public.businesses),
  app.public_error(text, text, text, text, bytea, uuid),
  app.submit_booking_request_core(public.businesses, jsonb, uuid, bytea, bytea),
  app.request_status_core(bytea, bytea),
  app.withdraw_request_core(bytea, bytea),
  app.decline_proposal_core(bytea, bytea),
  app.accept_proposal_core(bytea, bytea),
  app.cancel_appointment_core(bytea, bytea, text),
  app.token_call(text, bytea, bytea, text),
  app.set_booking_page_live_impl(boolean),
  app.preview_booking_page_impl(),
  app.preview_available_slots_impl(uuid[], uuid, date, integer),
  public.set_booking_page_live(boolean),
  public.preview_booking_page(),
  public.preview_available_slots(uuid[], uuid, date, integer),
  public_api.get_available_slots(text, uuid[], uuid, date, integer, bytea)
from public, anon, authenticated, service_role;

grant execute on function public_api.get_available_slots(text, uuid[], uuid, date, integer, bytea) to booking_api;

-- Owners: the invoker wrappers and the *_impl functions they call (pattern of migration 5).
grant execute on function
  public.set_booking_page_live(boolean), public.preview_booking_page(),
  public.preview_available_slots(uuid[], uuid, date, integer),
  app.set_booking_page_live_impl(boolean), app.preview_booking_page_impl(),
  app.preview_available_slots_impl(uuid[], uuid, date, integer)
to authenticated;
