// Cross-business access and function exposure through the real Supabase Data API
// (PostgREST + Auth), using real user sessions and the local publishable/secret keys.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminPool, createOwnerUser, createBusiness, atLocal, insertRequest, cleanup, settle,
  supabaseAnon, supabaseSecret,
} from './support.js';

const pool = adminPool(10);
const businesses = [];
let ownerA, ownerB, bizA, bizB, requestA, requestA2, customerA;

before(async () => {
  ownerA = await createOwnerUser('api-a');
  ownerB = await createOwnerUser('api-b');
  bizA = await createBusiness(pool, ownerA.userId, { mode: 'mobile' });
  bizB = await createBusiness(pool, ownerB.userId, { mode: 'shop', capacity: 2 });
  businesses.push(bizA.businessId, bizB.businessId);
  requestA = await insertRequest(pool, bizA.businessId, await atLocal(pool, 2, '10:00'));
  requestA2 = await insertRequest(pool, bizA.businessId, await atLocal(pool, 2, '15:00'));
  const { data, error } = await ownerA.client.rpc('approve_request', { p_request_id: requestA.id });
  assert.equal(error, null);
  const { rows } = await pool.query('select customer_id from public.appointments where id = $1', [data]);
  customerA = rows[0].customer_id;
});

after(async () => {
  await cleanup(pool, businesses);
  await pool.end();
});

const tables = [
  'businesses', 'memberships', 'booking_settings', 'availability_rules', 'schedule_resources',
  'vehicle_size_classes', 'services', 'customers', 'vehicles', 'booking_requests', 'booking_request_items',
  'appointments', 'appointment_items', 'schedule_blocks', 'activity_events',
];

test('owner A can read their own business data through the Data API', async () => {
  for (const table of ['customers', 'appointments', 'schedule_blocks', 'booking_requests']) {
    const { data, error } = await ownerA.client.from(table).select('*').eq('business_id', bizA.businessId);
    assert.equal(error, null, `${table}: ${error?.message}`);
    assert.ok(data.length > 0, `${table} returns A's rows`);
  }
});

test('owner B sees none of Business A\'s rows in any table', async () => {
  for (const table of tables) {
    const key = table === 'businesses' ? 'id' : 'business_id';
    const { data, error } = await ownerB.client.from(table).select('*').eq(key, bizA.businessId);
    assert.equal(error, null, `${table}: ${error?.message}`);
    assert.deepEqual(data, [], `${table} leaks nothing`);
  }
});

test('owner B cannot insert, update or delete Business A\'s rows', async () => {
  const insert = await ownerB.client.from('customers')
    .insert({ business_id: bizA.businessId, first_name: 'Intruder', phone_e164: '+15125550199' });
  assert.equal(insert.error?.code, '42501');

  const update = await ownerB.client.from('customers').update({ notes: 'pwned' }).eq('id', customerA).select();
  assert.equal(update.error, null);
  assert.deepEqual(update.data, [], 'update matched no rows');

  const del = await ownerB.client.from('customers').delete().eq('id', customerA).select();
  assert.equal(del.error, null);
  assert.deepEqual(del.data, [], 'delete matched no rows');

  const { rows } = await pool.query('select notes from public.customers where id = $1', [customerA]);
  assert.equal(rows[0].notes, null, 'A\'s customer is untouched');

  const crossLink = await ownerB.client.from('vehicles')
    .insert({ business_id: bizB.businessId, customer_id: customerA, make: 'Honda', model: 'Civic' });
  assert.equal(crossLink.error?.code, '23503', 'cannot attach a vehicle to A\'s customer');
});

test('owner B cannot run workflow functions on Business A\'s records', async () => {
  for (const [fn, args] of [
    ['approve_request', { p_request_id: requestA2.id }],
    ['place_hold', { p_request_id: requestA2.id, p_hours: 24 }],
    ['decline_request', { p_request_id: requestA2.id }],
  ]) {
    const { error } = await ownerB.client.rpc(fn, args);
    assert.equal(error?.code, 'DH003', `${fn}: ${error?.message}`);
  }
});

test('owners cannot write schedule, appointment or request tables directly (D-24)', async () => {
  const appt = await ownerA.client.from('appointments').update({ status: 'cancelled' }).eq('business_id', bizA.businessId);
  assert.equal(appt.error?.code, '42501');
  const blocks = await ownerA.client.from('schedule_blocks').delete().eq('business_id', bizA.businessId);
  assert.equal(blocks.error?.code, '42501');
  const cap = await ownerA.client.from('schedule_resources').update({ capacity: 20 }).eq('business_id', bizA.businessId);
  assert.equal(cap.error?.code, '42501');
  const status = await ownerA.client.from('businesses').update({ account_status: 'active' }).eq('id', bizA.businessId);
  assert.equal(status.error?.code, '42501');
});

test('anonymous Data API callers (publishable key) get nothing', async () => {
  const anon = supabaseAnon();
  for (const table of tables) {
    const { error } = await anon.from(table).select('*').limit(1);
    assert.equal(error?.code, '42501', `${table}: ${error?.message}`);
  }
  const { error } = await anon.rpc('approve_request', { p_request_id: requestA2.id });
  assert.equal(error?.code, '42501');
});

test('internal and public-booking functions are not reachable through the Data API', async () => {
  const unexposed = await ownerA.client.schema('app').rpc('expire_stale');
  assert.ok(unexposed.error, 'app schema is not exposed');
  const publicApi = await supabaseAnon().schema('public_api').rpc('get_booking_page', { p_slug: bizA.slug });
  assert.ok(publicApi.error, 'public_api schema is not exposed');
  const missing = await ownerA.client.rpc('lock_resource', { p_resource_id: requestA.id });
  assert.equal(missing.error?.code, 'PGRST202', 'internal helpers do not exist in the exposed schema');
});

test('a leaked secret key still cannot read application tables through the Data API', async () => {
  const secret = supabaseSecret();
  const { error } = await secret.from('customers').select('*').limit(1);
  assert.equal(error?.code, '42501', 'service_role holds no table grants (D-22)');
});

test('parallel Data API approvals respect capacity (real PostgREST path)', async () => {
  const start = await atLocal(pool, 3, '10:00');
  const reqs = [];
  for (let i = 0; i < 8; i += 1) reqs.push(await insertRequest(pool, bizB.businessId, start));
  const calls = reqs.map((r) => ownerB.client.rpc('approve_request', { p_request_id: r.id }).then((res) => {
    if (res.error) throw res.error;
    return res.data;
  }));
  const { ok, errors } = await settle(calls);
  assert.equal(ok.length, 2, 'capacity 2');
  assert.ok(errors.every((e) => ['DH001', '40001', '40P01'].includes(e.code)), errors.map((e) => e.code).join(','));
});
