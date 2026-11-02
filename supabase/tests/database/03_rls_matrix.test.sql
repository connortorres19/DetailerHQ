-- Cross-business access matrix (PRODUCT_PLAN §13.2), executed in SQL with the same
-- role + JWT-claims mechanism the Data API uses. For EVERY table in public, Business A's
-- rows are attacked with SELECT / INSERT / UPDATE / DELETE as:
--   owner B (another business), user U (signed in, no business), anon.
-- Owner A's own access is checked too (reads own rows; cannot write read-only tables).
begin;
\ir _helpers.psql

-- Fixture: Business A with at least one row in every table; Business B; user U.
create temp table ctx as
select pg_temp.make_business('a@example.com', 'alpha-detail', 'mobile') as biz_a,
       pg_temp.make_business('b@example.com', 'bravo-detail', 'shop', 3) as biz_b,
       pg_temp.create_user('u@example.com') as user_u;

do $$
declare
  a uuid := (select biz_a from ctx);
  v_req uuid;
  v_quote uuid;
  v_cat uuid;
begin
  insert into public.time_off (business_id, during, label)
  values (a, tstzrange(now() + interval '30 days', now() + interval '31 days'), 'Holiday');
  insert into public.service_categories (business_id, name) values (a, 'Interior') returning id into v_cat;
  update public.services set category_id = v_cat where business_id = a and name = 'Full detail';
  insert into public.service_prices (business_id, service_id, size_class_id, price_cents, duration_min)
  values (a, pg_temp.service_id(a, 'Full detail'), pg_temp.size_class_id(a), 31000, 150);
  insert into public.leads (business_id, source, contact_first_name, contact_phone_e164)
  values (a, 'instagram', 'Elena', '+15125550111');
  insert into public.quotes (business_id, number) values (a, 0) returning id into v_quote;
  insert into public.quote_items (business_id, quote_id, name, price_cents) values (a, v_quote, 'Ceramic coating', 120000);
  -- Phase 6: an image and the branding row (both read-only for owners; writes go through functions).
  insert into public.media_assets (business_id, kind, status, width, height, bytes, ready_at) values (a, 'logo', 'ready', 64, 64, 100, now());
  insert into public.business_branding (business_id, primary_color) values (a, '#1f4e79');
  -- Phase 7: email (all read-only for owners; writes go through functions or the worker).
  insert into public.email_connections (business_id, provider, from_address, secret) values (a, 'google', 'shop@example.com', extensions.gen_random_bytes(64));
  insert into public.email_settings (business_id) values (a);
  insert into public.email_template_settings (business_id, template, enabled) values (a, 'request_received', true);
  insert into public.email_owner_prefs (business_id, user_id) values (a, pg_temp.owner_of(a));
  insert into public.email_outbox (business_id, template, recipient, idempotency_key) values (a, 'connection_test', 'shop@example.com', 'matrix-' || a);
  insert into public.email_suppressions (business_id, email, category) values (a, 'x@example.com', 'follow_up');
  -- Phase 8 billing: a reservation, the billing row and an event for Business A.
  update public.founding_slots set state = 'reserved', business_id = a, reserved_until = now() + interval '10 minutes' where slot = 1;
  insert into public.business_billing (business_id, stripe_customer_id) values (a, 'cus_matrix');
  insert into public.billing_events (id, type, business_id) values ('evt_matrix', 'invoice.paid', a);
end
$$;

-- Requests, appointment, hold, activity, rate-limit row.
do $$
declare
  a uuid := (select biz_a from ctx);
  v_req uuid := pg_temp.make_request(a, pg_temp.at_local(3, '10:00'));
  v_req2 uuid := pg_temp.make_request(a, pg_temp.at_local(4, '10:00'), 120, '+15125550120');
begin
  insert into public.booking_request_items (business_id, booking_request_id, service_id, name, price_type, price_cents, duration_min, is_addon)
  values (a, v_req, pg_temp.service_id(a, 'Full detail'), 'Full detail', 'fixed', 26000, 120, false);
  perform pg_temp.as_user(pg_temp.owner_of(a));
  perform public.approve_request(v_req);
  perform public.place_hold(v_req2, 24);
  execute 'reset role';
  insert into public.rate_limit_events (action, key_hash, business_id) values ('submit_request', sha256('ip'::bytea), a);
end
$$;

-- Every public table must have a row for Business A (otherwise the matrix proves nothing).
create temp table tbl as
select c.relname::text as t,
       case when c.relname = 'businesses' then 'id' else 'business_id' end as key_col,
       c.relname in ('booking_settings','availability_rules','time_off','vehicle_size_classes','service_categories',
                     'services','service_prices','customers','vehicles','leads') as owner_writable
       -- quotes and quote_items: read-only for owners since migration 14 (writes go through functions)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   -- user_preferences is per user, not per business: 16_branding_media checks its own-row policies.
   and c.relname <> 'user_preferences';

create temp table a_rows (t text, n bigint);
do $$
declare r record; n bigint;
begin
  for r in select * from tbl loop
    execute format('select count(*) from public.%I where %I = %L', r.t, r.key_col, (select biz_a from ctx)) into n;
    insert into a_rows values (r.t, n);
  end loop;
end
$$;

-- Run every attack and record the outcome: row count on success, SQLSTATE on error.
create temp table results (t text, actor text, op text, outcome text);
grant all on results, tbl, ctx to authenticated, anon;

create function pg_temp.attempt(p_sql text, p_kind text) returns text
language plpgsql as $$
declare n bigint;
begin
  if p_kind = 'count' then
    execute p_sql into n;
  else
    execute p_sql;
    get diagnostics n = row_count;
  end if;
  return n::text;
exception when others then
  return sqlstate;
end
$$;
grant execute on function pg_temp.attempt(text, text) to authenticated, anon;

create function pg_temp.sample_row_json(p_table text, p_key text, p_business uuid) returns text
language plpgsql as $$
declare j jsonb;
begin
  execute format('select to_jsonb(x) from public.%I x where %I = %L limit 1', p_table, p_key, p_business) into j;
  if j ? 'id' and jsonb_typeof(j -> 'id') = 'string' then
    j := jsonb_set(j, '{id}', to_jsonb(gen_random_uuid()));
  end if;
  return j::text;
end
$$;

do $$
declare
  r record;
  actor text;
  a uuid := (select biz_a from ctx);
  v_json text;
  v_upd_col text;
begin
  for r in select * from tbl loop
    execute 'reset role';
    v_json := pg_temp.sample_row_json(r.t, r.key_col, a);
    v_upd_col := case when r.t = 'businesses' then 'name' else 'business_id' end;
    foreach actor in array array['owner_b', 'user_u', 'anon', 'owner_a'] loop
      execute 'reset role';
      if actor = 'owner_b' then perform pg_temp.as_user(pg_temp.owner_of((select biz_b from ctx)));
      elsif actor = 'user_u' then perform pg_temp.as_user((select user_u from ctx));
      elsif actor = 'owner_a' then perform pg_temp.as_user(pg_temp.owner_of(a));
      else perform pg_temp.as_anon();
      end if;

      insert into results values (r.t, actor, 'select',
        pg_temp.attempt(format('select count(*) from public.%I where %I = %L', r.t, r.key_col, a), 'count'));
      insert into results values (r.t, actor, 'update',
        pg_temp.attempt(format('update public.%I set %I = %I where %I = %L', r.t, v_upd_col, v_upd_col, r.key_col, a), 'dml'));
      insert into results values (r.t, actor, 'delete',
        pg_temp.attempt(format('delete from public.%I where %I = %L and false', r.t, r.key_col, a), 'dml'));
      insert into results values (r.t, actor, 'insert',
        pg_temp.attempt(case when r.t = 'rate_limit_events'
                             -- identity column: copy every column except id
                             then format('insert into public.rate_limit_events (action, key_hash, business_id) values (''x'', ''\x00'', %L)', a)
                             -- generated storage_path: name the writable columns
                             when r.t = 'media_assets'
                             then format('insert into public.media_assets (business_id, kind, status, width, height, bytes, ready_at) values (%L, ''logo'', ''ready'', 64, 64, 1, now())', a)
                             else format('insert into public.%I select * from jsonb_populate_record(null::public.%I, %L::jsonb)',
                                         r.t, r.t, v_json) end, 'dml'));
    end loop;
  end loop;
  execute 'reset role';
end
$$;

-- Expected outcomes.
create temp table expected as
select t.t, actor, op,
  case
    -- Tables no client role may touch at all.
    when t.t in ('business_counters', 'rate_limit_events', 'founding_slots', 'billing_events') then '42501'
    when actor = 'anon' then '42501'
    when actor in ('owner_b', 'user_u') then
      case op
        when 'select' then '0'
        when 'insert' then '42501'
        when 'update' then case when t.owner_writable or t.t = 'businesses' then '0' else '42501' end
        when 'delete' then case when t.owner_writable and t.t <> 'booking_settings' then '0' else '42501' end
      end
    else -- owner A on its own rows
      case op
        -- activity_events can grow during the matrix itself (owner A's allowed lead insert is logged).
        when 'select' then case when t.t = 'memberships' then '1'
                                when t.t = 'activity_events' then 'at-least-' || (select n::text from a_rows where a_rows.t = t.t)
                                else (select n::text from a_rows where a_rows.t = t.t) end
        when 'insert' then case when t.owner_writable and t.t <> 'booking_settings' then 'not-42501' else '42501' end
        when 'update' then case when t.owner_writable or t.t = 'businesses' then 'ok' else '42501' end
        when 'delete' then case when t.owner_writable and t.t <> 'booking_settings' then '0' else '42501' end
      end
  end as outcome
from tbl t
cross join unnest(array['owner_b', 'user_u', 'anon', 'owner_a']) actor
cross join unnest(array['select', 'insert', 'update', 'delete']) op;

select plan((select count(*)::int from tbl) + (select count(*)::int from expected));

select cmp_ok(n, '>', 0::bigint, format('fixture has Business A rows in %s', t)) from a_rows order by t;

select is(
  case
    when e.outcome = 'ok' and r.outcome ~ '^[0-9]+$' then 'ok'
    when e.outcome = 'not-42501' and r.outcome <> '42501' then 'not-42501'
    when e.outcome like 'at-least-%' and r.outcome ~ '^[0-9]+$' and r.outcome::bigint >= substr(e.outcome, 10)::bigint then e.outcome
    else r.outcome
  end,
  e.outcome,
  format('%s %s on %s', e.actor, e.op, e.t))
from expected e join results r using (t, actor, op)
order by e.t, e.actor, e.op;

select * from finish();
rollback;
