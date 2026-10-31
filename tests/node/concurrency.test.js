// Capacity under real concurrency: many Postgres sessions at once, deterministic lock
// interleavings, hold expiry across transactions, approve/withdraw races, independent
// resources, and the retry helper. Each owner call runs exactly like a Data API request
// (role `authenticated` + JWT claims, one transaction).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import {
  adminPool, asOwner, ownerSession, createOwnerUser, createBusiness, atLocal, insertRequest,
  cleanup, settle, local, sha256, enableBookingApi,
} from './support.js';
import { classifyDbError, withRetry } from '../../src/db/errors.js';

const pool = adminPool(40);
const businesses = [];
let owner;

before(async () => {
  owner = await createOwnerUser('concurrency');
});

after(async () => {
  await cleanup(pool, businesses);
  await pool.end();
});

async function freshBusiness(mode, capacity) {
  // One business per owner (MVP rule), so each scenario gets its own owner.
  const user = await createOwnerUser(`owner-${businesses.length}`);
  const biz = await createBusiness(pool, user.userId, { mode, capacity });
  businesses.push(biz.businessId);
  return { ...biz, userId: user.userId };
}

async function peakUsage(businessId, start, minutes) {
  const { rows } = await pool.query(
    `select app.peak_usage(r.id, tstzrange($2::timestamptz, $2::timestamptz + make_interval(mins => $3), '[)')) as peak
       from public.schedule_resources r where r.business_id = $1 and r.kind = 'general'`,
    [businessId, start, minutes],
  );
  return rows[0].peak;
}

for (const [mode, capacity, attempts] of [['mobile', null, 10], ['shop', 3, 12]]) {
  const expected = capacity ?? 1;
  test(`${attempts} simultaneous approvals for one slot with capacity ${expected} -> exactly ${expected} succeed`, async () => {
    const biz = await freshBusiness(mode, capacity);
    const start = await atLocal(pool, 2, '10:00');
    const requests = [];
    for (let i = 0; i < attempts; i += 1) requests.push(await insertRequest(pool, biz.businessId, start));

    const { ok, errors } = await settle(
      requests.map((r) => asOwner(pool, biz.userId, 'select public.approve_request($1)', [r.id])),
    );

    assert.equal(ok.length, expected);
    assert.equal(errors.length, attempts - expected);
    for (const error of errors) {
      assert.ok(['capacity_exceeded', 'retryable'].includes(classifyDbError(error).kind), `unexpected ${error.code} ${error.message}`);
    }
    assert.equal(await peakUsage(biz.businessId, start, 120), expected);
    const { rows } = await pool.query(
      `select count(*)::int as approved,
              count(a.id)::int as with_appointment
         from public.booking_requests r left join public.appointments a on a.booking_request_id = r.id
        where r.business_id = $1 and r.status = 'approved'`,
      [biz.businessId],
    );
    assert.deepEqual(rows[0], { approved: expected, with_appointment: expected });
  });
}

test('mixed simultaneous holds, proposals and approvals never exceed capacity 2', async () => {
  const biz = await freshBusiness('shop', 2);
  const start = await atLocal(pool, 3, '09:00');
  const reqs = [];
  for (let i = 0; i < 12; i += 1) reqs.push(await insertRequest(pool, biz.businessId, start, 90));
  const ops = reqs.map((r, i) => {
    if (i % 3 === 0) return asOwner(pool, biz.userId, 'select public.place_hold($1, 24)', [r.id]);
    if (i % 3 === 1) return asOwner(pool, biz.userId, 'select public.propose_time($1, $2)', [r.id, start]);
    return asOwner(pool, biz.userId, 'select public.approve_request($1)', [r.id]);
  });
  const { ok, errors } = await settle(ops);
  assert.equal(ok.length, 2);
  assert.ok(errors.every((e) => classifyDbError(e).kind === 'capacity_exceeded'));
  assert.equal(await peakUsage(biz.businessId, start, 90), 2);
});

test('a waiting transaction sees the capacity taken by the one it waited for (fresh snapshot after lock)', async () => {
  const biz = await freshBusiness('mobile');
  const start = await atLocal(pool, 4, '10:00');
  const first = await insertRequest(pool, biz.businessId, start);
  const second = await insertRequest(pool, biz.businessId, start);

  const holder = await ownerSession(pool, biz.userId);
  await holder.query('select public.place_hold($1, 24)', [first.id]); // takes the resource lock

  const waiter = await ownerSession(pool, biz.userId);
  const waiterPid = (await waiter.query('select pg_backend_pid() as pid')).rows[0].pid;
  const pending = waiter.query('select public.approve_request($1)', [second.id]).then(
    () => 'committed-ok',
    (error) => error,
  );

  await sleep(300);
  const { rows } = await pool.query('select wait_event_type from pg_stat_activity where pid = $1', [waiterPid]);
  assert.equal(rows[0].wait_event_type, 'Lock', 'second transaction is blocked on the resource lock');

  await holder.query('commit');
  holder.release();
  const outcome = await pending;
  await waiter.query('rollback');
  waiter.release();

  assert.notEqual(outcome, 'committed-ok');
  assert.equal(classifyDbError(outcome).kind, 'capacity_exceeded');
});

test('a waiting transaction sees capacity freed by the one it waited for', async () => {
  const biz = await freshBusiness('mobile');
  const start = await atLocal(pool, 5, '10:00');
  const booked = await insertRequest(pool, biz.businessId, start);
  const next = await insertRequest(pool, biz.businessId, start);
  const { rows: [{ id: appointmentId }] } = await asOwner(pool, biz.userId, 'select public.approve_request($1) as id', [booked.id]);

  const canceller = await ownerSession(pool, biz.userId);
  await canceller.query('select public.cancel_appointment($1)', [appointmentId]);

  const waiter = await ownerSession(pool, biz.userId);
  const pending = waiter.query('select public.approve_request($1)', [next.id]);
  await sleep(200);
  await canceller.query('commit');
  canceller.release();

  await pending; // must succeed now that the slot is free
  await waiter.query('commit');
  waiter.release();
  assert.equal(await peakUsage(biz.businessId, start, 120), 1);
});

test('approve vs customer withdraw race: no deadlocks, always a consistent outcome (25 rounds)', async () => {
  const biz = await freshBusiness('shop', 5);
  const role = await enableBookingApi(pool);
  const { password } = role;
  const bookingPool = new pg.Pool({
    connectionString: local.DB_URL.replace('postgres:postgres@', `booking_api:${password}@`),
    max: 5,
  });
  try {
    for (let round = 0; round < 25; round += 1) {
      const start = await atLocal(pool, 6 + (round % 20), '08:00');
      const req = await insertRequest(pool, biz.businessId, start, 60);
      const ip = sha256(`race-${round}`);
      const results = await Promise.allSettled([
        asOwner(pool, biz.userId, 'select public.approve_request($1)', [req.id]),
        bookingPool.query('select public_api.withdraw_request($1, $2)', [sha256(req.token), ip]),
      ]);
      for (const r of results) {
        if (r.status === 'rejected') {
          assert.notEqual(r.reason.code, '40P01', 'no deadlock');
          assert.equal(classifyDbError(r.reason).kind, 'invalid_state', `${r.reason.code} ${r.reason.message}`);
        }
      }
      // Public functions return errors as results (migration 11): a losing withdraw is
      // {"error": {"code": "DH002"}}, not a rejected query.
      const withdrawError = results[1].status === 'fulfilled' ? results[1].value.rows[0].withdraw_request.error : null;
      if (withdrawError) assert.equal(withdrawError.code, 'DH002', JSON.stringify(withdrawError));
      const wins = [results[0].status === 'fulfilled', results[1].status === 'fulfilled' && !withdrawError];
      assert.equal(wins.filter(Boolean).length, 1, 'exactly one side wins');
      const { rows: [state] } = await pool.query(
        `select r.status::text, (select count(*)::int from public.appointments a where a.booking_request_id = r.id) as appts
           from public.booking_requests r where r.id = $1`,
        [req.id],
      );
      assert.ok(
        (state.status === 'approved' && state.appts === 1) || (state.status === 'withdrawn' && state.appts === 0),
        JSON.stringify(state),
      );
    }
  } finally {
    await bookingPool.end();
    await role.restore();
  }
});

test('an expired hold stops blocking as soon as it expires, before any clean-up job', async () => {
  const biz = await freshBusiness('mobile');
  const start = await atLocal(pool, 7, '10:00');
  const held = await insertRequest(pool, biz.businessId, start);
  const other = await insertRequest(pool, biz.businessId, start);
  await asOwner(pool, biz.userId, 'select public.place_hold($1, 24)', [held.id]);

  await assert.rejects(
    asOwner(pool, biz.userId, 'select public.approve_request($1)', [other.id]),
    (e) => classifyDbError(e).kind === 'capacity_exceeded',
  );

  // Shorten the hold to expire in one second, then wait past it. No sweep runs.
  await pool.query(
    "update public.schedule_blocks set expires_at = clock_timestamp() + interval '1 second' where booking_request_id = $1",
    [held.id],
  );
  await sleep(1500);
  const { rows: [{ n }] } = await pool.query(
    "select count(*)::int as n from public.schedule_blocks where booking_request_id = $1 and kind = 'hold'", [held.id],
  );
  assert.equal(n, 1, 'expired hold row still exists (not swept yet)');

  await asOwner(pool, biz.userId, 'select public.approve_request($1)', [other.id]);
  assert.equal(await peakUsage(biz.businessId, start, 120), 1);

  await pool.query('select app.expire_stale()');
  const { rows: [{ n: after }] } = await pool.query(
    "select count(*)::int as n from public.schedule_blocks where booking_request_id = $1", [held.id],
  );
  assert.equal(after, 0, 'housekeeping removes the expired row');
});

test('separate resources lock and count independently under concurrency', async () => {
  const biz = await freshBusiness('shop', 1);
  const start = await atLocal(pool, 8, '10:00');
  const { rows: [{ id: bayId }] } = await pool.query(
    "insert into public.schedule_resources (business_id, kind, name, capacity) values ($1, 'bay', 'Bay 1', 1) returning id",
    [biz.businessId],
  );
  const { rows: [{ id: generalId }] } = await pool.query(
    "select id from public.schedule_resources where business_id = $1 and kind = 'general'", [biz.businessId],
  );
  const reqs = [];
  for (let i = 0; i < 8; i += 1) reqs.push(await insertRequest(pool, biz.businessId, start));
  const insertHold = (resourceId, requestId) => pool.query(
    `insert into public.schedule_blocks (business_id, resource_id, kind, during, booking_request_id, expires_at)
     values ($1, $2, 'hold', tstzrange($3::timestamptz, $3::timestamptz + interval '2 hours', '[)'), $4, now() + interval '1 hour')`,
    [biz.businessId, resourceId, start, requestId],
  );
  const { ok, errors } = await settle(
    reqs.map((r, i) => insertHold(i % 2 === 0 ? generalId : bayId, r.id)),
  );
  assert.equal(ok.length, 2, 'one block per resource');
  assert.ok(errors.every((e) => classifyDbError(e).kind === 'capacity_exceeded'));
  const { rows } = await pool.query(
    'select resource_id, count(*)::int as n from public.schedule_blocks where business_id = $1 group by 1', [biz.businessId],
  );
  assert.deepEqual(rows.map((r) => r.n).sort(), [1, 1]);
});

test('withRetry retries deadlock victims and does not retry business-rule errors', async () => {
  await pool.query('create temp table if not exists _never (id int)'); // warm a connection
  const { rows: [{ a, b }] } = await pool.query(
    `select gen_random_uuid() as a, gen_random_uuid() as b`,
  );
  const biz = await freshBusiness('shop', 2);
  await pool.query(
    `insert into public.customers (id, business_id, first_name, phone_e164) values
       ($1, $3, 'A', '+15125550161'), ($2, $3, 'B', '+15125550162')`,
    [a, b, biz.businessId],
  );

  // Two transactions update the same two rows in opposite order -> PostgreSQL aborts one
  // with 40P01. withRetry re-runs the victim, so both eventually succeed.
  let attemptsSeen = 0;
  const run = (first, second) => withRetry(async () => {
    attemptsSeen += 1;
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("update public.customers set notes = 'x' where id = $1", [first]);
      await sleep(100);
      await client.query("update public.customers set notes = 'y' where id = $1", [second]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }, { attempts: 4 });
  await Promise.all([run(a, b), run(b, a)]);
  assert.ok(attemptsSeen >= 3, 'at least one deadlock victim was retried');

  let calls = 0;
  const start = await atLocal(pool, 9, '10:00');
  const r1 = await insertRequest(pool, biz.businessId, start);
  const r2 = await insertRequest(pool, biz.businessId, start);
  const r3 = await insertRequest(pool, biz.businessId, start);
  await asOwner(pool, biz.userId, 'select public.approve_request($1)', [r1.id]);
  await asOwner(pool, biz.userId, 'select public.approve_request($1)', [r2.id]);
  await assert.rejects(
    withRetry(() => { calls += 1; return asOwner(pool, biz.userId, 'select public.approve_request($1)', [r3.id]); }),
    (e) => classifyDbError(e).kind === 'capacity_exceeded',
  );
  assert.equal(calls, 1, 'capacity_exceeded is not retried');
});

test('housekeeping (expire_stale) running concurrently with approvals, holds and withdrawals: no deadlocks, no overbooking', async () => {
  const biz = await freshBusiness('shop', 2);
  const future = await atLocal(pool, 12, '10:00');
  const stale = [];
  for (let i = 0; i < 10; i += 1) {
    // Pending requests whose time has already passed -> expire_stale moves them to expired.
    stale.push(await insertRequest(pool, biz.businessId, new Date(Date.now() - (i + 1) * 3600_000)));
  }
  const live = [];
  for (let i = 0; i < 10; i += 1) live.push(await insertRequest(pool, biz.businessId, future, 60));
  // Holds that expire mid-test, so the sweep deletes rows while others insert.
  for (const r of live.slice(0, 2)) {
    await asOwner(pool, biz.userId, 'select public.place_hold($1, 24)', [r.id]);
    await pool.query(
      "update public.schedule_blocks set expires_at = clock_timestamp() + interval '300 milliseconds' where booking_request_id = $1",
      [r.id],
    );
  }
  await sleep(400);

  const ops = [];
  for (let i = 0; i < 6; i += 1) ops.push(pool.query('select app.expire_stale()'));
  for (const r of live.slice(2)) ops.push(asOwner(pool, biz.userId, 'select public.approve_request($1)', [r.id]));
  for (const r of stale.slice(0, 3)) ops.push(asOwner(pool, biz.userId, 'select public.decline_request($1)', [r.id]));
  const { errors } = await settle(ops);

  for (const e of errors) {
    assert.notEqual(e.code, '40P01', 'no deadlock');
    assert.ok(['capacity_exceeded', 'invalid_state'].includes(classifyDbError(e).kind), `${e.code} ${e.message}`);
  }
  assert.ok(await peakUsage(biz.businessId, future, 60) <= 2, 'capacity never exceeded');
  const { rows } = await pool.query(
    `select count(*) filter (where status = 'approved')::int as approved,
            count(*) filter (where status = 'pending' and requested_start <= now())::int as stale_pending
       from public.booking_requests where business_id = $1`,
    [biz.businessId],
  );
  assert.equal(rows[0].approved, 2, 'exactly capacity-many approvals succeeded (expired holds did not block)');
  assert.equal(rows[0].stale_pending, 0, 'every past pending request ended expired or declined');
});

// ---------------------------------------------------------------------------
// Phase 4D: owner actions racing each other and the public booking page.
// ---------------------------------------------------------------------------

async function slotIds(businessId) {
  const { rows: [r] } = await pool.query(
    `select (select id from public.vehicle_size_classes where business_id = $1 order by sort_order limit 1) as size,
            (select id from public.services where business_id = $1 and name = 'Full detail') as service`,
    [businessId],
  );
  return r;
}

test('owner approval, instant public booking and a calendar hold racing for one slot (capacity 1): exactly one wins (15 rounds)', async () => {
  const biz = await freshBusiness('mobile');
  await asOwner(pool, biz.userId, "update public.booking_settings set booking_mode = 'instant' where business_id = $1", [biz.businessId]);
  const { size, service } = await slotIds(biz.businessId);
  for (let round = 0; round < 15; round += 1) {
    const start = await atLocal(pool, 2 + round, '10:00');
    const req = await insertRequest(pool, biz.businessId, start, 120);
    const payload = {
      service_ids: [service], vehicle_size_class_id: size, requested_start: start, location_type: 'mobile',
      service_address_line1: '1234 Oak St', service_city: 'Austin', service_state: 'TX', service_postal_code: '78701',
      contact_first_name: 'Sam', contact_phone_e164: `+15125550${String(100 + round)}`, contact_email: `sam${round}@example.com`,
      vehicle_make: 'Ford', vehicle_model: 'F-150', consent: true,
    };
    const [approve, submit, hold] = await Promise.allSettled([
      asOwner(pool, biz.userId, 'select public.approve_request($1)', [req.id]),
      pool.query('select public_api.submit_booking_request($1, $2, gen_random_uuid(), $3, $4) as r',
        [biz.slug, JSON.stringify(payload), sha256(`race-token-${round}`), sha256(`race-ip-${round}`)]),
      asOwner(pool, biz.userId, "select public.place_calendar_hold($1, $1::timestamptz + interval '2 hours', 24)", [start]),
    ]);
    for (const r of [approve, hold]) {
      if (r.status === 'rejected') assert.equal(classifyDbError(r.reason).kind, 'capacity_exceeded', `${r.reason.code} ${r.reason.message}`);
    }
    assert.equal(submit.status, 'fulfilled');
    const submitWon = !submit.value.rows[0].r.error;
    if (!submitWon) assert.equal(submit.value.rows[0].r.error.detail, 'fully booked');
    const wins = [approve.status === 'fulfilled', submitWon, hold.status === 'fulfilled'].filter(Boolean).length;
    assert.equal(wins, 1, `round ${round}: exactly one of approve / instant booking / hold wins`);
    assert.equal(await peakUsage(biz.businessId, start, 120), 1);
  }
});

test('two reschedules into the same free slot at once: one moves, the other stays put (10 rounds)', async () => {
  const biz = await freshBusiness('mobile');
  for (let round = 0; round < 10; round += 1) {
    const a = await insertRequest(pool, biz.businessId, await atLocal(pool, 3 + round, '07:00'), 60);
    const b = await insertRequest(pool, biz.businessId, await atLocal(pool, 3 + round, '09:00'), 60);
    const { rows: [{ id: apptA }] } = await asOwner(pool, biz.userId, 'select public.approve_request($1) as id', [a.id]);
    const { rows: [{ id: apptB }] } = await asOwner(pool, biz.userId, 'select public.approve_request($1) as id', [b.id]);
    const target = await atLocal(pool, 3 + round, '15:00');
    const { ok, errors } = await settle([
      asOwner(pool, biz.userId, 'select public.reschedule_appointment($1, $2)', [apptA, target]),
      asOwner(pool, biz.userId, 'select public.reschedule_appointment($1, $2)', [apptB, target]),
    ]);
    assert.equal(ok.length, 1);
    assert.equal(classifyDbError(errors[0]).kind, 'capacity_exceeded');
    assert.equal(await peakUsage(biz.businessId, target, 60), 1);
    const { rows } = await pool.query('select count(*)::int as n from public.appointments where id = any($1) and starts_at = $2', [[apptA, apptB], target]);
    assert.equal(rows[0].n, 1, 'exactly one appointment moved; the other kept its time');
  }
});

test('cancel and approve racing for the same time never overbook (15 rounds)', async () => {
  const biz = await freshBusiness('mobile');
  for (let round = 0; round < 15; round += 1) {
    const start = await atLocal(pool, 3 + round, '12:00');
    const first = await insertRequest(pool, biz.businessId, start, 120);
    const second = await insertRequest(pool, biz.businessId, start, 120);
    const { rows: [{ id: appt }] } = await asOwner(pool, biz.userId, 'select public.approve_request($1) as id', [first.id]);
    const [cancel, approve] = await Promise.allSettled([
      asOwner(pool, biz.userId, 'select public.cancel_appointment($1)', [appt]),
      asOwner(pool, biz.userId, 'select public.approve_request($1)', [second.id]),
    ]);
    assert.equal(cancel.status, 'fulfilled');
    if (approve.status === 'rejected') assert.equal(classifyDbError(approve.reason).kind, 'capacity_exceeded');
    assert.ok((await peakUsage(biz.businessId, start, 120)) <= 1, 'never more than capacity');
  }
});
