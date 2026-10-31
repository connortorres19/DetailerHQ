-- DetailerHQ — Phase 4A follow-up, migration 9: atomic service saves and clear pricing errors.
--
-- 1. public.save_service(): saves a service and its whole vehicle-size price grid in ONE call,
--    so it is one transaction — any failure (validation, check constraint, RLS, foreign key)
--    leaves nothing partially saved. SECURITY INVOKER: it runs with the owner's own privileges
--    and RLS, exactly like the direct table writes it replaces; it grants nothing new.
--
-- 2. Finding F-4A-1: service_prices' primary key (service_id, size_class_id) has no business_id,
--    so inserting a price for another business's already-priced (service, size) pair failed with
--    a duplicate-key error (23505) before the foreign key (23503) was checked, revealing that the
--    pair exists. A BEFORE trigger now checks ownership first and raises a clear DH003 for any
--    service or size outside the row's business; duplicate sizes in one save raise a clear DH004.

-- ---------------------------------------------------------------------------
-- Ownership check on service_prices (runs before RLS with-check and before unique/FK checks).
-- ---------------------------------------------------------------------------
create function app.tg_service_price_owner() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (select 1 from public.services s where s.id = new.service_id and s.business_id = new.business_id) then
    raise exception 'unknown service' using errcode = 'DH003', detail = 'service_not_in_business';
  end if;
  if not exists (select 1 from public.vehicle_size_classes v where v.id = new.size_class_id and v.business_id = new.business_id) then
    raise exception 'unknown vehicle size' using errcode = 'DH003', detail = 'size_not_in_business';
  end if;
  return new;
end
$$;

create trigger owner_check before insert or update on public.service_prices
  for each row execute function app.tg_service_price_owner();

-- ---------------------------------------------------------------------------
-- Atomic save of a service and its price grid.
--   p_service_id: null to create, else the service to update (must be visible to the owner)
--   p_service:    {name, description, category_id, price_type, base_price_cents,
--                  base_duration_min, is_addon, is_bookable}
--   p_prices:     [{size_class_id, price_cents, duration_min}, …] — the complete grid; sizes
--                 not listed lose their override.
-- ---------------------------------------------------------------------------
create function public.save_service(p_service_id uuid, p_service jsonb, p_prices jsonb)
returns uuid
language plpgsql security invoker set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid;
  v_id uuid;
  v_sizes uuid[];
  v_keys text[] := array['name','description','category_id','price_type','base_price_cents','base_duration_min','is_addon','is_bookable'];
begin
  select m.business_id into v_business from public.memberships m where m.user_id = (select auth.uid());
  if v_business is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_service) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_service) k where k <> all (v_keys)) then
    raise exception 'invalid service' using errcode = 'DH004', detail = 'invalid_service';
  end if;
  if jsonb_typeof(p_prices) <> 'array' or jsonb_array_length(p_prices) > 20
     or exists (select 1 from jsonb_array_elements(p_prices) e
                 where jsonb_typeof(e) <> 'object'
                    or exists (select 1 from jsonb_object_keys(e) k where k <> all (array['size_class_id','price_cents','duration_min']))) then
    raise exception 'invalid prices' using errcode = 'DH004', detail = 'invalid_prices';
  end if;

  v_sizes := array(select (e ->> 'size_class_id')::uuid from jsonb_array_elements(p_prices) e);
  if cardinality(v_sizes) <> (select count(distinct s) from unnest(v_sizes) s) then
    raise exception 'each vehicle size can be priced once' using errcode = 'DH004', detail = 'duplicate_size';
  end if;

  if p_service_id is null then
    insert into public.services (business_id, name, description, category_id, price_type, base_price_cents,
                                 base_duration_min, is_addon, is_bookable, sort_order)
    values (v_business, p_service ->> 'name', p_service ->> 'description', (p_service ->> 'category_id')::uuid,
            (p_service ->> 'price_type')::public.price_type, (p_service ->> 'base_price_cents')::integer,
            (p_service ->> 'base_duration_min')::integer, coalesce((p_service ->> 'is_addon')::boolean, false),
            coalesce((p_service ->> 'is_bookable')::boolean, false),
            coalesce((select max(s.sort_order) from public.services s where s.business_id = v_business), 0) + 1)
    returning id into v_id;
  else
    update public.services s
       set name = p_service ->> 'name',
           description = p_service ->> 'description',
           category_id = (p_service ->> 'category_id')::uuid,
           price_type = (p_service ->> 'price_type')::public.price_type,
           base_price_cents = (p_service ->> 'base_price_cents')::integer,
           base_duration_min = (p_service ->> 'base_duration_min')::integer,
           is_addon = coalesce((p_service ->> 'is_addon')::boolean, false),
           is_bookable = coalesce((p_service ->> 'is_bookable')::boolean, false)
     where s.id = p_service_id
    returning s.id into v_id;
    if v_id is null then
      raise exception 'service not found' using errcode = 'DH003', detail = 'service_not_found';
    end if;
  end if;

  delete from public.service_prices sp where sp.service_id = v_id and sp.size_class_id <> all (v_sizes);

  insert into public.service_prices (business_id, service_id, size_class_id, price_cents, duration_min)
  select v_business, v_id, (e ->> 'size_class_id')::uuid, (e ->> 'price_cents')::integer, (e ->> 'duration_min')::integer
    from jsonb_array_elements(p_prices) e
  on conflict (service_id, size_class_id)
  do update set price_cents = excluded.price_cents, duration_min = excluded.duration_min;

  return v_id;
end
$$;

-- New functions get EXECUTE for PUBLIC by PostgreSQL's global default: remove it everywhere,
-- then grant the save function to owners only.
revoke all on function app.tg_service_price_owner() from public, anon, authenticated, service_role;
revoke all on function public.save_service(uuid, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_service(uuid, jsonb, jsonb) to authenticated;
