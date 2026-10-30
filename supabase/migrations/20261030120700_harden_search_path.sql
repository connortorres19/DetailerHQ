-- DetailerHQ — Phase 1 review, migration 8: search_path hardening.
--
-- Finding (2026-10-30 review): with `search_path = ''`, PostgreSQL still searches the
-- session's temporary schema FIRST for relations and data types (before pg_catalog).
-- Every role has TEMP on the database through PUBLIC, so a session running as, e.g.,
-- booking_api could create a temp table named `bytea` and change how an unqualified type
-- name is resolved inside a SECURITY DEFINER function (reproduced locally). PostgreSQL's
-- CREATE FUNCTION documentation ("Writing SECURITY DEFINER Functions Safely") recommends
-- listing pg_temp explicitly as the LAST entry. All relations in these functions are
-- already schema-qualified, so pinning `pg_catalog, pg_temp` changes no behaviour except
-- closing the shadowing route. No user-writable schema is on the path (Supabase intent).

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'app', 'public_api')
       and p.proowner = 'postgres'::regrole
       and p.prokind = 'f'
  loop
    execute format('alter function %s set search_path = pg_catalog, pg_temp', f);
  end loop;
end
$$;
