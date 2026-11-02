#!/usr/bin/env node
// Creates DetailerHQ's two products and prices in your Stripe SANDBOX / test mode — once.
//
//   npm run billing:setup-prices             # create if missing, print the Price IDs
//   npm run billing:setup-prices -- --write  # …and write STRIPE_PRICE_FOUNDING / STRIPE_PRICE_STANDARD to .env.local
//
// Safe to run again: each price has a fixed lookup key, so an existing one is found and reused —
// never duplicated. Uses STRIPE_SECRET_KEY from .env.local (test keys only; a live key is refused).
// Prints Price IDs only — never a key. Makes no other changes in Stripe.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import Stripe from 'stripe';

const args = process.argv.slice(2);
const envFile = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const get = (n) => process.env[n] ?? envFile.match(new RegExp(`^${n}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
const key = get('STRIPE_SECRET_KEY');
const fail = (m) => {
  console.error(`\n✗ ${m}\n`);
  process.exit(1);
};

if (!key) fail('STRIPE_SECRET_KEY is not set in .env.local. Add your Sandbox secret key (sk_test_…) first.');
if (/^(sk|rk)_live_/.test(key)) fail('That is a LIVE key. This script only works in Sandbox / test mode — use your sk_test_ key.');
if (!/^(sk|rk)_test_/.test(key)) fail('STRIPE_SECRET_KEY should start with sk_test_ (or rk_test_).');

// --mock: try the script against the local Stripe stand-in (npm run billing:mock) instead of Stripe.
const mockUrl = args.includes('--mock') ? new URL(get('STRIPE_MOCK_URL') || 'http://localhost:12111') : null;
const stripe = new Stripe(key, {
  maxNetworkRetries: 2,
  telemetry: false,
  ...(mockUrl ? { host: mockUrl.hostname, port: Number(mockUrl.port || 80), protocol: mockUrl.protocol.replace(':', '') } : {}),
});

const PLANS = [
  {
    env: 'STRIPE_PRICE_FOUNDING',
    lookup: 'detailerhq_founding_5_v1',
    product: { name: 'DetailerHQ Founding 5 — Lifetime', description: 'Lifetime access to DetailerHQ for the first five businesses. One-time payment; no recurring charges.' },
    price: { unit_amount: 3000, currency: 'usd', nickname: 'Founding 5 — $30 one-time' },
    check: (p) => p.type === 'one_time',
    describe: '$30.00 USD, one-time',
  },
  {
    env: 'STRIPE_PRICE_STANDARD',
    lookup: 'detailerhq_standard_monthly_v1',
    product: { name: 'DetailerHQ Standard', description: 'DetailerHQ for detailing businesses. $30/month after a 3-day free trial (card required).' },
    price: { unit_amount: 3000, currency: 'usd', nickname: 'Standard — $30 monthly', recurring: { interval: 'month', interval_count: 1 } },
    check: (p) => p.type === 'recurring' && p.recurring?.interval === 'month' && (p.recurring?.interval_count ?? 1) === 1,
    describe: '$30.00 USD, every month',
  },
];

console.log(`\nDetailerHQ prices — Stripe ${mockUrl ? 'stand-in (local, simulated)' : 'Sandbox / test mode'}\n`);
const ids = {};
try {
  const existing = await stripe.prices.list({ lookup_keys: PLANS.map((p) => p.lookup), limit: 10 });
  for (const plan of PLANS) {
    let price = existing.data.find((p) => p.lookup_key === plan.lookup);
    if (price) {
      console.log(`  ✓ ${plan.product.name}: already exists — reused (no duplicate created)`);
    } else {
      const product = await stripe.products.create(
        { ...plan.product, metadata: { app: 'detailerhq', plan: plan.lookup } },
        { idempotencyKey: `detailerhq-product-${plan.lookup}` },
      );
      price = await stripe.prices.create(
        { ...plan.price, product: product.id, lookup_key: plan.lookup, metadata: { app: 'detailerhq' } },
        { idempotencyKey: `detailerhq-price-${plan.lookup}` },
      );
      console.log(`  + ${plan.product.name}: created`);
    }
    if (price.livemode) fail(`${plan.product.name} is a LIVE price. Stopping — use your Sandbox / test key.`);
    if (!price.active || price.unit_amount !== 3000 || price.currency !== 'usd' || !plan.check(price))
      fail(`${plan.product.name} (${price.id}) exists but isn’t ${plan.describe}. Archive it in the dashboard and run this again.`);
    console.log(`      ${plan.env}=${price.id}   (${plan.describe})`);
    ids[plan.env] = price.id;
  }
} catch (e) {
  if (e?.type === 'StripePermissionError') fail('This key can’t create products/prices. Use the Sandbox secret key (sk_test_…), or give your restricted key Products and Prices write access.');
  if (e?.type === 'StripeAuthenticationError') fail('Stripe rejected the key. Copy the Sandbox secret key again (Developers → API keys).');
  if (e?.type === 'StripeConnectionError') fail('Couldn’t reach Stripe from this machine. Check your internet connection and try again.');
  fail(`Stripe error: ${e?.message ?? e}`);
}

if (args.includes('--write')) {
  let text = envFile;
  for (const [n, v] of Object.entries(ids)) {
    text = new RegExp(`^#? ?${n}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^#? ?${n}=.*$`, 'm'), `${n}=${v}`) : `${text.replace(/\n?$/, '\n')}${n}=${v}\n`;
  }
  writeFileSync('.env.local', text);
  console.log('\n  ✓ Wrote both Price IDs to .env.local (nothing else changed).');
} else {
  console.log('\n  Add the two lines above to .env.local (or run again with -- --write).');
}
console.log('  Next: npm run billing:check\n');
