#!/usr/bin/env node
// Checks the Stripe TEST-mode billing setup (Phase 8) — read-only, never prints a secret.
//
//   npm run billing:check
//
// Reads .env.local (or the environment), then asks Stripe (or the local stand-in, if STRIPE_MOCK_URL
// is set) about the two Price IDs, and connects to the database as billing_worker.
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

const envFile = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const get = (n) => process.env[n] ?? envFile.match(new RegExp(`^${n}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
let problems = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const bad = (m, fix) => {
  problems += 1;
  console.log(`  ✗ ${m}${fix ? `\n      → ${fix}` : ''}`);
};

console.log('\nDetailerHQ billing (Stripe TEST mode)\n');
const key = get('STRIPE_SECRET_KEY');
const whsec = get('STRIPE_WEBHOOK_SECRET');
const founding = get('STRIPE_PRICE_FOUNDING');
const standard = get('STRIPE_PRICE_STANDARD');
const mock = get('STRIPE_MOCK_URL');

if (!key) bad('STRIPE_SECRET_KEY is not set', 'Add your test key (Developers → API keys) to .env.local');
else if (/^(sk|rk)_live_/.test(key)) bad('STRIPE_SECRET_KEY is a LIVE key — refused', 'Phase 8 runs in test mode only. Use an sk_test_ or rk_test_ key.');
else if (!/^(sk|rk)_test_/.test(key)) bad('STRIPE_SECRET_KEY doesn’t look like a Stripe test key', 'It starts with sk_test_ or rk_test_.');
else ok(`STRIPE_SECRET_KEY is a ${key.startsWith('rk_') ? 'restricted ' : ''}test key (${key.length} characters, not shown)`);
if (key.startsWith('sk_test_')) warn('Consider a restricted key (rk_test_…) with only the permissions in docs/PHASE8_BILLING.md.');
if (!whsec) bad('STRIPE_WEBHOOK_SECRET is not set', 'Run `stripe listen --forward-to localhost:3000/api/billing/webhook` and copy the whsec_… it prints.');
else if (!/^whsec_/.test(whsec)) bad('STRIPE_WEBHOOK_SECRET should start with whsec_');
else ok('STRIPE_WEBHOOK_SECRET is set (not shown)');
for (const [n, v] of [['STRIPE_PRICE_FOUNDING', founding], ['STRIPE_PRICE_STANDARD', standard]])
  if (!/^price_/.test(v)) bad(`${n} ${v ? 'should start with price_' : 'is not set'}`, 'Copy the Price ID (price_…) from the product in your Stripe dashboard.');
const pk = get('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
if (pk && !/^pk_test_/.test(pk)) bad('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not a test key (pk_test_…)');
else if (pk) ok('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is a test key (not used by Phase 8 — Checkout is hosted by Stripe)');
const site = (get('NEXT_PUBLIC_SITE_URL') || 'http://localhost:3000').replace(/\/$/, '');
if (mock) {
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(site)) warn(`STRIPE_MOCK_URL is set: the app uses the local Stripe stand-in (${mock}), not Stripe. Remove it to use your real Stripe test account.`);
  else bad('STRIPE_MOCK_URL is set on a non-localhost site', 'It is ignored there; remove it.');
}

// Prices, checked with Stripe itself.
const api = mock || 'https://api.stripe.com';
async function price(id) {
  const res = await fetch(`${api}/v1/prices/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
if (key && /^(sk|rk)_test_/.test(key) && /^price_/.test(founding) && /^price_/.test(standard)) {
  console.log(`\nPrices (asked ${mock ? 'the local stand-in' : 'Stripe'}):`);
  try {
    const f = await price(founding);
    const s = await price(standard);
    if (f.status === 401 || s.status === 401) bad('Stripe rejected the key', 'Copy the test secret key again (and check a restricted key can read Prices).');
    for (const [name, r, want] of [['Founding 5', f, 'one_time'], ['Standard', s, 'recurring']]) {
      if (r.status !== 200) { if (r.status !== 401) bad(`${name}: price not found (${r.status})`, 'Check the Price ID and that it was created in TEST mode / your Sandbox.'); continue; }
      const p = r.body;
      const issues = [];
      if (p.livemode) issues.push('is a LIVE price');
      if (p.unit_amount !== 3000) issues.push(`amount is ${p.unit_amount / 100}, not 30.00`);
      if (p.currency !== 'usd') issues.push(`currency is ${p.currency}, not usd`);
      if (p.type !== want) issues.push(`is ${p.type}, not ${want === 'one_time' ? 'one-time' : 'recurring'}`);
      if (want === 'recurring' && (p.recurring?.interval !== 'month' || (p.recurring?.interval_count ?? 1) !== 1)) issues.push('does not bill every 1 month');
      if (!p.active) issues.push('is archived');
      if (issues.length) bad(`${name} price ${issues.join(', ')}`, `Create a ${want === 'one_time' ? 'one-time' : 'monthly recurring'} $30.00 USD price and use its ID.`);
      else ok(`${name}: $30.00 USD ${want === 'one_time' ? 'one-time' : 'per month'}, test mode`);
    }
  } catch {
    warn('Couldn’t reach Stripe from this machine (offline or blocked). Run again when online.');
  }
  if (!mock) {
    try {
      const res = await fetch('https://api.stripe.com/v1/billing_portal/configurations?is_default=true&limit=1', { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
      if (res.status === 200 && ((await res.json()).data ?? []).length) ok('Customer Portal is configured');
      else if (res.status === 200) bad('Customer Portal isn’t configured yet', 'Stripe dashboard → Settings → Billing → Customer portal → Save (see docs/PHASE8_BILLING.md).');
      else warn('Couldn’t check the Customer Portal settings with this key (a restricted key may not allow it) — check them in the dashboard.');
    } catch {
      /* offline: already reported */
    }
  }
}

// Database: the restricted billing login.
console.log('\nDatabase:');
const dbUrl = get('BILLING_DATABASE_URL');
if (!dbUrl) bad('BILLING_DATABASE_URL is not set', 'Run: npm run env:local');
else {
  const c = new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
  try {
    await c.connect();
    await c.query("select * from billing_api.stale_founding_reservations()");
    ok('billing_worker can log in and reach billing_api');
  } catch (e) {
    bad(`billing_worker login failed (${e.code ?? 'error'})`, 'Run: npx supabase migration up, then npm run env:local (or node scripts/booking-role.mjs).');
  } finally {
    await c.end().catch(() => undefined);
  }
}

console.log(problems ? `\n${problems} problem(s) to fix. Then run: npm run billing:check` : '\nBilling setup looks right (test mode). Next: npm run dev, and in another terminal the stripe listen command from docs/PHASE8_BILLING.md.');
process.exit(problems ? 1 : 0);
