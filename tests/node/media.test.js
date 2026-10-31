// Phase 6 images through the real Supabase Storage API (storage-api + RLS), with real owner
// sessions and the publishable key — the same credentials the app uses. No secret key is used
// for any Storage call here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { adminPool, createOwnerUser, createBusiness, cleanup, supabaseAnon } from './support.js';

const pool = adminPool(5);
const businesses = [];
const BUCKET = 'business-media';
let ownerA, ownerB, bizA, bizB;

const webp = (w = 64, h = 64, color = '#1f4e79') => sharp({ create: { width: w, height: h, channels: 3, background: color } }).webp().toBuffer();

before(async () => {
  ownerA = await createOwnerUser('media-a');
  ownerB = await createOwnerUser('media-b');
  bizA = await createBusiness(pool, ownerA.userId);
  bizB = await createBusiness(pool, ownerB.userId);
  businesses.push(bizA.businessId, bizB.businessId);
});

after(async () => {
  // Remove this test's files through the owners' own sessions (the app's path), then the data.
  for (const owner of [ownerA, ownerB]) {
    await owner.client.rpc('discard_branding_draft');
    await pool.query(
      `update public.business_branding set logo_asset_id = null, cover_asset_id = null, gallery_asset_ids = '{}', service_photos = '{}'
        where business_id in (select business_id from public.memberships where user_id = $1)`, [owner.userId]);
    const { data: paths } = await owner.client.rpc('media_garbage');
    if (paths?.length) await owner.client.storage.from(BUCKET).remove(paths);
    await owner.client.rpc('purge_media');
  }
  await cleanup(pool, businesses);
  await pool.end();
});

async function upload(owner, kind, opts = {}) {
  const { data: id, error } = await owner.client.rpc('begin_media_upload', { p_kind: kind });
  assert.equal(error, null, error?.message);
  const put = await owner.client.storage.from(BUCKET).upload(`${id}.webp`, await webp(), { contentType: 'image/webp' });
  assert.equal(put.error, null, put.error?.message);
  const fin = await owner.client.rpc('finish_media_upload', { p_asset: id, p_width: 64, p_height: 64, p_service_id: opts.serviceId ?? null });
  assert.equal(fin.error, null, fin.error?.message);
  return id;
}

test('an owner can only upload into a slot the database reserved for their business', async () => {
  // No reservation: refused.
  const stray = await ownerA.client.storage.from(BUCKET).upload(`${crypto.randomUUID()}.webp`, await webp(), { contentType: 'image/webp' });
  assert.ok(stray.error, 'an unreserved name is refused');
  // B cannot write into A's reserved slot.
  const { data: slot } = await ownerA.client.rpc('begin_media_upload', { p_kind: 'logo' });
  const hijack = await ownerB.client.storage.from(BUCKET).upload(`${slot}.webp`, await webp(), { contentType: 'image/webp' });
  assert.ok(hijack.error, 'B cannot fill A\'s slot');
  // Only WebP (the bucket's only type) — the server re-encodes everything else.
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } }).png().toBuffer();
  const wrongType = await ownerA.client.storage.from(BUCKET).upload(`${slot}.webp`, png, { contentType: 'image/png' });
  assert.ok(wrongType.error, 'non-WebP content types are refused by the bucket');
  // Anonymous callers can't upload at all.
  const anon = await supabaseAnon().storage.from(BUCKET).upload(`${slot}.webp`, await webp(), { contentType: 'image/webp' });
  assert.ok(anon.error);
  // Finishing without a stored object is refused.
  const early = await ownerA.client.rpc('finish_media_upload', { p_asset: slot, p_width: 64, p_height: 64 });
  assert.equal(early.error?.code, 'DH004');
  // B can't cancel A's slot; A can, and the slot is gone.
  assert.equal((await ownerB.client.rpc('cancel_media_upload', { p_asset: slot })).error?.code, 'DH003');
  const { data: path } = await ownerA.client.rpc('cancel_media_upload', { p_asset: slot });
  assert.equal(path, `${slot}.webp`);
  await ownerA.client.rpc('purge_media');
  const { rows: [{ n }] } = await pool.query('select count(*)::int as n from public.media_assets where id = $1', [slot]);
  assert.equal(n, 0);
});

test('drafts are private to the business; published images are public; nothing else is', async () => {
  const logo = await upload(ownerA, 'logo');
  const gallery = await upload(ownerA, 'gallery');
  const path = `${logo}.webp`;

  assert.equal((await ownerA.client.storage.from(BUCKET).download(path)).error, null, 'A reads its own draft image');
  assert.ok((await ownerB.client.storage.from(BUCKET).download(path)).error, 'B cannot read A\'s draft image');
  assert.ok((await supabaseAnon().storage.from(BUCKET).download(path)).error, 'the public cannot read an unpublished image');
  const list = await ownerB.client.storage.from(BUCKET).list();
  assert.ok(!(list.data ?? []).some((o) => o.name === path), 'B\'s listing never shows A\'s files');

  const pub = await ownerA.client.rpc('publish_branding');
  assert.equal(pub.error, null, pub.error?.message);
  assert.equal((await supabaseAnon().storage.from(BUCKET).download(path)).error, null, 'published logo is public');
  assert.equal((await supabaseAnon().storage.from(BUCKET).download(`${gallery}.webp`)).error, null, 'published gallery photo is public');
  // Still only readable, never changeable, by others.
  assert.ok((await ownerB.client.storage.from(BUCKET).remove([path])).data?.length !== 1, 'B cannot delete it');
  assert.ok((await ownerA.client.storage.from(BUCKET).remove([path])).data?.length !== 1, 'even A cannot delete an image in use');
  const overwrite = await ownerA.client.storage.from(BUCKET).upload(path, await webp(8, 8, '#f00'), { contentType: 'image/webp', upsert: true });
  assert.ok(overwrite.error, 'published files are never overwritten');

  // Taking the page offline makes the images private again.
  await pool.query('update public.businesses set published_at = null, accepting_requests = false where id = $1', [bizA.businessId]);
  assert.ok((await supabaseAnon().storage.from(BUCKET).download(path)).error, 'offline page: image private again');
  await pool.query('update public.businesses set published_at = now(), accepting_requests = true where id = $1', [bizA.businessId]);
});

test('replacing and removing images leaves no files or rows behind', async () => {
  const first = await upload(ownerA, 'cover');
  const second = await upload(ownerA, 'cover'); // replaces the first in the draft
  const { data: draft } = await ownerA.client.from('business_branding').select('draft').single();
  assert.equal(draft.draft.cover_asset_id, second);

  const { data: garbage, error } = await ownerA.client.rpc('media_garbage');
  assert.equal(error, null, error?.message);
  assert.ok(garbage.includes(`${first}.webp`), 'the replaced cover is marked for deletion');
  assert.ok(!garbage.includes(`${second}.webp`), 'the new cover is kept');
  // Rows are not forgotten while their files still exist.
  assert.equal((await ownerA.client.rpc('purge_media')).data, 0);
  const removed = await ownerA.client.storage.from(BUCKET).remove(garbage);
  assert.equal(removed.error, null, removed.error?.message);
  assert.ok((await ownerA.client.rpc('purge_media')).data >= 1);
  const { rows } = await pool.query(
    `select (select count(*)::int from public.media_assets where id = $1) as row,
            (select count(*)::int from storage.objects where bucket_id = 'business-media' and name = $2) as file`, [first, `${first}.webp`]);
  assert.deepEqual(rows[0], { row: 0, file: 0 }, 'replaced image: no row and no file left');

  // Discarding the draft drops the unpublished cover too.
  await ownerA.client.rpc('discard_branding_draft');
  const { data: g2 } = await ownerA.client.rpc('media_garbage');
  assert.ok(g2.includes(`${second}.webp`));
  await ownerA.client.storage.from(BUCKET).remove(g2);
  await ownerA.client.rpc('purge_media');
  const { rows: [left] } = await pool.query(
    `select (select count(*)::int from public.media_assets where id = any($1)) as rows,
            (select count(*)::int from storage.objects where bucket_id = 'business-media' and name = any($2)) as files`,
    [[first, second], [`${first}.webp`, `${second}.webp`]]);
  assert.deepEqual(left, { rows: 0, files: 0 }, 'both covers fully gone: rows and files');
});

test('service photos attach only to the business\'s own services', async () => {
  const { rows: [svcA] } = await pool.query(`select id from public.services where business_id = $1 limit 1`, [bizA.businessId]);
  const { rows: [svcB] } = await pool.query(`select id from public.services where business_id = $1 limit 1`, [bizB.businessId]);
  const photo = await upload(ownerA, 'service', { serviceId: svcA.id });
  const { data } = await ownerA.client.from('business_branding').select('draft').single();
  assert.equal(data.draft.service_photos[svcA.id], photo);
  const { data: slot } = await ownerA.client.rpc('begin_media_upload', { p_kind: 'service' });
  await ownerA.client.storage.from(BUCKET).upload(`${slot}.webp`, await webp(), { contentType: 'image/webp' });
  const foreign = await ownerA.client.rpc('finish_media_upload', { p_asset: slot, p_width: 64, p_height: 64, p_service_id: svcB.id });
  assert.equal(foreign.error?.code, 'DH003', 'B\'s service is "not found" for A');
  // The refused upload is cancelled: its stored file and its row are removed.
  const { data: path } = await ownerA.client.rpc('cancel_media_upload', { p_asset: slot });
  assert.equal((await ownerA.client.storage.from(BUCKET).remove([path])).data?.length, 1);
  await ownerA.client.rpc('purge_media');
  const { rows: [left] } = await pool.query(
    `select (select count(*)::int from public.media_assets where id = $1) as rows,
            (select count(*)::int from storage.objects where bucket_id = 'business-media' and name = $2) as files`, [slot, path]);
  assert.deepEqual(left, { rows: 0, files: 0 });
});
