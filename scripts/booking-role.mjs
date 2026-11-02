#!/usr/bin/env node
// Re-enables the local booking_api login with the password already in .env.local. A database
// reset recreates the role without a login, which would break the public booking pages of a
// running dev server; `npm run db:reset` calls this afterwards. Writes no files.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

const env = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const url = env.match(/^BOOKING_DATABASE_URL=(.+)$/m)?.[1];
if (!url) {
  console.log('No BOOKING_DATABASE_URL in .env.local — run `npm run env:local` to set up the public booking pages.');
  process.exit(0);
}
const password = decodeURIComponent(new URL(url).password);
const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
const admin = new pg.Client({ connectionString: status.DB_URL });
await admin.connect();
await admin.query(`alter role booking_api with login password '${password.replaceAll("'", "''")}'`);
// Phase 7: the email worker's login and the scheduler's settings (a reset drops both).
const workerUrl = env.match(/^EMAIL_WORKER_DATABASE_URL=(.+)$/m)?.[1];
const workerSecret = env.match(/^EMAIL_WORKER_SECRET=(.+)$/m)?.[1];
if (workerUrl && workerSecret) {
  const role = await admin.query("select 1 from pg_roles where rolname = 'email_worker'");
  if (role.rowCount) {
    await admin.query(`alter role email_worker with login password '${decodeURIComponent(new URL(workerUrl).password).replaceAll("'", "''")}'`);
    await admin.query('select app.configure_email_worker($1, $2)', ['http://host.docker.internal:3000/api/email/worker', workerSecret]);
  }
}
// Phase 8: the billing worker's login.
const billingUrl = env.match(/^BILLING_DATABASE_URL=(.+)$/m)?.[1];
if (billingUrl && (await admin.query("select 1 from pg_roles where rolname = 'billing_worker'")).rowCount)
  await admin.query(`alter role billing_worker with login password '${decodeURIComponent(new URL(billingUrl).password).replaceAll("'", "''")}'`);
await admin.end();
console.log('booking_api (and email_worker, billing_worker) logins re-enabled for the local database');
