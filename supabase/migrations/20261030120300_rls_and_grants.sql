-- DetailerHQ — Phase 1, migration 4: Row Level Security and explicit grants (D-22, D-24).
-- RLS is enabled (not forced) on every public table: objects are owned by `postgres`,
-- which has BYPASSRLS on Supabase, so FORCE would not change anything (REC-21).

-- ---------------------------------------------------------------------------
-- Helpers used by policies. SECURITY DEFINER so the membership lookup is not itself
-- subject to RLS (avoids recursion); kept in the unexposed `app` schema.
-- ---------------------------------------------------------------------------
create function app.is_member(p_business_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
     where m.business_id = p_business_id
       and m.user_id = (select auth.uid())
  )
$$;

create function app.can_write(p_business_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.businesses b
     where b.id = p_business_id
       and b.account_status in ('pending_activation','pilot','trialing','active','past_due','cancelled')
  )
$$;

-- ---------------------------------------------------------------------------
-- Start from nothing: remove every privilege Supabase granted on existing objects.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;
revoke all on all functions in schema public from public, anon, authenticated, service_role;
revoke all on all functions in schema app from public, anon, authenticated, service_role;
revoke all on all functions in schema public_api from public, anon, authenticated, service_role;

-- Owners reach helper functions (policies and check constraints call them).
grant usage on schema app to authenticated;
grant execute on function
  app.is_member(uuid), app.can_write(uuid),
  app.is_us_timezone(text), app.is_valid_us_phone(text), app.is_valid_email(text),
  app.is_valid_block_range(tstzrange)
to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table in public.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Owner-writable tables: full CRUD for members of the business, writes only while
-- the account can write (§12.4).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'booking_settings','availability_rules','time_off','vehicle_size_classes','service_categories',
    'services','service_prices','customers','vehicles','leads','quotes','quote_items'
  ] loop
    execute format('create policy members_select on public.%I for select to authenticated
                      using (app.is_member(business_id))', t);
    execute format('create policy members_insert on public.%I for insert to authenticated
                      with check (app.is_member(business_id) and app.can_write(business_id))', t);
    execute format('create policy members_update on public.%I for update to authenticated
                      using (app.is_member(business_id))
                      with check (app.is_member(business_id) and app.can_write(business_id))', t);
    execute format('create policy members_delete on public.%I for delete to authenticated
                      using (app.is_member(business_id) and app.can_write(business_id))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;

-- booking_settings rows are created with the business; owners update but never insert/delete them.
revoke insert, delete on public.booking_settings from authenticated;

-- ---------------------------------------------------------------------------
-- Read-only tables for owners (D-24): changes only through authorized functions.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'schedule_resources','schedule_blocks','appointments','appointment_items',
    'booking_requests','booking_request_items','activity_events'
  ] loop
    execute format('create policy members_select on public.%I for select to authenticated
                      using (app.is_member(business_id))', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end
$$;

-- Businesses: members read; profile columns updatable directly; status, slug, timezone,
-- activation and publication change only through functions.
create policy members_select on public.businesses for select to authenticated
  using (app.is_member(id));
create policy members_update on public.businesses for update to authenticated
  using (app.is_member(id))
  with check (app.is_member(id) and app.can_write(id));
grant select on public.businesses to authenticated;
grant update (name, phone_e164, email, service_area_text, shop_address_line1, shop_city,
              shop_state, shop_postal_code, accepting_requests)
  on public.businesses to authenticated;

-- Memberships: a user sees their own membership rows. Created only by app.create_business.
create policy own_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.memberships to authenticated;

-- business_counters and rate_limit_events: RLS on, no policies, no grants (no owner access).
