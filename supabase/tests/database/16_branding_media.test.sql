-- Phase 6: branding drafts and publishing, images (media_assets + Storage rules), and per-user
-- theme preferences. Storage objects are simulated with rows in storage.objects (what storage-api
-- writes); tests/node/media.test.js covers the real Storage API. Rolled back.
begin;
\ir _helpers.psql
select plan(72);

select pg_temp.make_business('bm-a@example.com', 'bm-a', 'mobile') as a \gset
select pg_temp.make_business('bm-b@example.com', 'bm-b', 'mobile') as b \gset
select pg_temp.owner_of(:'a') as owner_a \gset
select pg_temp.owner_of(:'b') as owner_b \gset
select pg_temp.service_id(:'a', 'Full detail') as svc_a \gset
select pg_temp.service_id(:'b', 'Full detail') as svc_b \gset
update public.businesses set email = 'owner-a@example.com' where id = :'a';

-- An uploaded object as storage-api records it.
create function pg_temp.store(p_name text, p_size int default 1000, p_type text default 'image/webp') returns void language sql as $$
  insert into storage.objects (bucket_id, name, metadata) values ('business-media', p_name, jsonb_build_object('size', p_size, 'mimetype', p_type)) $$;
-- Upload as the owner: reserve, store, finish.
create function pg_temp.upload(p_owner uuid, p_kind public.media_kind, p_service uuid default null) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform pg_temp.as_user(p_owner);
  v := public.begin_media_upload(p_kind);
  execute 'reset role';
  perform pg_temp.store(v::text || '.webp');
  perform pg_temp.as_user(p_owner);
  perform public.finish_media_upload(v, 800, 600, p_service);
  execute 'reset role';
  return v;
end $$;

-- ---- Writes only through functions ------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select throws_ok(format($$insert into public.business_branding (business_id, primary_color) values (%L, '#000000')$$, :'a'), '42501', null, 'owners cannot write branding directly');
select throws_ok(format($$insert into public.media_assets (business_id, kind, status, width, height, bytes, ready_at) values (%L, 'logo', 'ready', 1, 1, 1, now())$$, :'a'),
  '42501', null, 'owners cannot register images directly');
select throws_ok($$select app.branding_clean(gen_random_uuid(), '{}')$$, '42501', null, 'internal helpers are not callable');
select is(storage_rules.can_read('00000000-0000-4000-8000-000000000000.webp'), false, 'the read rule (used by the Storage policies) knows no unknown file');
reset role;

-- ---- Images: reserve → store → finish ----------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select public.begin_media_upload('logo') as slot \gset
select throws_ok(format($$select public.finish_media_upload(%L, 64, 64)$$, :'slot'), 'DH004', 'the image was not stored', 'finishing needs the stored object');
reset role;
select pg_temp.store(:'slot' || '.webp', 1000, 'image/png');
select pg_temp.as_user(:'owner_a');
select throws_ok(format($$select public.finish_media_upload(%L, 64, 64)$$, :'slot'), 'DH004', 'invalid image', 'only WebP objects are accepted');
select pg_temp.as_user(:'owner_b');
select throws_ok(format($$select public.finish_media_upload(%L, 64, 64)$$, :'slot'), 'DH003', 'upload not found', 'B cannot finish A''s upload');
select throws_ok(format($$select public.cancel_media_upload(%L)$$, :'slot'), 'DH003', 'upload not found', 'B cannot cancel A''s upload');
reset role;
select is((select storage_path from public.media_assets where id = :'slot'), :'slot' || '.webp', 'object name is <id>.webp');

select pg_temp.upload(:'owner_a', 'logo') as logo \gset
select pg_temp.upload(:'owner_a', 'cover') as cover \gset
select pg_temp.upload(:'owner_a', 'gallery') as g1 \gset
select pg_temp.upload(:'owner_a', 'service', :'svc_a') as svcphoto \gset
select is((select status::text from public.media_assets where id = :'logo'), 'ready', 'finished upload is ready');
select ok((select draft ->> 'logo_asset_id' = :'logo' and draft ->> 'cover_asset_id' = :'cover'
                  and draft -> 'gallery_asset_ids' = jsonb_build_array(:'g1')
                  and draft -> 'service_photos' ->> :'svc_a' = :'svcphoto'
             from public.business_branding where business_id = :'a'), 'uploads land in the draft (logo, cover, gallery, service)');
select is((select primary_color from public.business_branding where business_id = :'a'), null, 'nothing published by uploading');

-- A service photo for another business's service is refused.
select pg_temp.as_user(:'owner_a');
select public.begin_media_upload('service') as slot2 \gset
reset role;
select pg_temp.store(:'slot2' || '.webp');
select pg_temp.as_user(:'owner_a');
select throws_ok(format($$select public.finish_media_upload(%L, 64, 64, %L)$$, :'slot2', :'svc_b'), 'DH003', 'service not found', 'B''s service is not found for A');
reset role;

-- ---- Draft validation ----------------------------------------------------------------------------
select pg_temp.as_user(:'owner_a');
select throws_ok($$select public.save_branding_draft('{"primary_color":"red"}')$$, 'DH004', 'enter colours like #1f4e79', 'colour format');
select throws_ok($$select public.save_branding_draft('{"primary_color":"#123456; x"}')$$, 'DH004', 'enter colours like #1f4e79', 'no CSS injection through colours');
select throws_ok($$select public.save_branding_draft('{"bogus":1}')$$, 'DH004', 'invalid branding', 'unknown keys refused');
select throws_ok($$select public.save_branding_draft('{"website_url":"http://plain.example.com"}')$$, 'DH004', 'enter a website starting with https://', 'websites must be https');
select throws_ok($$select public.save_branding_draft('{"website_url":"javascript:alert(1)"}')$$, 'DH004', 'enter a website starting with https://', 'no script URLs');
select throws_ok($$select public.save_branding_draft('{"social_links":{"instagram":"https://evil.example.com/x"}}')$$, 'DH004', 'that isn''t a instagram link', 'social links on their own domain');
select throws_ok($$select public.save_branding_draft('{"social_links":{"instagram":"https://instagram.com.evil.com/x"}}')$$, 'DH004', 'that isn''t a instagram link', 'look-alike domains refused');
select throws_ok($$select public.save_branding_draft('{"social_links":{"myspace":"https://myspace.com/x"}}')$$, 'DH004', 'invalid social links', 'unknown networks refused');
select throws_ok($$select public.save_branding_draft(jsonb_build_object('intro_text', repeat('x', 301)))$$, 'DH004', 'too long', 'intro limit');
select throws_ok(format($$select public.save_branding_draft(jsonb_build_object('logo_asset_id', %L))$$, :'cover'), 'DH004', 'unknown image', 'a cover can''t be the logo');
select throws_ok(format($$select public.save_branding_draft(jsonb_build_object('gallery_asset_ids', jsonb_build_array(%L, %L)))$$, :'g1', :'g1'), 'DH004', 'unknown image', 'no duplicate gallery photos');
select throws_ok(format($$select public.save_branding_draft(jsonb_build_object('service_photos', jsonb_build_object(%L, %L)))$$, :'svc_b', :'svcphoto'), 'DH004',
  'unknown service or image', 'service photos only for own services');
reset role;
select pg_temp.upload(:'owner_b', 'logo') as logo_b \gset
select pg_temp.as_user(:'owner_a');
select throws_ok(format($$select public.save_branding_draft(jsonb_build_object('logo_asset_id', %L))$$, :'logo_b'), 'DH004', 'unknown image', 'A cannot use B''s image');
select lives_ok(format($$select public.save_branding_draft(jsonb_build_object(
    'primary_color', '#0B6E4F', 'secondary_color', '#1f2a44', 'logo_asset_id', %L, 'cover_asset_id', %L,
    'gallery_asset_ids', jsonb_build_array(%L), 'service_photos', jsonb_build_object(%L, %L),
    'website_url', 'https://northside.example.com', 'social_links', jsonb_build_object('instagram', 'https://instagram.com/northside', 'facebook', ''),
    'show_email', true, 'intro_text', ' Ceramic coatings in Austin. ', 'cancellation_policy_text', '24 hours notice'))$$,
  :'logo', :'cover', :'g1', :'svc_a', :'svcphoto'), 'a full draft saves');
reset role;
select ok((select draft ->> 'primary_color' = '#0b6e4f' and draft ->> 'intro_text' = 'Ceramic coatings in Austin.' and not (draft -> 'social_links' ? 'facebook')
             from public.business_branding where business_id = :'a'), 'colours lower-cased, text trimmed, empty links dropped');

-- Drafts stay private.
select pg_temp.as_booking_api();
select is(public_api.get_booking_page('bm-a') -> 'branding' -> 'logo', 'null'::jsonb, 'the public page shows no draft logo');
select is(public_api.get_booking_page('bm-a') ->> 'intro', null, 'nor draft wording');
select ok(public_api.get_booking_page('bm-a')::text not like '%owner-a@example.com%', 'nor the business email');
reset role;
select pg_temp.as_anon();
select is(storage_rules.can_read(:'logo' || '.webp'), false, 'the public cannot read a draft image');
reset role;
select pg_temp.as_user(:'owner_b');
select is(storage_rules.can_read(:'logo' || '.webp'), false, 'B cannot read A''s draft image');
select is((select count(*)::int from public.media_assets where business_id = :'a'), 0, 'B sees none of A''s images');
select is((select count(*)::int from public.business_branding where business_id = :'a'), 0, 'B sees none of A''s branding');
select lives_ok($$select public.publish_branding()$$, 'B publishes its own draft (its logo)');
reset role;
select is((select primary_color from public.business_branding where business_id = :'a'), null, 'B''s publish leaves A''s draft unpublished');
select pg_temp.as_user(:'owner_b');
select pg_temp.as_user(:'owner_a');
select is(storage_rules.can_read(:'logo' || '.webp'), true, 'A reads its own draft image');
select is(storage_rules.can_insert(:'logo' || '.webp'), false, 'a ready image can''t be overwritten');
select is(storage_rules.can_delete(:'logo' || '.webp'), false, 'an image in use can''t be deleted');

-- The owner's draft preview shows it.
select ok((public.preview_branding_draft() -> 'branding' -> 'logo' ->> 'id') = :'logo' and public.preview_branding_draft() ->> 'intro' = 'Ceramic coatings in Austin.',
  'draft preview shows draft images and wording');

-- ---- Publish -------------------------------------------------------------------------------------
select lives_ok($$select public.publish_branding()$$, 'publish');
reset role;
select ok((select primary_color = '#0b6e4f' and logo_asset_id = :'logo' and draft is null and published_at is not null
             from public.business_branding where business_id = :'a'), 'published columns set, draft cleared');
select is((select intro_text from public.booking_settings where business_id = :'a'), 'Ceramic coatings in Austin.', 'wording published to booking_settings');
select pg_temp.as_booking_api();
select is(public_api.get_booking_page('bm-a') -> 'branding' -> 'logo' ->> 'id', :'logo', 'public page shows the published logo');
select is(public_api.get_booking_page('bm-a') -> 'branding' ->> 'email', 'owner-a@example.com', 'email shown only because the owner chose to');
select is(public_api.get_booking_page('bm-a') -> 'branding' -> 'service_photos' -> :'svc_a' ->> 'id', :'svcphoto', 'service photo published');
select is(public_api.get_booking_page('bm-a') -> 'branding' -> 'social' ->> 'instagram', 'https://instagram.com/northside', 'links published');
reset role;
select pg_temp.as_anon();
select is(storage_rules.can_read(:'logo' || '.webp'), true, 'published images are public');
select is(storage_rules.can_read(:'cover' || '.webp'), true, 'published cover is public');
reset role;
-- Archiving the service hides its photo; an offline page hides everything.
update public.services set archived_at = now() where id = :'svc_a';
select pg_temp.as_anon();
select is(storage_rules.can_read(:'svcphoto' || '.webp'), false, 'archived service: photo no longer public');
reset role;
update public.services set archived_at = null where id = :'svc_a';
update public.businesses set published_at = null, accepting_requests = false where id = :'a';
select pg_temp.as_anon();
select is(storage_rules.can_read(:'logo' || '.webp'), false, 'offline page: images private');
reset role;
update public.businesses set account_status = 'suspended', published_at = now() where id = :'a';
select pg_temp.as_anon();
select is(storage_rules.can_read(:'logo' || '.webp'), false, 'suspended business: images private');
reset role;
update public.businesses set account_status = 'pilot' where id = :'a';

-- ---- Replace, remove, garbage ------------------------------------------------------------------
select pg_temp.upload(:'owner_a', 'logo') as logo2 \gset
select pg_temp.as_user(:'owner_a');
select ok(not (:'logo' || '.webp' = any (public.media_garbage())), 'the replaced logo is still published, so it is kept');
select lives_ok($$select public.publish_branding()$$, 'publish the new logo');
select ok(:'logo' || '.webp' = any (public.media_garbage()), 'the old logo is now unused and marked for deletion');
select is(storage_rules.can_delete(:'logo' || '.webp'), true, 'A may delete it from Storage now');
select is(public.purge_media(), 0, 'nothing is forgotten while its file still exists');
reset role;
select is((select count(*)::int from public.media_assets where id = :'logo'), 1, 'the old logo row stays while its file exists');
-- (the Storage API deletes the file; simulated here past Supabase's direct-delete guard)
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'business-media' and name = :'logo' || '.webp';
reset storage.allow_delete_query;
select pg_temp.as_user(:'owner_a');
select ok(public.purge_media() >= 1, 'after the file is deleted, the row goes');
reset role;
select is((select count(*)::int from public.media_assets where id = :'logo'), 0, 'old logo fully removed');
select pg_temp.as_user(:'owner_b');
select is(storage_rules.can_delete(:'logo2' || '.webp'), false, 'B can never delete A''s files');
reset role;

-- Discard: unpublished uploads become garbage.
select pg_temp.upload(:'owner_a', 'gallery') as g2 \gset
select pg_temp.as_user(:'owner_a');
select lives_ok($$select public.discard_branding_draft()$$, 'discard the draft');
select ok(:'g2' || '.webp' = any (public.media_garbage()), 'a discarded upload is garbage');
reset role;
select is((select draft from public.business_branding where business_id = :'a'), null, 'no draft after discarding');

-- ---- Limits ----------------------------------------------------------------------------------------
select pg_temp.as_user(:'owner_b');
select public.begin_media_upload('gallery') from generate_series(1, 10);
select throws_ok($$select public.begin_media_upload('gallery')$$, 'DH005', null, 'at most 10 uploads in flight');
reset role;
update public.business_branding set draft = jsonb_build_object('gallery_asset_ids', (select jsonb_agg(gen_random_uuid()) from generate_series(1, 12))) where business_id = :'b';
update public.media_assets set created_at = now() - interval '2 hours' where business_id = :'b' and status = 'pending';
select pg_temp.as_user(:'owner_b');
select throws_ok($$select public.begin_media_upload('gallery')$$, 'DH004', 'the gallery holds up to 12 photos', 'gallery full');
reset role;

-- ---- Theme preferences: each user's own row only ----------------------------------------------
select pg_temp.as_user(:'owner_a');
insert into public.user_preferences (user_id, theme) values (:'owner_a', 'dark');
select throws_ok(format($$insert into public.user_preferences (user_id, theme) values (%L, 'dark')$$, :'owner_b'), '42501', null, 'cannot create another user''s preference');
select throws_ok(format($$update public.user_preferences set theme = 'neon' where user_id = %L$$, :'owner_a'), '23514', null, 'only light, dark or system');
select pg_temp.as_user(:'owner_b');
select is((select count(*)::int from public.user_preferences where user_id = :'owner_a'), 0, 'B cannot read A''s preference');
update public.user_preferences set theme = 'light' where user_id = :'owner_a';
select pg_temp.as_anon();
select throws_ok('select 1 from public.user_preferences', '42501', null, 'anon has no access');
reset role;
select is((select theme from public.user_preferences where user_id = :'owner_a'), 'dark', 'A''s preference unchanged by B');

select * from finish();
rollback;
