// Phase 8: Founding 5 under concurrency — many businesses racing for the five spots at the same
// moment, through the owners' own database calls and the real billing_worker login (the role the
// server's Stripe code uses). No app server or Stripe needed: this checks the database's guarantees.
//
// Test-only cleanup: claimed spots can never be released by the app or owners. Afterwards this file,
// as the database owner (who can bypass any table rule), puts back ONLY the spots it claimed itself
// (Checkout session ids starting cs_test_node_) so the local database keeps its five spots.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { adminPool, asOwner, createOwnerUser, createBusiness, cleanup, settle, runId } from './support.js';

const pool = adminPool(25);
const businesses = [];
let worker;
const RACERS = 20;
const owners = [];

async function releaseTestSpots() {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('alter table public.founding_slots disable trigger founding_slot_guard');
    await c.query(`update public.business_billing set founding_slot = null, plan = null
                    where founding_slot in (select slot from public.founding_slots where checkout_session_id like 'cs_test_node_%')`);
    await c.query(`update public.founding_slots set state = 'available', business_id = null, checkout_session_id = null, reserved_until = null,
                          claimed_at = null, stripe_payment_intent = null, amount_cents = null, currency = null, refunded_at = null, disputed_at = null
                    where checkout_session_id like 'cs_test_node_%' or (state = 'reserved' and business_id = any($1::uuid[]))`, [businesses]);
    await c.query('alter table public.founding_slots enable trigger founding_slot_guard');
    await c.query('commit');
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

before(async () => {
  const url = readFileSync('.env.local', 'utf8').match(/^BILLING_DATABASE_URL=(.+)$/m)?.[1];
  assert.ok(url, 'run `npm run env:local` first (BILLING_DATABASE_URL)');
  worker = new pg.Pool({ connectionString: url, max: 12 });
  for (let i = 0; i < RACERS; i += 1) {
    const owner = await createOwnerUser(`founding-${i}`);
    const biz = await createBusiness(pool, owner.userId);
    businesses.push(biz.businessId);
    owners.push({ ...owner, businessId: biz.businessId });
  }
});

after(async () => {
  await releaseTestSpots();
  await worker.end();
  await cleanup(pool, businesses);
  await pool.end();
});

const availability = async () => (await pool.query('select app.founding_availability_impl() as a')).rows[0].a;

test(`${RACERS} businesses reserving at the same moment: never more spots than exist, one per business`, async () => {
  const before = await availability();
  const { ok, errors } = await settle(owners.map((o) => asOwner(pool, o.userId, 'select public.start_founding_reservation() as slot')));
  const slots = ok.map((r) => r.rows[0].slot);
  assert.equal(slots.length, before.open, 'exactly the open spots were reserved');
  assert.equal(new Set(slots).size, slots.length, 'no spot reserved twice');
  assert.equal(errors.length, RACERS - before.open);
  assert.ok(errors.every((e) => e.code === 'DH002' && ['in_checkout', 'sold_out'].includes(e.detail)), 'everyone else is told there is no spot');
  const after = await availability();
  assert.equal(after.open, 0);
  assert.equal(after.remaining, before.remaining, 'reservations never consume a spot');
});

test('confirmed payments claim the reserved spots — racing duplicate confirmations never double-claim, and a sixth is impossible', async () => {
  const before = await availability();
  const { rows: reserved } = await pool.query(
    `select slot, business_id from public.founding_slots where state = 'reserved' and business_id = any($1::uuid[])`, [businesses]);
  for (const r of reserved) await worker.query('select billing_api.attach_founding_session($1, $2, $3, now() + interval \'30 minutes\')', [r.business_id, r.slot, `cs_test_node_${runId}_${r.slot}`]);
  // Each payment is "confirmed" three times at once (Stripe retries + the owner's return page).
  const claims = reserved.flatMap((r) => [1, 2, 3].map(() =>
    worker.query('select * from billing_api.claim_founding($1, $2, $3, 3000, \'usd\')', [`cs_test_node_${runId}_${r.slot}`, r.business_id, `pi_node_${r.slot}`])));
  const { ok, errors } = await settle(claims);
  assert.deepEqual(errors, []);
  const outcomes = ok.map((r) => r.rows[0].outcome);
  assert.equal(outcomes.filter((o) => o === 'claimed').length, reserved.length, 'each spot claimed exactly once');
  assert.equal(outcomes.filter((o) => o === 'already_claimed').length, reserved.length * 2, 'repeats are harmless');
  const after = await availability();
  assert.equal(after.claimed, before.claimed + reserved.length);
  assert.equal(after.remaining, 5 - after.claimed);
  assert.equal((await pool.query("select count(*)::int as n from public.founding_slots where state = 'claimed'")).rows[0].n <= 5, true, 'never more than five');
  // Everyone else: sold out, and a payment for a made-up session claims nothing.
  const { errors: late } = await settle(owners.slice(0, 3).map((o) => asOwner(pool, o.userId, 'select public.start_founding_reservation()')));
  assert.ok(late.every((e) => e.code === 'DH002'), 'no reservation once sold out (or already a member)');
  const { rows: [forged] } = await worker.query("select * from billing_api.claim_founding('cs_test_node_forged', $1, 'pi_x', 3000, 'usd')", [businesses.at(-1)]);
  assert.equal(forged.outcome, 'not_reserved');
});

test('the worker role cannot touch the spots directly; owners cannot either', async () => {
  await assert.rejects(worker.query("update public.founding_slots set state = 'available'"), { code: '42501' });
  await assert.rejects(asOwner(pool, owners[0].userId, "update public.founding_slots set state = 'available'"), { code: '42501' });
  await assert.rejects(pool.query("update public.founding_slots set state = 'available', business_id = null, checkout_session_id = null, claimed_at = null where state = 'claimed'"), { code: 'DH002' });
});
