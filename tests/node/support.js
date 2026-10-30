// Shared helpers for tests that need real connections: concurrency (several Postgres
// sessions at once), the Supabase Data API with real Auth users, and the booking_api login.
// Requires the local stack (`npm run db:start`). Uses only the CLI's local default keys.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

export const local = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
);

export const runId = randomBytes(3).toString('hex');
export const sha256 = (value) => createHash('sha256').update(value).digest();

export function adminPool(max = 20) {
  return new pg.Pool({ connectionString: local.DB_URL, max });
}

// Opens a session that behaves like a Data API request for `userId`: role `authenticated`
// plus JWT claims, inside an explicit transaction the caller commits or rolls back.
export async function ownerSession(pool, userId) {
  const client = await pool.connect();
  await client.query('begin');
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  await client.query('set local role authenticated');
  return client;
}

// Runs one owner operation in its own transaction (like one Data API call).
export async function asOwner(pool, userId, sql, params = []) {
  const client = await ownerSession(pool, userId);
  try {
    const result = await client.query(sql, params);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export function supabaseAnon() {
  return createClient(local.API_URL, local.PUBLISHABLE_KEY, { auth: { persistSession: false } });
}

export function supabaseSecret() {
  return createClient(local.API_URL, local.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

const createdUserIds = [];

// Creates a confirmed Auth user and returns { userId, client } where client carries the
// user's session JWT, exactly as a signed-in browser or server action would.
export async function createOwnerUser(label) {
  const email = `${label}-${runId}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `pw-${randomUUID()}`;
  const admin = supabaseSecret();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  createdUserIds.push(data.user.id);
  const client = supabaseAnon();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { userId: data.user.id, email, client };
}

// Published business with hours 06:00-22:00 every day, no minimum notice, and one
// bookable 120-minute service. Created through the owner's own create_business call.
export async function createBusiness(pool, userId, { mode = 'mobile', capacity = null, slug } = {}) {
  const s = slug ?? `biz-${runId}-${randomUUID().slice(0, 8)}`;
  const { rows } = await asOwner(
    pool,
    userId,
    "select public.create_business($1, $2, 'America/Chicago', $3, $4, '+15125550142') as id",
    [`Business ${s}`, s, mode, capacity],
  );
  const businessId = rows[0].id;
  await pool.query(
    `update public.businesses set published_at = now(), accepting_requests = true where id = $1;
     update public.booking_settings set min_notice_min = 0, horizon_days = 365 where business_id = $1;
     insert into public.availability_rules (business_id, weekday, start_time, end_time)
       select $1, d, '06:00', '22:00' from generate_series(0, 6) d;
     insert into public.services (business_id, name, price_type, base_price_cents, base_duration_min, is_bookable)
       values ($1, 'Full detail', 'fixed', 26000, 120, true);`.replaceAll('$1', `'${businessId}'`),
  );
  return { businessId, slug: s };
}

// Local wall-clock time in America/Chicago, `days` from today.
export async function atLocal(pool, days, time) {
  const { rows } = await pool.query(
    "select (((now() at time zone 'America/Chicago')::date + $1::int + $2::time) at time zone 'America/Chicago') as t",
    [days, time],
  );
  return rows[0].t;
}

// Inserts a pending request directly (fixture), returning { id, token }.
export async function insertRequest(pool, businessId, start, minutes = 120) {
  const token = randomBytes(32);
  const phone = `+1512555${String(Math.floor(1000 + Math.random() * 8999))}`;
  const { rows } = await pool.query(
    `insert into public.booking_requests (business_id, token_hash, idempotency_key, requested_start, requested_end,
       location_type, service_address_line1, contact_first_name, contact_phone_e164, vehicle_make, vehicle_model,
       vehicle_size_class_id, consent_at, estimated_total_cents, estimated_duration_min)
     values ($1, $2, gen_random_uuid(), $3, $3::timestamptz + make_interval(mins => $4), 'mobile', '1234 Oak St',
       'Jordan', $5, 'Tesla', 'Model Y',
       (select id from public.vehicle_size_classes where business_id = $1 order by sort_order limit 1),
       now(), 26000, $4)
     returning id`,
    [businessId, sha256(token), start, minutes, phone],
  );
  return { id: rows[0].id, token };
}

export async function cleanup(pool, businessIds) {
  for (const id of businessIds.splice(0)) {
    await pool.query('select app.delete_business_data($1)', [id]);
  }
  const admin = supabaseSecret();
  for (const id of createdUserIds.splice(0)) {
    await admin.auth.admin.deleteUser(id);
  }
}

// Settles an array of promises and splits fulfilled values from rejection error codes.
export async function settle(promises) {
  const results = await Promise.allSettled(promises);
  return {
    ok: results.filter((r) => r.status === 'fulfilled').map((r) => r.value),
    errors: results.filter((r) => r.status === 'rejected').map((r) => r.reason),
  };
}
