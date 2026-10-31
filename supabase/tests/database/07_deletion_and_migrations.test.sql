-- Full business deletion leaves no rows behind and touches no other business (§12.6);
-- the migration history matches the files applied from a clean database.
begin;
\ir _helpers.psql
select plan(7);

select is(
  (select array_agg(version order by version) from supabase_migrations.schema_migrations),
  array['20261030120000','20261030120100','20261030120200','20261030120300','20261030120400',
        '20261030120500','20261030120600','20261030120700','20261031120000','20261031130000','20261031140000'],
  'all eleven migrations are recorded, in order');

create temp table ctx as
select pg_temp.make_business('a@example.com', 'alpha-detail', 'shop', 2) as biz_a,
       pg_temp.make_business('b@example.com', 'bravo-detail', 'mobile') as biz_b;
grant select on ctx to authenticated;

-- Business A gets data in every table, including tricky references (duplicates, leads
-- pointing at requests, sent quotes, completed and cancelled appointments).
do $$
declare
  a uuid := (select biz_a from ctx);
  r1 uuid := pg_temp.make_request(a, pg_temp.at_local(2, '09:00'));
  r2 uuid := pg_temp.make_request(a, pg_temp.at_local(2, '09:00'), 120, '+15125550133');
  r3 uuid := pg_temp.make_request(a, pg_temp.at_local(3, '09:00'));
  v_appt uuid;
  v_quote uuid;
begin
  insert into public.booking_request_items (business_id, booking_request_id, service_id, name, price_type, price_cents, duration_min, is_addon)
  values (a, r1, pg_temp.service_id(a, 'Full detail'), 'Full detail', 'fixed', 26000, 120, false);
  insert into public.time_off (business_id, during) values (a, tstzrange(now() + interval '40 days', now() + interval '41 days'));
  insert into public.service_categories (business_id, name) values (a, 'Exterior');
  insert into public.service_prices (business_id, service_id, size_class_id, price_cents)
  values (a, pg_temp.service_id(a, 'Full detail'), pg_temp.size_class_id(a), 30000);
  insert into public.rate_limit_events (action, key_hash, business_id) values ('submit_request', sha256('x'::bytea), a);

  perform pg_temp.as_user(pg_temp.owner_of(a));
  v_appt := public.approve_request(r1);
  perform public.place_hold(r2, 24);
  perform public.close_duplicate(r3, r1);
  perform public.start_appointment(v_appt);
  execute 'reset role';

  insert into public.leads (business_id, source, contact_first_name, contact_phone_e164, booking_request_id)
  values (a, 'booking_page', 'Lead', '+15125550144', r3);
  insert into public.quotes (business_id, number, customer_id)
  values (a, 0, (select customer_id from public.appointments where id = v_appt)) returning id into v_quote;
  insert into public.quote_items (business_id, quote_id, name, price_cents) values (a, v_quote, 'Coating', 90000);
  update public.quotes set status = 'sent', sent_at = now() where id = v_quote;
end
$$;

create temp table before_b as
select (select count(*) from public.customers where business_id = (select biz_b from ctx))
     + (select count(*) from public.services where business_id = (select biz_b from ctx))
     + (select count(*) from public.schedule_resources where business_id = (select biz_b from ctx)) as n;

select lives_ok(format('select app.delete_business_data(%L)', (select biz_a from ctx)), 'business A deleted');

select is(
  (select sum(cnt)::int from (
     select (xpath('/row/c/text()', query_to_xml(format(
               'select count(*) as c from public.%I where %I = %L', c.relname,
               case when c.relname = 'businesses' then 'id' else 'business_id' end, (select biz_a from ctx)),
             false, true, '')))[1]::text::int as cnt
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r') t),
  0, 'no row with business A''s id remains in any public table');

select is((select count(*)::int from public.memberships where business_id = (select biz_a from ctx)), 0, 'membership removed');
select is(
  (select (select count(*) from public.customers where business_id = (select biz_b from ctx))
        + (select count(*) from public.services where business_id = (select biz_b from ctx))
        + (select count(*) from public.schedule_resources where business_id = (select biz_b from ctx)))::bigint,
  (select n from before_b), 'business B is untouched');

select pg_temp.as_user(pg_temp.owner_of((select biz_b from ctx)));
select throws_ok(format('select app.delete_business_data(%L)', (select biz_b from ctx)), '42501', null,
                 'owners cannot call the deletion function');
reset role;
select throws_ok('select app.delete_business_data(gen_random_uuid())', 'DH003', 'not found', 'unknown business id');

select * from finish();
rollback;
