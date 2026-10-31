// The restricted public booking path as the server will use it: the booking_api login
// role connecting through the local Supavisor pooler (transaction mode) and directly.
// A random password is set for the test and login is disabled again afterwards.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  adminPool, createOwnerUser, createBusiness, atLocal, cleanup, sha256, local, enableBookingApi,
} from './support.js';

const POOLER_PORT = 54329; // supabase/config.toml [db.pooler]
const POOLER_TENANT = 'pooler-dev'; // local Supavisor tenant; hosted projects use the project ref
const admin = adminPool(5);
const businesses = [];
let password, role;
let viaPooler, direct, biz, sizeClassId, serviceId;

before(async () => {
  role = await enableBookingApi(admin);
  ({ password } = role);
  viaPooler = new pg.Pool({
    host: '127.0.0.1', port: POOLER_PORT, database: 'postgres',
    user: `booking_api.${POOLER_TENANT}`, password, max: 2,
  });
  // Supavisor caches role secrets; right after a password change the first login can be
  // rejected until it refreshes (observed locally). Warm up with one retry.
  for (let attempt = 1; ; attempt += 1) {
    try { await viaPooler.query('select 1'); break; } catch (error) {
      if (error.code !== '28P01' || attempt >= 3) throw error;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  direct = new pg.Pool({
    connectionString: local.DB_URL.replace('postgres:postgres@', `booking_api:${password}@`), max: 2,
  });
  const owner = await createOwnerUser('booking-api');
  biz = await createBusiness(admin, owner.userId, { mode: 'mobile' });
  businesses.push(biz.businessId);
  ({ rows: [{ id: sizeClassId }] } = await admin.query(
    'select id from public.vehicle_size_classes where business_id = $1 order by sort_order limit 1', [biz.businessId]));
  ({ rows: [{ id: serviceId }] } = await admin.query(
    "select id from public.services where business_id = $1 and name = 'Full detail'", [biz.businessId]));
});

after(async () => {
  await viaPooler?.end();
  await direct?.end();
  await role.restore();
  await cleanup(admin, businesses);
  await admin.end();
});

for (const [label, getPool] of [['through the pooler', () => viaPooler], ['direct', () => direct]]) {
  test(`booking_api ${label}: identity and booking page`, async () => {
    const { rows: [{ who }] } = await getPool().query('select current_user as who');
    assert.equal(who, 'booking_api');
    const { rows: [{ page }] } = await getPool().query('select public_api.get_booking_page($1) as page', [biz.slug]);
    assert.equal(page.name, `Business ${biz.slug}`);
    assert.ok(!JSON.stringify(page).includes('@'), 'no email addresses in the page payload');
  });

  test(`booking_api ${label}: submit a request, then read its masked status`, async () => {
    const token = randomBytes(32);
    const payload = {
      service_ids: [serviceId], vehicle_size_class_id: sizeClassId,
      requested_start: await atLocal(admin, 3 + (label === 'direct' ? 1 : 0), '10:00'),
      location_type: 'mobile', service_address_line1: '1234 Oak St', contact_first_name: 'Jordan',
      contact_phone_e164: '+15125550142', contact_email: 'jordan@example.com', vehicle_make: 'Tesla',
      vehicle_model: 'Model Y', consent: true,
    };
    const ip = sha256(`ip-${label}`);
    const { rows: [{ result }] } = await getPool().query(
      'select public_api.submit_booking_request($1, $2, $3, $4, $5) as result',
      [biz.slug, payload, randomUUID(), sha256(token), ip],
    );
    assert.equal(result.status, 'pending');
    const { rows: [{ status }] } = await getPool().query(
      'select public_api.get_request_status($1, $2) as status', [sha256(token), ip]);
    assert.equal(status.contact.phone, 'ending 0142');
    assert.equal(status.contact.email, 'j•••@example.com');
  });

  test(`booking_api ${label}: no table access, no owner or internal functions, no role switching`, async () => {
    for (const sql of [
      'select * from public.customers limit 1',
      'select * from public.booking_requests limit 1',
      'select * from public.schedule_blocks limit 1',
      "select public.approve_request('00000000-0000-0000-0000-000000000000')",
      'select app.expire_stale()',
      'set role postgres',
      'set role authenticated',
    ]) {
      await assert.rejects(getPool().query(sql), (e) => e.code === '42501', sql);
    }
  });
}
