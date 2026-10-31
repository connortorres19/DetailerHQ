// Cross-business access and function exposure through the real Supabase Data API
// (PostgREST + Auth), using real user sessions and the local publishable/secret keys.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
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

test('Phase 5: quotes are written only through functions; leads and quotes stay inside their business (real Data API)', async () => {
  const day = (await pool.query(`select ((now() at time zone 'America/Chicago')::date + 14)::text as d`)).rows[0].d;
  const { data: quoteId, error } = await ownerA.client.rpc('save_quote', {
    p_quote_id: null, p_quote: { valid_until: day, internal_notes: 'SECRET' }, p_customer_id: null,
    p_customer: { first_name: 'Api', phone_e164: '+15125550777' }, p_vehicle_id: null, p_vehicle: { make: 'Mazda', model: 'CX-5' },
    p_items: [{ name: 'Full detail', quantity: 1, price_cents: 20000 }],
  });
  assert.equal(error, null, error?.message);
  // Owners can't choose a link token: the old (nonce, hash) form is gone; the database makes the token.
  const chosen = await ownerA.client.rpc('send_quote', { p_quote_id: quoteId, p_token_nonce: randomUUID(), p_token_hash: `\\x${'00'.repeat(32)}` });
  assert.equal(chosen.error?.code, 'PGRST202', 'the caller-chosen-token form does not exist');
  const key = createHash('sha256').update('api-link-key').digest();
  const sent = await ownerA.client.rpc('send_quote', { p_quote_id: quoteId, p_link_key: `\\x${key.toString('hex')}` });
  assert.equal(sent.error, null, sent.error?.message);
  const token = createHmac('sha256', key).update(`quote-link:v2:${sent.data}`).digest('base64url');
  const hash = `\\x${createHash('sha256').update(token).digest('hex')}`;
  const { rows: [stored] } = await pool.query('select encode(token_hash, \'hex\') as h, link_version from public.quotes where id = $1', [quoteId]);
  assert.deepEqual(stored, { h: hash.slice(2), link_version: 2 }, 'stored hash = sha256 of the derived token');
  const { data: lead } = await ownerA.client.from('leads')
    .insert({ business_id: bizA.businessId, source: 'phone', contact_first_name: 'Api', contact_phone_e164: '+15125550777' }).select('id').single();

  // The owner can't fake the customer's answer or rewrite the frozen quote.
  for (const [what, res] of [
    ['accept', await ownerA.client.from('quotes').update({ status: 'accepted' }).eq('id', quoteId)],
    ['reprice', await ownerA.client.from('quotes').update({ subtotal_cents: 1 }).eq('id', quoteId)],
    ['insert', await ownerA.client.from('quotes').insert({ business_id: bizA.businessId })],
    ['delete', await ownerA.client.from('quotes').delete().eq('id', quoteId)],
    ['add item', await ownerA.client.from('quote_items').insert({ business_id: bizA.businessId, quote_id: quoteId, name: 'X', quantity: 1, price_cents: 1 })],
    ['edit item', await ownerA.client.from('quote_items').update({ price_cents: 1 }).eq('quote_id', quoteId)],
    ['forge history', await ownerA.client.from('activity_events').insert({ business_id: bizA.businessId, quote_id: quoteId, kind: 'quote_status_changed', to_status: 'accepted', actor_type: 'customer' })],
  ]) assert.equal(res.error?.code, '42501', `${what}: ${res.error?.message}`);
  assert.equal((await ownerA.client.rpc('accept_quote', { p_token_hash: hash, p_ip_hash: hash })).error?.code, 'PGRST202', 'the customer API is not in the exposed schema');
  assert.ok((await ownerA.client.schema('app').rpc('quote_action_core', { p_action: 'accept', p_token_hash: hash, p_ip_hash: hash })).error, 'app schema not exposed');
  const notes = await ownerA.client.from('quotes').update({ internal_notes: 'still private' }).eq('id', quoteId);
  assert.equal(notes.error, null, 'private notes stay editable');
  const { rows: [q] } = await pool.query('select status, total_cents from public.quotes where id = $1', [quoteId]);
  assert.deepEqual(q, { status: 'sent', total_cents: 20000 });

  // B: nothing of A's is visible or changeable.
  for (const table of ['leads', 'quotes', 'quote_items']) {
    const { data, error: e } = await ownerB.client.from(table).select('*').eq('business_id', bizA.businessId);
    assert.equal(e, null);
    assert.deepEqual(data, [], `${table} leaks nothing`);
  }
  const bUpdate = await ownerB.client.from('leads').update({ notes: 'B' }).eq('id', lead.id).select();
  assert.deepEqual(bUpdate.data, [], 'B updates nothing');
  assert.equal((await ownerB.client.rpc('withdraw_quote', { p_quote_id: quoteId })).error?.code, 'DH003');
  assert.equal((await ownerB.client.rpc('log_lead_activity', { p_lead_id: lead.id, p_kind: 'note', p_note: 'x', p_channel: null })).error?.code, 'DH003');
  // Anonymous callers get nothing.
  for (const table of ['leads', 'quotes', 'quote_items']) assert.equal((await supabaseAnon().from(table).select('*').limit(1)).error?.code, '42501', table);
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
