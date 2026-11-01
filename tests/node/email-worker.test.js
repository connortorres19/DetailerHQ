// Phase 7: the outbox under concurrency, through the real email_worker login (the role the server
// uses). No app server or provider needed — this checks the database's guarantees.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { adminPool, createOwnerUser, createBusiness, cleanup, settle } from './support.js';

const pool = adminPool(5);
const businesses = [];
let worker;
let biz;

before(async () => {
  const url = readFileSync('.env.local', 'utf8').match(/^EMAIL_WORKER_DATABASE_URL=(.+)$/m)?.[1];
  assert.ok(url, 'run `npm run env:local` first (EMAIL_WORKER_DATABASE_URL)');
  worker = new pg.Pool({ connectionString: url, max: 12 });
  const owner = await createOwnerUser('email-worker');
  biz = await createBusiness(pool, owner.userId);
  businesses.push(biz.businessId);
  await pool.query(
    `insert into public.email_connections (business_id, provider, from_address, secret, status, verified_at)
     values ($1, 'google', 'shop@example.com', extensions.gen_random_bytes(64), 'verified', now())`, [biz.businessId]);
});

after(async () => {
  await worker.end();
  await cleanup(pool, businesses);
  await pool.end();
});

test('12 workers claiming at once never take the same email twice', async () => {
  await pool.query(
    `insert into public.email_outbox (business_id, template, category, recipient, idempotency_key)
     select $1::uuid, 'connection_test', 'system', 'c' || g || '@example.com', 'race-' || $1::text || '-' || g from generate_series(1, 60) g`, [biz.businessId]);
  const { ok, errors } = await settle(Array.from({ length: 12 }, () => worker.query('select id from email_api.claim(10)')));
  assert.deepEqual(errors, []);
  const ids = ok.flatMap((r) => r.rows.map((x) => x.id));
  assert.equal(new Set(ids).size, ids.length, 'no email claimed twice');
  assert.equal(ids.length, 60, 'all due emails claimed');
  const { rows: [{ n }] } = await pool.query(`select count(*)::int as n from public.email_outbox where business_id = $1 and status = 'sending' and attempts = 1`, [biz.businessId]);
  assert.equal(n, 60);
  // A worker that died: its lock expires and the email is claimed again (not lost, not duplicated).
  await pool.query(`update public.email_outbox set locked_until = now() - interval '1 second' where business_id = $1`, [biz.businessId]);
  const again = await settle([worker.query('select id from email_api.claim(50)'), worker.query('select id from email_api.claim(50)')]);
  const ids2 = again.ok.flatMap((r) => r.rows.map((x) => x.id));
  assert.equal(new Set(ids2).size, ids2.length);
  assert.ok(ids2.length > 0);
  await pool.query(`delete from public.email_outbox where business_id = $1`, [biz.businessId]);
});

test('the same event queued from many sessions at once becomes one email', async () => {
  const sql = `select app.email_enqueue($1::uuid, 'booking_confirmed', 'once@example.com', '{}', 'dup-' || $1::text)`;
  const { errors } = await settle(Array.from({ length: 10 }, () => pool.query(sql, [biz.businessId])));
  assert.deepEqual(errors, []);
  const { rows: [{ n }] } = await pool.query(`select count(*)::int as n from public.email_outbox where idempotency_key = $1`, [`dup-${biz.businessId}`]);
  assert.equal(n, 1);
});

test('the worker role is limited to the worker functions', async () => {
  for (const sql of ['select 1 from public.email_outbox', 'select 1 from public.customers', 'select secret from public.email_connections', 'select app.email_mark_verified(gen_random_uuid())'])
    await assert.rejects(worker.query(sql), /permission denied/, sql);
  await assert.rejects(worker.query('select public.approve_request(gen_random_uuid())'), /permission denied/);
});
