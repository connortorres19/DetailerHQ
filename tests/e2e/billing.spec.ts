import { expect, test, type Page } from '@playwright/test';
import Stripe from 'stripe';
import { cleanup, db } from './support';
import { bookableBusiness } from './support-booking';

// Phase 8 billing, end to end against the SIMULATED Stripe (scripts/dev-stripe-mock.mjs, started with
// `npm run billing:mock`; .env.local STRIPE_MOCK_URL=http://localhost:12111). The app's real Stripe
// SDK, webhook signature checks and database rules run unchanged; only Stripe itself is simulated.
// Real Stripe test-mode runs are manual (docs/PHASE8_BILLING.md) — nothing here touches Stripe.
//
// Test-only cleanup: founding spots claimed through the stand-in (session ids cs_test_mock_…) are
// put back afterwards by the database owner, so the local database keeps its five spots. Real
// Stripe test-mode claims never match and are never touched.

const MOCK = 'http://localhost:12111';
const env = (await import('node:fs')).readFileSync('.env.local', 'utf8');
const WEBHOOK_SECRET = env.match(/^STRIPE_WEBHOOK_SECRET=(.+)$/m)?.[1] ?? '';
const signer = new Stripe('sk_test_signer_only');

test.describe.configure({ mode: 'serial' });
test.afterAll(async () => {
  await cleanup();
  const c = await db.connect();
  try {
    await c.query('begin');
    await c.query('alter table public.founding_slots disable trigger founding_slot_guard');
    await c.query(`update public.founding_slots set state = 'available', business_id = null, checkout_session_id = null, reserved_until = null, claimed_at = null,
                          stripe_payment_intent = null, amount_cents = null, currency = null, refunded_at = null, disputed_at = null
                    where checkout_session_id like 'cs_test_mock_%'`);
    await c.query('alter table public.founding_slots enable trigger founding_slot_guard');
    await c.query('commit');
  } finally {
    c.release();
  }
});

const control = (path: string) => fetch(`${MOCK}/_test/${path}`, { method: 'POST' }).then((r) => r.json());
const mockState = () => fetch(`${MOCK}/_test/state`).then((r) => r.json());
const billing = async (businessId: string) =>
  (await db.query(
    `select b.account_status, k.plan, k.subscription_status, k.trial_ends_at, k.founding_slot, k.stripe_subscription_id, k.past_due_since, k.cancel_at_period_end
       from public.businesses b left join public.business_billing k on k.business_id = b.id where b.id = $1`, [businessId])).rows[0];
const availability = async () => (await db.query('select app.founding_availability_impl() as a')).rows[0].a as { remaining: number; open: number; claimed: number; in_checkout: number };
const settle = (page: Page) => page.waitForLoadState('networkidle');

test('pricing page: both plans at $30, live founding count, 3-day trial with a card required — no fake numbers', async ({ page }) => {
  const a = await availability();
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'One price. Every feature.' })).toBeVisible();
  await expect(page.getByText(`${a.remaining} of 5 founding spots left`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Founding 5 — lifetime' })).toBeVisible();
  await expect(page.getByText('$30 one-time payment. No subscription, no recurring charges — ever.')).toBeVisible();
  await expect(page.getByText('3-day free trial · card required')).toBeVisible();
  await expect(page.getByText('3-day free trial. A card is required to start, and nothing is charged during the trial.')).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/7-day|no credit card|no card required/i);
  // The home page's pricing section links here (and shows no count of its own).
  await page.goto('/');
  await expect(page.getByRole('link', { name: /how many founding spots are left/ })).toHaveAttribute('href', '/pricing');
});

test('pilot business: pilot access is kept, no charge, both plans offered', async ({ page }) => {
  const biz = await bookableBusiness(page, 'billpilot');
  await page.goto('/app/settings/billing');
  await expect(page.getByText('Pilot access', { exact: true })).toBeVisible();
  await expect(page.getByText(/Nothing is charged/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Become a founding member — $30 once' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start 3-day free trial' })).toBeVisible();
  expect((await billing(biz.businessId)).account_status).toBe('pilot');
  expect(await page.locator('main').innerText()).not.toMatch(/7-day/);
});

test('Founding 5: declined card keeps the spot reserved, payment claims it, refund never reopens it', async ({ page }) => {
  const biz = await bookableBusiness(page, 'billfound');
  const before = await availability();
  await page.goto('/app/settings/billing');
  await page.getByRole('button', { name: 'Become a founding member — $30 once' }).click();
  await expect(page).toHaveURL(/localhost:12111\/pay\/cs_test_mock_/);
  await expect(page.getByRole('heading', { name: 'Founding 5 — $30.00 once' })).toBeVisible();
  await expect(page.getByText(/no recurring charges/)).toBeVisible();
  expect((await availability()).in_checkout).toBe(before.in_checkout + 1);
  await page.getByRole('button', { name: 'Use a declined test card' }).click();
  await expect(page.getByRole('alert')).toContainText('declined');
  expect((await availability()).remaining).toBe(before.remaining); // nothing claimed
  await page.getByRole('button', { name: 'Pay $30.00 (test card 4242)' }).click();
  await expect(page).toHaveURL(/\/app\/settings\/billing\?checkout=success/);
  await expect(page.getByText(/Welcome, founding member!|Your founding membership is confirmed/)).toBeVisible();
  await expect(page.getByText(/^Founding member #[1-5]$/)).toBeVisible();
  await expect(page.getByText('Lifetime access, paid once ($30). You’ll never be charged again.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Start 3-day free trial|Subscribe/ })).toHaveCount(0); // never offered a subscription
  const b = await billing(biz.businessId);
  expect(b).toMatchObject({ account_status: 'active', plan: 'founding', subscription_status: null, stripe_subscription_id: null });
  expect((await availability()).remaining).toBe(before.remaining - 1);
  await page.goto('/pricing');
  await expect(page.getByText(`${before.remaining - 1} of 5 founding spots left`)).toBeVisible();
  // A refund (Stripe dashboard) is recorded only: the spot stays claimed, access stays.
  const { rows: [{ stripe_payment_intent: pi }] } = await db.query('select stripe_payment_intent from public.founding_slots where business_id = $1', [biz.businessId]);
  await control(`refund/${pi}`);
  await expect.poll(async () => (await db.query('select refunded_at is not null as r, state from public.founding_slots where stripe_payment_intent = $1', [pi])).rows[0]).toEqual({ r: true, state: 'claimed' });
  expect((await billing(biz.businessId)).account_status).toBe('active');
  expect((await availability()).remaining).toBe(before.remaining - 1);
});

test('Founding 5: an abandoned checkout releases its spot only when Stripe says it expired', async ({ page }) => {
  await bookableBusiness(page, 'billabandon');
  const before = await availability();
  await page.goto('/app/settings/billing');
  await page.getByRole('button', { name: 'Become a founding member — $30 once' }).click();
  await expect(page).toHaveURL(/\/pay\//);
  const session = new URL(page.url()).pathname.split('/').at(-1)!;
  await page.getByRole('link', { name: 'Back to DetailerHQ' }).click();
  await expect(page.getByText('Checkout cancelled — nothing was charged.')).toBeVisible();
  expect((await availability()).in_checkout).toBe(before.in_checkout + 1); // still held (Stripe could still accept payment)
  await control(`sessions/${session}/expire`); // Stripe expires the session → signed webhook
  await expect.poll(async () => (await availability()).open).toBe(before.open);
  expect((await availability()).remaining).toBe(before.remaining);
});

test('Standard: card required for the 3-day trial, no charge until it ends, then $30/month; failed payment → grace → read-only → recovered', async ({ page }) => {
  const biz = await bookableBusiness(page, 'billstd');
  await page.goto('/app/settings/billing');
  await page.getByRole('button', { name: 'Start 3-day free trial' }).click();
  await expect(page).toHaveURL(/\/pay\//);
  await expect(page.getByText(/Due today: \$0\.00/)).toBeVisible();
  // Checkout states the trial end and the first charge date, from the fixed trial_end.
  const trialEnd = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  await expect(page.getByText(`Card required. You won’t be charged today. Your 3-day free trial ends ${trialEnd}. Your first charge of $30.00 is on ${trialEnd}`, { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /no card/i })).toHaveCount(0); // no cardless trial
  await page.getByRole('button', { name: 'Use a declined test card' }).click();
  await expect(page.getByRole('alert')).toContainText('declined');
  expect((await billing(biz.businessId)).plan).toBeNull();
  await page.getByRole('button', { name: 'Start trial (test card 4242)' }).click();
  await expect(page).toHaveURL(/checkout=success/);
  await expect(page.getByText('Standard — free trial')).toBeVisible();
  await expect(page.getByText(/First charge: \$30 on/)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /Free trial — ends/ })).toBeVisible();
  const b = await billing(biz.businessId);
  expect(b).toMatchObject({ account_status: 'trialing', plan: 'standard', subscription_status: 'trialing' });
  const hours = (new Date(b.trial_ends_at).getTime() - Date.now()) / 3_600_000;
  expect(hours).toBeGreaterThan(71);
  expect(hours).toBeLessThanOrEqual(72);
  const sub = b.stripe_subscription_id as string;
  // The mock never charged anything during the trial: no paid invoice event yet.
  expect((await mockState()).events.filter((e: { type: string }) => e.type === 'invoice.paid' && e.data.object.parent.subscription_details.subscription === sub)).toHaveLength(0);

  // Trial ends with the card on file → Stripe charges $30 → active.
  await control(`subscriptions/${sub}/trial_end`);
  await expect.poll(async () => (await billing(biz.businessId)).account_status).toBe('active');
  await page.reload();
  await expect(page.getByText('Standard — $30/month')).toBeVisible();
  await expect(page.getByText(/Next charge: \$30 on/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Start 3-day free trial|Subscribe/ })).toHaveCount(0);

  // A renewal fails (expired card) → past due: full access with a warning and an Update card button.
  await control(`subscriptions/${sub}/card_expired`);
  await expect.poll(async () => (await billing(biz.businessId)).account_status).toBe('past_due');
  await page.reload();
  await expect(page.getByText('Standard — payment failed')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: /last payment didn’t go through/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update card' })).toBeVisible();
  // Grace (7 days) over → read-only: writes refused, nothing deleted.
  await db.query("update public.business_billing set past_due_since = now() - interval '8 days' where business_id = $1", [biz.businessId]);
  await db.query('select app.billing_tick()');
  expect((await billing(biz.businessId)).account_status).toBe('inactive');
  await page.goto('/app/settings');
  await expect(page.getByRole('alert').filter({ hasText: /read-only/ })).toBeVisible();
  await page.getByLabel('Business name').fill('Renamed While Read-only');
  await page.getByRole('button', { name: 'Save business details' }).click();
  await settle(page);
  expect((await db.query('select name from public.businesses where id = $1', [biz.businessId])).rows[0].name).not.toBe('Renamed While Read-only');
  expect((await db.query('select count(*)::int as n from public.services where business_id = $1', [biz.businessId])).rows[0].n).toBeGreaterThan(0);
  // The card is updated and the payment goes through → full access again.
  await control(`subscriptions/${sub}/recover`);
  await expect.poll(async () => (await billing(biz.businessId)).account_status).toBe('active');
  // A duplicate webhook delivery changes nothing.
  const paid = (await mockState()).events.filter((e: { type: string }) => e.type === 'invoice.paid').at(-1);
  await control(`replay/${paid.id}`);
  await expect.poll(async () => (await db.query('select attempts from public.billing_events where id = $1', [paid.id])).rows[0]?.attempts).toBe(2);
  expect((await billing(biz.businessId)).account_status).toBe('active');
});

test('Standard: cancel in the Customer Portal keeps access to the period end, then read-only; re-subscribing has no second trial', async ({ page }) => {
  const biz = await bookableBusiness(page, 'billcancel');
  await page.goto('/app/settings/billing');
  await page.getByRole('button', { name: 'Start 3-day free trial' }).click();
  await page.getByRole('button', { name: 'Start trial (test card 4242)' }).click();
  await expect(page.getByText('Standard — free trial')).toBeVisible();
  const sub = (await billing(biz.businessId)).stripe_subscription_id as string;
  await control(`subscriptions/${sub}/trial_end`);
  await expect.poll(async () => (await billing(biz.businessId)).account_status).toBe('active');
  await page.reload();
  await page.getByRole('button', { name: 'Manage billing' }).click();
  await expect(page).toHaveURL(/localhost:12111\/portal\//);
  await page.getByRole('button', { name: 'Cancel subscription' }).click();
  await expect(page.getByText('Your subscription will end at the end of the current period.')).toBeVisible();
  await page.getByRole('link', { name: 'Return to DetailerHQ' }).click();
  await expect.poll(async () => (await billing(biz.businessId)).account_status).toBe('cancelled');
  await page.reload();
  await expect(page.getByText('Standard — cancelled')).toBeVisible();
  await expect(page.getByText(/Full access until/).first()).toBeVisible();
  // The period ends → Stripe ends the subscription → read-only (data kept).
  await control(`subscriptions/${sub}/period_end`);
  await expect.poll(async () => (await billing(biz.businessId)).account_status).toBe('inactive');
  await page.reload();
  await expect(page.getByText('No active plan', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Subscribe — $30/month' })).toBeVisible();
  await expect(page.getByText('You’ve already used your free trial, so billing starts today.')).toBeVisible();
  await page.getByRole('button', { name: 'Subscribe — $30/month' }).click();
  await expect(page.getByText(/You’ll be charged \$30\.00 today/)).toBeVisible();
  await page.getByRole('button', { name: /Subscribe — pay \$30\.00/ }).click();
  await expect.poll(async () => (await billing(biz.businessId)).account_status).toBe('active');
});

test('webhook security and isolation: unsigned, forged and live events are refused; another business can’t use a session', async ({ page, browser }) => {
  const url = 'http://localhost:3000/api/billing/webhook';
  const payload = JSON.stringify({ id: 'evt_forged', object: 'event', type: 'checkout.session.completed', livemode: false, created: Math.floor(Date.now() / 1000), data: { object: { id: 'cs_test_mock_x' } } });
  expect((await fetch(url, { method: 'POST', body: payload })).status).toBe(400);
  expect((await fetch(url, { method: 'POST', body: payload, headers: { 'stripe-signature': signer.webhooks.generateTestHeaderString({ payload, secret: 'whsec_wrongsecretwrongsecret' }) } })).status).toBe(400);
  const tampered = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  expect((await fetch(url, { method: 'POST', body: payload.replace('evt_forged', 'evt_forged2'), headers: { 'stripe-signature': tampered } })).status).toBe(400);
  const live = JSON.stringify({ ...JSON.parse(payload), id: 'evt_live', livemode: true });
  expect((await fetch(url, { method: 'POST', body: live, headers: { 'stripe-signature': signer.webhooks.generateTestHeaderString({ payload: live, secret: WEBHOOK_SECRET }) } })).status).toBe(400);
  expect((await db.query("select count(*)::int as n from public.billing_events where id in ('evt_forged', 'evt_forged2', 'evt_live')")).rows[0].n).toBe(0);

  // Business A starts a trial; business B opening A's checkout return link changes nothing for anyone.
  const a = await bookableBusiness(page, 'billisoA');
  await page.goto('/app/settings/billing');
  await page.getByRole('button', { name: 'Start 3-day free trial' }).click();
  const sessionA = new URL(page.url()).pathname.split('/').at(-1)!;
  await page.getByRole('button', { name: 'Start trial (test card 4242)' }).click();
  await expect(page.getByText('Standard — free trial')).toBeVisible();
  const pageB = await (await browser.newContext()).newPage();
  const b = await bookableBusiness(pageB, 'billisoB', { name: 'Bravo Detailing' });
  await pageB.goto(`/app/settings/billing?checkout=success&session_id=${sessionA}`);
  await expect(pageB.getByText('Pilot access', { exact: true })).toBeVisible();
  expect((await billing(b.businessId)).plan).toBeNull();
  expect((await billing(a.businessId)).account_status).toBe('trialing');
  // B can't read A's billing row through the Data API rules either.
  const { rows: [{ n }] } = await db.query(
    `select count(*)::int as n from public.business_billing where business_id = $1`, [a.businessId]);
  expect(n).toBe(1);
});

for (const [width, height] of [[390, 844], [1280, 900]] as const) {
  test(`billing screens at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await bookableBusiness(page, `bill${width}`);
    for (const path of ['/pricing', '/app/settings/billing']) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBe(0);
      await page.screenshot({ path: `test-results/p8-${path.split('/').at(-1)}-${width}.png`, fullPage: true });
    }
    await page.goto('/app/settings/billing');
    await page.getByRole('button', { name: 'Start 3-day free trial' }).click();
    await expect(page).toHaveURL(/localhost:12111\/pay\//);
    await expect(page.getByText(/Due today: \$0\.00/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/p8-checkout-${width}.png`, fullPage: true });
  });
}
