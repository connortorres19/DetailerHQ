import 'server-only';
import { z } from 'zod';
import { FOUNDING_TOTAL, TRIAL_DAYS } from '@/domain/billing';
import { env } from '@/lib/env';

// Server-only billing configuration (Phase 8). Nothing here reaches browser code (test:bundle).
//   STRIPE_SECRET_KEY       sk_test_… or (preferred) a restricted rk_test_… key. LIVE KEYS ARE REFUSED.
//   STRIPE_WEBHOOK_SECRET   whsec_… (Stripe CLI `stripe listen`, or the dashboard endpoint)
//   STRIPE_PRICE_FOUNDING   price_… one-time $30.00 USD
//   STRIPE_PRICE_STANDARD   price_… recurring $30.00 USD / month
//   BILLING_DATABASE_URL    restricted billing_worker login (billing_api functions only)
//   STRIPE_MOCK_URL         local development and tests only: a local Stripe stand-in
//                           (scripts/dev-stripe-mock.mjs). Ignored on any non-localhost site.
const schema = z.object({
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_test_[A-Za-z0-9_]{10,}$/, 'must be a TEST-mode key (sk_test_… or rk_test_…)'),
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_[A-Za-z0-9_]{10,}$/, 'must start with whsec_'),
  STRIPE_PRICE_FOUNDING: z.string().regex(/^price_[A-Za-z0-9_]+$/, 'must be a Price ID (price_…)'),
  STRIPE_PRICE_STANDARD: z.string().regex(/^price_[A-Za-z0-9_]+$/, 'must be a Price ID (price_…)'),
  BILLING_DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/billing_worker[.:@]/, 'must connect as the billing_worker role'),
  STRIPE_MOCK_URL: z.url().optional(),
});
export type BillingConfig = z.infer<typeof schema> & { siteUrl: string; mock: URL | null };

export const FOUNDING_PRICE_CENTS = 3000;
export const STANDARD_PRICE_CENTS = 3000;
export { TRIAL_DAYS }; // Standard free trial (approved: 3 days) — defined once, in src/domain/billing.ts
export const FOUNDING_SPOTS = FOUNDING_TOTAL;

let cached: { config: BillingConfig | null; problem: string | null } | undefined;

function load() {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  // Test mode only in this phase: a live key turns billing off, whatever else is set.
  if (/^(sk|rk)_live_/.test(key)) return (cached = { config: null, problem: 'A live Stripe key is set. Billing runs in test mode only — use an sk_test_ or rk_test_ key.' });
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => String(i.path[0]));
    return (cached = { config: null, problem: `Billing isn’t set up on this server (${[...new Set(missing)].join(', ')}). See docs/PHASE8_BILLING.md.` });
  }
  const siteUrl = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(siteUrl);
  const mock = parsed.data.STRIPE_MOCK_URL && local ? new URL(parsed.data.STRIPE_MOCK_URL) : null;
  return (cached = { config: { ...parsed.data, siteUrl, mock }, problem: null });
}

/** Null when billing isn't configured (or a live key is set): the app works, billing is unavailable. */
export const billingConfig = () => load().config;
/** Why billing is unavailable, in plain language (never includes a key). */
export const billingProblem = () => load().problem;
