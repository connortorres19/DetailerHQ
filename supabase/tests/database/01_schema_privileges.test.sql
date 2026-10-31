-- Catalog checks: migrations produce the expected objects; RLS and explicit privileges
-- everywhere (D-22); no SECURITY DEFINER in the exposed schema (REC-25); booking_api is
-- restricted to the public_api functions (D-21).
begin;
\ir _helpers.psql
select plan(26);

select tables_are('public', array[
  'businesses','memberships','business_counters','booking_settings','availability_rules','time_off',
  'schedule_resources','vehicle_size_classes','service_categories','services','service_prices',
  'customers','vehicles','leads','quotes','quote_items','booking_requests','booking_request_items',
  'appointments','appointment_items','schedule_blocks','activity_events','rate_limit_events'
], 'public schema contains exactly the Phase 1 tables');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0, 'every public table has RLS enabled');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'app', 'public_api') and c.relkind in ('r', 'v', 'm', 'S', 'p')
      and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE')))),
  0, 'anon has no privilege on any application table, view or sequence');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'app', 'public_api') and c.relkind in ('r', 'v', 'm', 'p')
      and has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
  0, 'service_role (secret key) has no privilege on application tables');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('authenticated', c.oid, 'TRUNCATE,REFERENCES,TRIGGER')),
  0, 'authenticated has no TRUNCATE/REFERENCES/TRIGGER (Supabase default grants removed)');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'app', 'public_api') and c.relkind in ('r', 'v', 'm', 'S', 'p')
      and has_table_privilege('booking_api', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
  0, 'booking_api has no table privileges');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app', 'public_api') and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 'anon cannot execute any application function');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app', 'public_api')
      and has_function_privilege('service_role', p.oid, 'EXECUTE')),
  0, 'service_role cannot execute application functions');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public_api' and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0, 'owners (authenticated) cannot execute public_api functions');

select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public_api' and has_function_privilege('booking_api', p.oid, 'EXECUTE')),
  array['accept_proposal','accept_quote','cancel_appointment','decline_proposal','decline_quote','get_available_slots','get_booking_page',
        'get_quote','get_request_status','submit_booking_request','submit_inquiry','withdraw_request'],
  'booking_api can execute exactly the public_api functions');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app') and has_function_privilege('booking_api', p.oid, 'EXECUTE')),
  0, 'booking_api cannot execute owner or internal functions');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef),
  0, 'no SECURITY DEFINER function in the exposed public schema');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app', 'public_api') and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c = 'search_path=pg_catalog, pg_temp')),
  0, 'every application function pins search_path to pg_catalog, pg_temp (temp schema searched last)');

select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and has_function_privilege('authenticated', p.oid, 'EXECUTE') and p.proname not like '%\_impl'),
  array['can_write','is_member','is_us_timezone','is_valid_block_range','is_valid_email','is_valid_us_phone'],
  'owners can execute only policy/constraint helpers and *_impl functions in app');

select is(
  (select provolatile::text from pg_proc where oid = 'app.peak_usage(uuid,tstzrange,uuid[])'::regprocedure),
  'v', 'peak_usage is VOLATILE (fresh snapshot per statement)');
select is(
  (select provolatile::text from pg_proc where oid = 'app.tg_enforce_capacity()'::regprocedure),
  'v', 'capacity trigger function is VOLATILE');
select is(
  (select provolatile::text from pg_proc where oid = 'app.lock_resource(uuid)'::regprocedure),
  'v', 'lock_resource is VOLATILE');

select is(
  (select rolbypassrls from pg_roles where rolname = 'postgres'), true,
  'postgres (owner of definer functions) has BYPASSRLS — RLS not forced (REC-21)');
select is(
  (select (rolbypassrls, rolsuper, rolinherit) from pg_roles where rolname = 'booking_api'), (false, false, false),
  'booking_api: no BYPASSRLS, not superuser, NOINHERIT');
select is(
  (select rolconfig from pg_roles where rolname = 'booking_api') @> array['statement_timeout=5s'], true,
  'booking_api has a statement timeout');

select ok(
  not exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
               where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace
                 and a.grantee in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)),
  'postgres default privileges in public grant nothing to Data API roles');
select ok(
  exists (select 1 from pg_default_acl d
           where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0 and d.defaclobjtype = 'f'
             and not exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 0)),
  'global default: functions created by postgres are not executable by PUBLIC');

-- A function created now (as postgres) must not be executable by anyone by default.
create function public.zz_probe_default_acl() returns int language sql as 'select 1';
create table public.zz_probe_default_acl_t (id int);
select ok(not has_function_privilege('anon', 'public.zz_probe_default_acl()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.zz_probe_default_acl()', 'EXECUTE'),
          'new functions are not executable by anon/authenticated by default');
select ok(not has_table_privilege('anon', 'public.zz_probe_default_acl_t', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          and not has_table_privilege('authenticated', 'public.zz_probe_default_acl_t', 'SELECT,INSERT,UPDATE,DELETE'),
          'new tables grant nothing to anon/authenticated by default');

select is(
  (select count(*)::int from cron.job where jobname = 'detailerhq-expire-stale'), 1,
  'expiry housekeeping job is scheduled');

select is(
  (select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'), 0,
  'no business table is published to Realtime');

select * from finish();
rollback;
