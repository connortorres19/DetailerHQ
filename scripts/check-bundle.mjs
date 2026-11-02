#!/usr/bin/env node
// Scans the production build's browser assets (PRODUCT_PLAN §13.4: "bundle scan finds no
// service-role key, booking_api credential or server-only variable"). Run after `next build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '.next/static';
const forbidden = [
  [/sb_secret_[A-Za-z0-9_-]{8,}/, 'Supabase secret key'],
  [/SUPABASE_SECRET|SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE/, 'secret key variable name'],
  [/"role"\s*:\s*"service_role"|service_role/, 'service_role reference'],
  [/booking_api/, 'booking_api database role'],
  [/postgres(ql)?:\/\/[^"'\s]+/, 'database connection string'],
  [/Could not load customers|Could not load business|\[workflow:/, 'server-only data module'],
  // Phase 7 email: the worker role, server-only variables and secret material.
  [/email_worker|EMAIL_WORKER_SECRET|EMAIL_ENCRYPTION_KEY|EMAIL_WORKER_DATABASE_URL|GOOGLE_CLIENT_SECRET|MICROSOFT_CLIENT_SECRET/, 'email server-only variable or role'],
  // Phase 8 billing: Stripe secret material and the billing worker role (the app has no publishable key at all).
  [/\b(sk|rk)_(test|live)_[A-Za-z0-9]{8,}/, 'Stripe secret key'],
  [/\bwhsec_[A-Za-z0-9]{8,}/, 'Stripe webhook signing secret'],
  [/billing_worker|BILLING_DATABASE_URL|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/, 'billing server-only variable or role'],
  [/refresh_token|nodemailer|email_api\./, 'email server-only code'],
];
// The actual secret values from this machine's .env.local must never appear either.
try {
  const env = readFileSync('.env.local', 'utf8');
  for (const name of ['EMAIL_ENCRYPTION_KEY', 'EMAIL_WORKER_SECRET', 'BOOKING_HASH_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
    const value = env.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1];
    if (value && value.length >= 20) forbidden.push([new RegExp(value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')), `${name} value`]);
  }
} catch {
  /* no .env.local (CI): name patterns still apply */
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(js|css|html|json|map)$/.test(name)) files.push(path);
  }
})(ROOT);

let problems = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const [pattern, label] of forbidden) {
    const match = text.match(pattern);
    if (match) {
      problems += 1;
      console.error(`✗ ${label} in ${file}: ${match[0].slice(0, 40)}`);
    }
  }
}
if (problems) process.exit(1);
console.log(`✓ ${files.length} browser files scanned: no secret keys, database roles or server-only code.`);
