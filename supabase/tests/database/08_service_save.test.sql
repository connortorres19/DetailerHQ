-- Phase 4A follow-up: atomic service saves (public.save_service) and clear pricing errors (F-4A-1).
begin;
\ir _helpers.psql
select plan(19);

select pg_temp.make_business('svc-a@example.com', 'svc-save-a', 'shop', 2) as a \gset
select pg_temp.make_business('svc-b@example.com', 'svc-save-b', 'mobile') as b \gset
select pg_temp.owner_of(:'a') as owner_a \gset
select pg_temp.owner_of(:'b') as owner_b \gset
select id as size_a1 from public.vehicle_size_classes where business_id = :'a' order by sort_order limit 1 \gset
select id as size_a2 from public.vehicle_size_classes where business_id = :'a' order by sort_order offset 1 limit 1 \gset
select id as size_b1 from public.vehicle_size_classes where business_id = :'b' order by sort_order limit 1 \gset
select pg_temp.service_id(:'a', 'Full detail') as svc_a \gset
select pg_temp.service_id(:'b', 'Full detail') as svc_b \gset

-- ---- Happy path -----------------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select public.save_service(null,
  '{"name":"Package","price_type":"fixed","base_price_cents":26000,"base_duration_min":240,"is_bookable":true}',
  jsonb_build_array(jsonb_build_object('size_class_id', :'size_a1', 'price_cents', 30000, 'duration_min', 300),
                    jsonb_build_object('size_class_id', :'size_a2', 'duration_min', 270))) as new_svc \gset
reset role;
select is((select count(*)::int from public.service_prices where service_id = :'new_svc'), 2, 'create: service and both size rows saved together');
select is((select base_price_cents from public.services where id = :'new_svc'), 26000, 'create: price stored in cents');

-- Update replaces the grid: size 2 dropped, size 1 changed.
select pg_temp.as_user(:'owner_a');
select public.save_service(:'new_svc',
  '{"name":"Package v2","price_type":"fixed","base_price_cents":27000,"base_duration_min":240,"is_bookable":true}',
  jsonb_build_array(jsonb_build_object('size_class_id', :'size_a1', 'price_cents', 31000)));
reset role;
select results_eq(
  format($$select size_class_id, price_cents, duration_min from public.service_prices where service_id = %L$$, :'new_svc'),
  format($$values (%L::uuid, 31000, null::integer)$$, :'size_a1'),
  'update: grid replaced exactly (removed size gone, changed size updated)');
select is((select name from public.services where id = :'new_svc'), 'Package v2', 'update: service fields saved');

-- ---- Atomicity: any failing part rolls back the whole save -------------------------------
select pg_temp.as_user(:'owner_a');
select throws_ok(
  $$select public.save_service(null, '{"name":"Should not exist","price_type":"fixed","base_price_cents":100,"base_duration_min":60}',
      jsonb_build_array(jsonb_build_object('size_class_id', '$$ || :'size_a1' || $$', 'price_cents', -5)))$$,
  '23514', null, 'create with an invalid price row fails (check constraint)');
reset role;
select is((select count(*)::int from public.services where name = 'Should not exist'), 0, 'create: failed price row → no service row left behind');

select pg_temp.as_user(:'owner_a');
select throws_ok(
  $$select public.save_service('$$ || :'new_svc' || $$', '{"name":"Half saved?","price_type":"fixed","base_price_cents":1,"base_duration_min":60}',
      jsonb_build_array(jsonb_build_object('size_class_id', '$$ || :'size_a2' || $$', 'duration_min', 5)))$$,
  '23514', null, 'update with an invalid duration row fails');
reset role;
select is((select name || ' ' || base_price_cents from public.services where id = :'new_svc'), 'Package v2 27000', 'update: failed price row → service fields unchanged');
select is((select count(*)::int from public.service_prices where service_id = :'new_svc'), 1, 'update: failed save → price grid unchanged');

select pg_temp.as_user(:'owner_a');
select throws_ok(
  $$select public.save_service(null, '{"name":"Bad","price_type":"quote_required","base_duration_min":60,"is_bookable":true}', '[]')$$,
  '23514', null, 'database still forbids a bookable quote-required service');
reset role;

-- ---- Clear errors for duplicate and foreign sizes ------------------------------------------
select pg_temp.as_user(:'owner_a');
select throws_ok(
  format($$select public.save_service(null, '{"name":"Dup","price_type":"fixed","base_price_cents":100,"base_duration_min":60}',
      jsonb_build_array(jsonb_build_object('size_class_id', %L, 'price_cents', 1), jsonb_build_object('size_class_id', %L, 'price_cents', 2)))$$,
    :'size_a1', :'size_a1'),
  'DH004', 'each vehicle size can be priced once', 'duplicate size in one save → clear DH004');
select throws_ok(
  format($$select public.save_service(null, '{"name":"Foreign","price_type":"fixed","base_price_cents":100,"base_duration_min":60}',
      jsonb_build_array(jsonb_build_object('size_class_id', %L, 'price_cents', 1)))$$, :'size_b1'),
  'DH003', 'unknown vehicle size', 'another business''s size → clear DH003');
reset role;
select is((select count(*)::int from public.services where name in ('Dup', 'Foreign')), 0, 'rejected saves leave nothing behind');

-- F-4A-1: B inserting a price for A's ALREADY-PRICED (service, size) pair now gets DH003, not 23505.
insert into public.service_prices (business_id, service_id, size_class_id, price_cents) values (:'a', :'svc_a', :'size_a1', 500);
select pg_temp.as_user(:'owner_b');
select throws_ok(
  format($$insert into public.service_prices (business_id, service_id, size_class_id, price_cents) values (%L, %L, %L, 1)$$, :'b', :'svc_a', :'size_a1'),
  'DH003', 'unknown service', 'F-4A-1 fixed: foreign priced pair → DH003 (no existence leak via 23505)');
select throws_ok(
  format($$insert into public.service_prices (business_id, service_id, size_class_id, price_cents) values (%L, %L, %L, 1)$$, :'b', :'svc_b', :'size_a1'),
  'DH003', 'unknown vehicle size', 'own service with another business''s size → DH003');

-- B can't save over A's service, and A's data is untouched.
select throws_ok(
  format($$select public.save_service(%L, '{"name":"Hijack","price_type":"fixed","base_price_cents":1,"base_duration_min":60}', '[]')$$, :'new_svc'),
  'DH003', 'service not found', 'B saving A''s service id → not found');
reset role;
select is((select name from public.services where id = :'new_svc'), 'Package v2', 'A''s service unchanged after B''s attempt');

-- Privileges.
select ok(not has_function_privilege('anon', 'public.save_service(uuid,jsonb,jsonb)', 'EXECUTE'), 'anon cannot call save_service');
select ok(has_function_privilege('authenticated', 'public.save_service(uuid,jsonb,jsonb)', 'EXECUTE'), 'owners can call save_service');

select * from finish();
rollback;
