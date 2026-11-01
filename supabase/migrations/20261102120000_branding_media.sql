-- Phase 6: branding, images and dashboard appearance.
--
-- 1. media_assets: one row per image in the private `business-media` Storage bucket. The server
--    re-encodes every upload to WebP; the database reserves the object name first (pending), checks
--    the stored object before marking it ready, and marks unused images for deletion — so a file
--    exists only for a row, and a row is removed only after its file is gone (no orphans).
-- 2. Storage RLS: an object can be added only into a reserved slot of the caller's business, read
--    by members of that business or — only while it is part of the *published* branding of a public
--    booking page — by anyone, and deleted only once the database has marked it for deletion.
--    The app never holds a Storage/service key: owners act with their own session, and the public
--    booking page reads with the publishable key, so RLS decides every access.
-- 3. business_branding: published look (colours, logo, cover, gallery, service photos, links) plus
--    an unpublished draft. Publishing copies the draft to the live columns and the customer-facing
--    wording into booking_settings (still the single source for the booking page text).
-- 4. user_preferences: each signed-in user's dashboard theme (light / dark / system).
--
-- Owners read these tables under RLS; every write goes through the functions below.

-- ---------------------------------------------------------------------------
-- Precondition: Supabase Storage must be running against this database. Its own service creates
-- the storage schema the first time it starts (hosted projects always have it; locally it needs
-- [storage] enabled = true in supabase/config.toml AND a restart of the stack — `supabase start`
-- on a stack that is already running keeps the old configuration). Stop here, before changing
-- anything, with instructions, rather than half-applying the image rules.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage is not initialised in this database (storage.buckets / storage.objects are missing).'
      using hint = 'Local: make sure supabase/config.toml has [storage] enabled = true, then run `npx supabase stop` and `npx supabase start` '
                   '(this keeps your data), check `npx supabase status` lists Storage, and run `npx supabase migration up --local` again. '
                   'Run `npm run storage:check` to diagnose.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Bucket (also declared in supabase/config.toml for the local stack)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-media', 'business-media', false, 4194304, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create type public.media_kind as enum ('logo', 'cover', 'gallery', 'service');
create type public.media_status as enum ('pending', 'ready', 'deleting');

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind public.media_kind not null,
  status public.media_status not null default 'pending',
  storage_path text not null generated always as (id::text || '.webp') stored,
  width integer check (width between 16 and 4000),
  height integer check (height between 16 and 4000),
  bytes integer check (bytes between 1 and 4194304),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  unique (business_id, id),
  unique (storage_path),
  check (status <> 'ready' or (width is not null and height is not null and bytes is not null and ready_at is not null))
);
create index media_assets_business_idx on public.media_assets (business_id, status);

create table public.business_branding (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  primary_color text check (primary_color ~ '^#[0-9a-f]{6}$'),
  secondary_color text check (secondary_color ~ '^#[0-9a-f]{6}$'),
  accent_color text check (accent_color ~ '^#[0-9a-f]{6}$'),
  logo_asset_id uuid,
  cover_asset_id uuid,
  gallery_asset_ids uuid[] not null default '{}' check (cardinality(gallery_asset_ids) <= 12),
  service_photos jsonb not null default '{}' check (jsonb_typeof(service_photos) = 'object'),
  website_url text check (char_length(website_url) <= 200),
  social_links jsonb not null default '{}' check (jsonb_typeof(social_links) = 'object'),
  show_email boolean not null default false,
  draft jsonb check (draft is null or jsonb_typeof(draft) = 'object'),
  draft_updated_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (business_id, logo_asset_id) references public.media_assets (business_id, id),
  foreign key (business_id, cover_asset_id) references public.media_assets (business_id, id)
);
create trigger touch_updated_at before update on public.business_branding
  for each row execute function app.tg_touch_updated_at();
create trigger immutable_business_id before update on public.business_branding
  for each row execute function app.tg_immutable_business_id();
create trigger immutable_business_id before update on public.media_assets
  for each row execute function app.tg_immutable_business_id();

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  updated_at timestamptz not null default now()
);
create trigger touch_updated_at before update on public.user_preferences
  for each row execute function app.tg_touch_updated_at();

alter table public.media_assets enable row level security;
alter table public.business_branding enable row level security;
alter table public.user_preferences enable row level security;

create policy members_select on public.media_assets for select to authenticated using (app.is_member(business_id));
create policy members_select on public.business_branding for select to authenticated using (app.is_member(business_id));
create policy own_select on public.user_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy own_insert on public.user_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_update on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.media_assets, public.business_branding, public.user_preferences from public, anon, authenticated, service_role;
grant select on public.media_assets, public.business_branding to authenticated;
grant select, insert on public.user_preferences to authenticated;
-- user_id is included so an upsert (insert … on conflict do update) works; the policies' check
-- (user_id = auth.uid()) keeps every row the caller's own.
grant update (user_id, theme) on public.user_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- Branding values: validation, current state, references
-- ---------------------------------------------------------------------------
-- Allowed social profiles and the hosts each may point to.
create function app.social_host_ok(p_network text, p_url text) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp
as $$
  select p_url ~* ('^https://([a-z0-9-]+\.)*(' || case p_network
           when 'instagram' then 'instagram\.com'
           when 'facebook' then 'facebook\.com|fb\.com'
           when 'tiktok' then 'tiktok\.com'
           when 'youtube' then 'youtube\.com|youtu\.be'
           when 'google' then 'google\.com|g\.page|goo\.gl'
           when 'yelp' then 'yelp\.com'
         end || ')(/[^\s<>"''`]*)?$')
     and char_length(p_url) <= 200
$$;

-- The published state in the draft's shape (what the editor starts from).
create function app.branding_current(p_business uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'primary_color', bb.primary_color, 'secondary_color', bb.secondary_color, 'accent_color', bb.accent_color,
    'logo_asset_id', bb.logo_asset_id, 'cover_asset_id', bb.cover_asset_id,
    'gallery_asset_ids', to_jsonb(coalesce(bb.gallery_asset_ids, '{}')),
    'service_photos', coalesce(bb.service_photos, '{}'), 'website_url', bb.website_url,
    'social_links', coalesce(bb.social_links, '{}'), 'show_email', coalesce(bb.show_email, false),
    'intro_text', bs.intro_text, 'cancellation_policy_text', bs.cancellation_policy_text,
    'reschedule_policy_text', bs.reschedule_policy_text, 'prep_instructions', bs.prep_instructions)
    from public.booking_settings bs
    left join public.business_branding bb on bb.business_id = bs.business_id
   where bs.business_id = p_business
$$;

-- Validates and normalises a draft. Raises DH004 with the offending field in detail.
create function app.branding_clean(p_business uuid, p_draft jsonb) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare
  k text;
  v jsonb;
  out jsonb := '{}'::jsonb;
  v_text text;
  v_ids uuid[];
  v_id uuid;
  e record;
  bad text;
begin
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    raise exception 'invalid branding' using errcode = 'DH004';
  end if;
  select string_agg(key, ',') into bad from jsonb_object_keys(p_draft) key
   where key <> all (array['primary_color','secondary_color','accent_color','logo_asset_id','cover_asset_id','gallery_asset_ids',
                           'service_photos','website_url','social_links','show_email','intro_text','cancellation_policy_text',
                           'reschedule_policy_text','prep_instructions']);
  if bad is not null then
    raise exception 'invalid branding' using errcode = 'DH004', detail = bad;
  end if;

  -- Colours: #rrggbb (any colour is allowed; readable text is worked out when the page renders).
  foreach k in array array['primary_color','secondary_color','accent_color'] loop
    v := nullif(p_draft -> k, 'null'::jsonb);
    if v is not null and (jsonb_typeof(v) <> 'string' or lower(v #>> '{}') !~ '^#[0-9a-f]{6}$') then
      raise exception 'enter colours like #1f4e79' using errcode = 'DH004', detail = k;
    end if;
    out := out || jsonb_build_object(k, lower(v #>> '{}'));
  end loop;

  -- Single images.
  foreach k in array array['logo_asset_id','cover_asset_id'] loop
    v := nullif(p_draft -> k, 'null'::jsonb);
    v_id := null;
    if v is not null then
      begin
        v_id := (v #>> '{}')::uuid;
      exception when others then
        raise exception 'unknown image' using errcode = 'DH004', detail = k;
      end;
      if not exists (select 1 from public.media_assets m where m.id = v_id and m.business_id = p_business and m.status = 'ready'
                        and m.kind = case k when 'logo_asset_id' then 'logo' else 'cover' end::public.media_kind) then
        raise exception 'unknown image' using errcode = 'DH004', detail = k;
      end if;
    end if;
    out := out || jsonb_build_object(k, v_id);
  end loop;

  -- Gallery: up to 12 distinct gallery images, in order.
  v := coalesce(nullif(p_draft -> 'gallery_asset_ids', 'null'::jsonb), '[]'::jsonb);
  if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 12 then
    raise exception 'up to 12 gallery photos' using errcode = 'DH004', detail = 'gallery_asset_ids';
  end if;
  begin
    select coalesce(array_agg(x::uuid order by n), '{}') into v_ids from jsonb_array_elements_text(v) with ordinality t(x, n);
  exception when others then
    raise exception 'unknown image' using errcode = 'DH004', detail = 'gallery_asset_ids';
  end;
  if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x)
     or exists (select 1 from unnest(v_ids) x where not exists (
                  select 1 from public.media_assets m where m.id = x and m.business_id = p_business and m.status = 'ready' and m.kind = 'gallery')) then
    raise exception 'unknown image' using errcode = 'DH004', detail = 'gallery_asset_ids';
  end if;
  out := out || jsonb_build_object('gallery_asset_ids', to_jsonb(v_ids));

  -- Service photos: {service_id: image} for this business's active services.
  v := coalesce(nullif(p_draft -> 'service_photos', 'null'::jsonb), '{}'::jsonb);
  if jsonb_typeof(v) <> 'object' then
    raise exception 'invalid service photos' using errcode = 'DH004', detail = 'service_photos';
  end if;
  for e in select key, value from jsonb_each(v) loop
    begin
      if not exists (select 1 from public.services s where s.id = e.key::uuid and s.business_id = p_business and s.archived_at is null)
         or jsonb_typeof(e.value) <> 'string'
         or not exists (select 1 from public.media_assets m where m.id = (e.value #>> '{}')::uuid and m.business_id = p_business
                           and m.status = 'ready' and m.kind = 'service') then
        raise exception 'unknown service or image' using errcode = 'DH004', detail = 'service_photos';
      end if;
    exception when invalid_text_representation then
      raise exception 'unknown service or image' using errcode = 'DH004', detail = 'service_photos';
    end;
  end loop;
  out := out || jsonb_build_object('service_photos', v);

  -- Links.
  v := nullif(p_draft -> 'website_url', 'null'::jsonb);
  v_text := nullif(trim(v #>> '{}'), '');
  if v is not null and jsonb_typeof(v) <> 'string' then
    raise exception 'invalid website' using errcode = 'DH004', detail = 'website_url';
  end if;
  if v_text is not null and (char_length(v_text) > 200 or v_text !~* '^https://[a-z0-9-]+(\.[a-z0-9-]+)+(:[0-9]{2,5})?(/[^\s<>"''`]*)?$') then
    raise exception 'enter a website starting with https://' using errcode = 'DH004', detail = 'website_url';
  end if;
  out := out || jsonb_build_object('website_url', v_text);

  v := coalesce(nullif(p_draft -> 'social_links', 'null'::jsonb), '{}'::jsonb);
  if jsonb_typeof(v) <> 'object' then
    raise exception 'invalid social links' using errcode = 'DH004', detail = 'social_links';
  end if;
  for e in select key, value from jsonb_each(v) loop
    if e.key <> all (array['instagram','facebook','tiktok','youtube','google','yelp']) then
      raise exception 'invalid social links' using errcode = 'DH004', detail = 'social_links';
    end if;
    if jsonb_typeof(e.value) = 'null' or nullif(trim(e.value #>> '{}'), '') is null then
      v := v - e.key;
    elsif jsonb_typeof(e.value) <> 'string' or not app.social_host_ok(e.key, trim(e.value #>> '{}')) then
      raise exception 'that isn''t a % link', e.key using errcode = 'DH004', detail = 'social_' || e.key;
    else
      v := jsonb_set(v, array[e.key], to_jsonb(trim(e.value #>> '{}')));
    end if;
  end loop;
  out := out || jsonb_build_object('social_links', v);

  v := coalesce(nullif(p_draft -> 'show_email', 'null'::jsonb), 'false'::jsonb);
  if jsonb_typeof(v) <> 'boolean' then
    raise exception 'invalid branding' using errcode = 'DH004', detail = 'show_email';
  end if;
  out := out || jsonb_build_object('show_email', v);

  -- Customer-facing wording (same limits as booking_settings).
  foreach k in array array['intro_text','cancellation_policy_text','reschedule_policy_text','prep_instructions'] loop
    v := nullif(p_draft -> k, 'null'::jsonb);
    if v is not null and jsonb_typeof(v) <> 'string' then
      raise exception 'invalid text' using errcode = 'DH004', detail = k;
    end if;
    v_text := nullif(trim(v #>> '{}'), '');
    if char_length(v_text) > (case k when 'intro_text' then 300 else 1000 end) then
      raise exception 'too long' using errcode = 'DH004', detail = k;
    end if;
    out := out || jsonb_build_object(k, v_text);
  end loop;
  return out;
end
$$;

-- Every image a business's published branding or draft refers to.
create function app.branding_asset_ids(p_business uuid) returns setof uuid
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select x from public.business_branding bb,
    lateral (select bb.logo_asset_id union all select bb.cover_asset_id
             union all select unnest(bb.gallery_asset_ids)
             union all select (value #>> '{}')::uuid from jsonb_each(bb.service_photos)
             union all select (bb.draft ->> 'logo_asset_id')::uuid union all select (bb.draft ->> 'cover_asset_id')::uuid
             union all select x::uuid from jsonb_array_elements_text(coalesce(bb.draft -> 'gallery_asset_ids', '[]')) x
             union all select (value #>> '{}')::uuid from jsonb_each(coalesce(bb.draft -> 'service_photos', '{}'))) refs(x)
   where bb.business_id = p_business and x is not null
$$;

-- Is this image shown on a public booking page right now?
create function app.media_is_public(p_business uuid, p_asset uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from public.businesses b join public.business_branding bb on bb.business_id = b.id
     where b.id = p_business and b.published_at is not null
       and b.account_status not in ('suspended', 'closing', 'pending_activation')
       and (bb.logo_asset_id = p_asset or bb.cover_asset_id = p_asset or p_asset = any (bb.gallery_asset_ids)
            or exists (select 1 from jsonb_each_text(bb.service_photos) sp
                        where sp.value = p_asset::text
                          and exists (select 1 from public.services s where s.id::text = sp.key and s.business_id = p_business
                                         and s.archived_at is null))))
$$;

-- Public payload: published (or, for the owner preview, draft) look with image sizes.
create function app.branding_payload(p_business uuid, p_draft boolean) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare
  d jsonb := app.branding_current(p_business);
  v_draft jsonb;
  v_email text;
begin
  if p_draft then
    select draft into v_draft from public.business_branding where business_id = p_business;
    d := d || coalesce(v_draft, '{}'::jsonb);
  end if;
  select email into v_email from public.businesses where id = p_business;
  return jsonb_build_object(
    'colors', jsonb_build_object('primary', d ->> 'primary_color', 'secondary', d ->> 'secondary_color', 'accent', d ->> 'accent_color'),
    'logo', (select jsonb_build_object('id', m.id, 'width', m.width, 'height', m.height) from public.media_assets m
              where m.id = (d ->> 'logo_asset_id')::uuid and m.business_id = p_business and m.status = 'ready'),
    'cover', (select jsonb_build_object('id', m.id, 'width', m.width, 'height', m.height) from public.media_assets m
               where m.id = (d ->> 'cover_asset_id')::uuid and m.business_id = p_business and m.status = 'ready'),
    'gallery', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'width', m.width, 'height', m.height) order by g.n)
                           from jsonb_array_elements_text(coalesce(d -> 'gallery_asset_ids', '[]')) with ordinality g(x, n)
                           join public.media_assets m on m.id = g.x::uuid and m.business_id = p_business and m.status = 'ready'), '[]'::jsonb),
    'service_photos', coalesce((select jsonb_object_agg(sp.key, jsonb_build_object('id', m.id, 'width', m.width, 'height', m.height))
                                  from jsonb_each_text(coalesce(d -> 'service_photos', '{}')) sp
                                  join public.media_assets m on m.id = sp.value::uuid and m.business_id = p_business and m.status = 'ready'),
                               '{}'::jsonb),
    'website_url', d ->> 'website_url',
    'social', coalesce(d -> 'social_links', '{}'::jsonb),
    'email', case when (d ->> 'show_email')::boolean then v_email end);
end
$$;

-- ---------------------------------------------------------------------------
-- Owner functions: draft, publish, discard
-- ---------------------------------------------------------------------------
create function app.save_branding_draft_impl(p_draft jsonb) returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  v_clean jsonb;
begin
  perform app.require_member(v_business, true);
  insert into public.business_branding (business_id) values (v_business) on conflict (business_id) do nothing;
  perform 1 from public.business_branding where business_id = v_business for update;
  v_clean := app.branding_clean(v_business, p_draft);
  update public.business_branding set draft = v_clean, draft_updated_at = now() where business_id = v_business;
end
$$;

create function app.discard_branding_draft_impl() returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_business uuid := app.caller_business_id();
begin
  perform app.require_member(v_business, true);
  update public.business_branding set draft = null, draft_updated_at = null where business_id = v_business;
end
$$;

create function app.publish_branding_impl() returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  bb public.business_branding;
  d jsonb;
begin
  perform app.require_member(v_business, true);
  select * into bb from public.business_branding where business_id = v_business for update;
  if bb.draft is null then
    raise exception 'there are no changes to publish' using errcode = 'DH002';
  end if;
  -- Validate again: images may have been removed or services archived since the draft was saved.
  d := app.branding_clean(v_business, bb.draft);
  update public.business_branding
     set primary_color = d ->> 'primary_color', secondary_color = d ->> 'secondary_color', accent_color = d ->> 'accent_color',
         logo_asset_id = (d ->> 'logo_asset_id')::uuid, cover_asset_id = (d ->> 'cover_asset_id')::uuid,
         gallery_asset_ids = array(select x::uuid from jsonb_array_elements_text(d -> 'gallery_asset_ids') with ordinality t(x, n) order by n),
         service_photos = d -> 'service_photos', website_url = d ->> 'website_url', social_links = d -> 'social_links',
         show_email = (d ->> 'show_email')::boolean, draft = null, draft_updated_at = null, published_at = now()
   where business_id = v_business;
  update public.booking_settings
     set intro_text = d ->> 'intro_text', cancellation_policy_text = d ->> 'cancellation_policy_text',
         reschedule_policy_text = d ->> 'reschedule_policy_text', prep_instructions = d ->> 'prep_instructions'
   where business_id = v_business;
end
$$;

-- ---------------------------------------------------------------------------
-- Owner functions: images
-- ---------------------------------------------------------------------------
-- Reserve a slot (the object name) for an upload. Limits keep one business from filling storage.
create function app.begin_media_upload_impl(p_kind public.media_kind) returns uuid
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  v_id uuid;
  v_draft jsonb;
begin
  perform app.require_member(v_business, true);
  if p_kind is null then
    raise exception 'invalid image type' using errcode = 'DH004';
  end if;
  perform 1 from public.businesses where id = v_business for update;  -- serialise the limit checks
  if (select count(*) from public.media_assets where business_id = v_business and status = 'pending' and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too many uploads at once — wait a moment and try again' using errcode = 'DH005';
  end if;
  if (select count(*) from public.media_assets where business_id = v_business and status <> 'deleting') >= 80 then
    raise exception 'image limit reached — remove some images first' using errcode = 'DH004', detail = 'limit';
  end if;
  if p_kind = 'gallery' then
    select coalesce(bb.draft, app.branding_current(v_business)) into v_draft
      from public.booking_settings bs left join public.business_branding bb on bb.business_id = bs.business_id
     where bs.business_id = v_business;
    if jsonb_array_length(coalesce(v_draft -> 'gallery_asset_ids', '[]')) >= 12 then
      raise exception 'the gallery holds up to 12 photos' using errcode = 'DH004', detail = 'gallery_asset_ids';
    end if;
  end if;
  insert into public.media_assets (business_id, kind) values (v_business, p_kind) returning id into v_id;
  return v_id;
end
$$;

-- The upload landed: check the stored object, mark the image ready and put it in the draft
-- (logo/cover replace, gallery appends, service photo sets that service's photo).
create function app.finish_media_upload_impl(p_asset uuid, p_width integer, p_height integer, p_service_id uuid default null)
returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  m public.media_assets;
  o record;
  d jsonb;
begin
  perform app.require_member(v_business, true);
  select * into m from public.media_assets where id = p_asset and business_id = v_business for update;
  if m.id is null or m.status <> 'pending' then
    raise exception 'upload not found' using errcode = 'DH003';
  end if;
  select (metadata ->> 'size')::bigint as size, metadata ->> 'mimetype' as mimetype into o
    from storage.objects where bucket_id = 'business-media' and name = m.storage_path;
  if o.size is null then
    raise exception 'the image was not stored' using errcode = 'DH004';
  end if;
  if o.mimetype <> 'image/webp' or o.size > 4194304 or p_width not between 16 and 4000 or p_height not between 16 and 4000 then
    raise exception 'invalid image' using errcode = 'DH004';
  end if;
  if m.kind = 'service' and not exists (select 1 from public.services s where s.id = p_service_id and s.business_id = v_business
                                            and s.archived_at is null) then
    raise exception 'service not found' using errcode = 'DH003';
  end if;
  update public.media_assets set status = 'ready', width = p_width, height = p_height, bytes = o.size, ready_at = now()
   where id = m.id;

  insert into public.business_branding (business_id) values (v_business) on conflict (business_id) do nothing;
  select coalesce(draft, app.branding_current(v_business)) into d from public.business_branding where business_id = v_business for update;
  d := case m.kind
    when 'logo' then d || jsonb_build_object('logo_asset_id', m.id)
    when 'cover' then d || jsonb_build_object('cover_asset_id', m.id)
    when 'gallery' then jsonb_set(d, '{gallery_asset_ids}', coalesce(d -> 'gallery_asset_ids', '[]') || to_jsonb(m.id))
    else jsonb_set(d, '{service_photos}', coalesce(d -> 'service_photos', '{}') || jsonb_build_object(p_service_id::text, m.id))
  end;
  update public.business_branding set draft = app.branding_clean(v_business, d), draft_updated_at = now() where business_id = v_business;
end
$$;

-- Images no longer used by the published look or the draft (and uploads abandoned for an hour)
-- are marked for deletion; returns the object names the caller should delete from Storage.
create function app.media_garbage_impl() returns text[]
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_business uuid := app.caller_business_id();
begin
  perform app.require_member(v_business, true);
  update public.media_assets m set status = 'deleting'
   where m.business_id = v_business
     and ((m.status = 'ready' and m.id not in (select app.branding_asset_ids(v_business)))
          or (m.status = 'pending' and m.created_at < now() - interval '1 hour'));
  return coalesce((select array_agg(storage_path order by created_at) from public.media_assets
                    where business_id = v_business and status = 'deleting'), '{}');
end
$$;

-- Give up an unfinished upload (the server calls this when processing or checking fails): the
-- slot is marked for deletion and its object name returned so the caller deletes any stored file.
create function app.cancel_media_upload_impl(p_asset uuid) returns text
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  v_path text;
begin
  perform app.require_member(v_business, true);
  update public.media_assets set status = 'deleting'
   where id = p_asset and business_id = v_business and status = 'pending'
  returning storage_path into v_path;
  if v_path is null then
    raise exception 'upload not found' using errcode = 'DH003';
  end if;
  return v_path;
end
$$;

-- Forget images whose files are gone (never while the file still exists).
create function app.purge_media_impl() returns integer
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  v_count integer;
begin
  perform app.require_member(v_business, true);
  delete from public.media_assets m
   where m.business_id = v_business and m.status = 'deleting'
     and not exists (select 1 from storage.objects o where o.bucket_id = 'business-media' and o.name = m.storage_path);
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- Owner preview of the saved draft on the real booking page layout.
create function app.preview_branding_draft_impl() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_business uuid := app.caller_business_id();
  b public.businesses;
  d jsonb;
begin
  perform app.require_member(v_business, false);
  select * into b from public.businesses where id = v_business;
  select coalesce(draft, '{}'::jsonb) into d from public.business_branding where business_id = v_business;
  d := app.branding_current(v_business) || coalesce(d, '{}'::jsonb);
  return app.booking_page_json(b)
    || jsonb_build_object(
         'published', b.published_at is not null,
         'intro', d ->> 'intro_text',
         'branding', app.branding_payload(v_business, true),
         'policies', (app.booking_page_json(b) -> 'policies')
                     || jsonb_build_object('cancellation', d ->> 'cancellation_policy_text', 'rescheduling', d ->> 'reschedule_policy_text',
                                           'prep_instructions', d ->> 'prep_instructions'));
end
$$;

-- ---------------------------------------------------------------------------
-- Public booking page: + published branding (Phase 4C body otherwise unchanged)
-- ---------------------------------------------------------------------------
create or replace function app.booking_page_json(b public.businesses) returns jsonb
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
                             and (s.is_bookable or s.price_type = 'quote_required')), '[]'::jsonb),
    'branding', app.branding_payload(b.id, false))
    from public.booking_settings bs
   where bs.business_id = b.id
$$;

-- ---------------------------------------------------------------------------
-- Storage rules (storage.objects RLS for the business-media bucket)
-- ---------------------------------------------------------------------------
create schema storage_rules;
revoke all on schema storage_rules from public;
grant usage on schema storage_rules to anon, authenticated;

create function storage_rules.can_read(p_name text) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from public.media_assets m
     where m.storage_path = p_name
       -- Members see their own files in any state (deleting needs it: DELETE … RETURNING applies
       -- this policy too); everyone else only ready images on a public page's published look.
       and (((select auth.uid()) is not null and app.is_member(m.business_id))
            or (m.status = 'ready' and app.media_is_public(m.business_id, m.id))))
$$;

create function storage_rules.can_insert(p_name text) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.media_assets m
     where m.storage_path = p_name and m.status = 'pending' and m.created_at > now() - interval '1 hour'
       and app.is_member(m.business_id) and app.can_write(m.business_id))
$$;

create function storage_rules.can_delete(p_name text) returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.media_assets m
     where m.storage_path = p_name and m.status = 'deleting' and app.is_member(m.business_id))
$$;

create policy business_media_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'business-media' and storage_rules.can_read(name));
create policy business_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'business-media' and storage_rules.can_insert(name));
create policy business_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'business-media' and storage_rules.can_delete(name));
-- No update policy: objects are never overwritten (a replacement is a new image).

-- ---------------------------------------------------------------------------
-- Invoker wrappers and privileges
-- ---------------------------------------------------------------------------
create function public.save_branding_draft(p_draft jsonb) returns void
language sql security invoker set search_path = pg_catalog, pg_temp as $$ select app.save_branding_draft_impl(p_draft) $$;
create function public.discard_branding_draft() returns void
language sql security invoker set search_path = pg_catalog, pg_temp as $$ select app.discard_branding_draft_impl() $$;
create function public.publish_branding() returns void
language sql security invoker set search_path = pg_catalog, pg_temp as $$ select app.publish_branding_impl() $$;
create function public.begin_media_upload(p_kind public.media_kind) returns uuid
language sql security invoker set search_path = pg_catalog, pg_temp as $$ select app.begin_media_upload_impl(p_kind) $$;
create function public.finish_media_upload(p_asset uuid, p_width integer, p_height integer, p_service_id uuid default null) returns void
language sql security invoker set search_path = pg_catalog, pg_temp
as $$ select app.finish_media_upload_impl(p_asset, p_width, p_height, p_service_id) $$;
create function public.media_garbage() returns text[]
language sql security invoker set search_path = pg_catalog, pg_temp as $$ select app.media_garbage_impl() $$;
create function public.cancel_media_upload(p_asset uuid) returns text
language sql security invoker set search_path = pg_catalog, pg_temp as $$ select app.cancel_media_upload_impl(p_asset) $$;
create function public.purge_media() returns integer
language sql security invoker set search_path = pg_catalog, pg_temp as $$ select app.purge_media_impl() $$;
create function public.preview_branding_draft() returns jsonb
language sql stable security invoker set search_path = pg_catalog, pg_temp as $$ select app.preview_branding_draft_impl() $$;

revoke all on function
  app.social_host_ok(text, text), app.branding_current(uuid), app.branding_clean(uuid, jsonb), app.branding_asset_ids(uuid),
  app.media_is_public(uuid, uuid), app.branding_payload(uuid, boolean),
  app.save_branding_draft_impl(jsonb), app.discard_branding_draft_impl(), app.publish_branding_impl(),
  app.begin_media_upload_impl(public.media_kind), app.finish_media_upload_impl(uuid, integer, integer, uuid),
  app.media_garbage_impl(), app.purge_media_impl(), app.preview_branding_draft_impl(), app.cancel_media_upload_impl(uuid),
  storage_rules.can_read(text), storage_rules.can_insert(text), storage_rules.can_delete(text),
  public.save_branding_draft(jsonb), public.discard_branding_draft(), public.publish_branding(),
  public.begin_media_upload(public.media_kind), public.finish_media_upload(uuid, integer, integer, uuid),
  public.media_garbage(), public.purge_media(), public.preview_branding_draft(), public.cancel_media_upload(uuid)
from public, anon, authenticated, service_role;

grant execute on function
  app.save_branding_draft_impl(jsonb), app.discard_branding_draft_impl(), app.publish_branding_impl(),
  app.begin_media_upload_impl(public.media_kind), app.finish_media_upload_impl(uuid, integer, integer, uuid),
  app.media_garbage_impl(), app.purge_media_impl(), app.preview_branding_draft_impl(), app.cancel_media_upload_impl(uuid),
  public.save_branding_draft(jsonb), public.discard_branding_draft(), public.publish_branding(),
  public.begin_media_upload(public.media_kind), public.finish_media_upload(uuid, integer, integer, uuid),
  public.media_garbage(), public.purge_media(), public.preview_branding_draft(), public.cancel_media_upload(uuid)
to authenticated;
grant execute on function storage_rules.can_read(text) to anon, authenticated;
grant execute on function storage_rules.can_insert(text), storage_rules.can_delete(text) to authenticated;
