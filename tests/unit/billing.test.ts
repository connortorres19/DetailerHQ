import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billingBanner, FOUNDING_TERMS, foundingSummary, planHeadline, STANDARD_TERMS, TRIAL_DAYS, type BillingSummary } from '../../src/domain/billing.ts';

const base: BillingSummary = { account_status: 'pilot', plan: null, subscription_status: null, trial_ends_at: null, current_period_end: null, cancel_at_period_end: false, past_due_since: null, founding_slot: null, founding_access_revoked_at: null };
const TZ = 'America/Chicago';

test('the trial is 3 days, needs a card and charges nothing until it ends — wording says so everywhere', () => {
  assert.equal(TRIAL_DAYS, 3);
  const all = [...STANDARD_TERMS, ...FOUNDING_TERMS].join(' ');
  assert.match(all, /3-day free trial\. A card is required to start, and nothing is charged during the trial\./);
  assert.match(all, /first \$30 charge is on the day the trial ends/);
  assert.doesNotMatch(all, /7-day|no card required|no credit card/i);
  assert.ok(FOUNDING_TERMS.some((t) => /no recurring charges/.test(t)));
});

test('founding spots: real counts only; sold out and all-in-checkout are told apart', () => {
  assert.deepEqual(foundingSummary({ total: 5, claimed: 1, in_checkout: 0, remaining: 4, open: 4 }), { label: '4 of 5 founding spots left', available: true, note: null });
  assert.equal(foundingSummary({ total: 5, claimed: 4, in_checkout: 0, remaining: 1, open: 1 }).label, '1 of 5 founding spot left');
  const busy = foundingSummary({ total: 5, claimed: 3, in_checkout: 2, remaining: 2, open: 0 });
  assert.equal(busy.available, false);
  assert.match(busy.note!, /in someone’s checkout/);
  const sold = foundingSummary({ total: 5, claimed: 5, in_checkout: 0, remaining: 0, open: 0 });
  assert.deepEqual([sold.label, sold.available], ['All five founding spots are claimed', false]);
  assert.equal(foundingSummary(null).available, false, 'unknown → never offered');
});

test('banners and headlines for each state', () => {
  assert.equal(billingBanner(base, TZ), null, 'pilot: no banner');
  assert.equal(billingBanner({ ...base, account_status: 'active', plan: 'founding', founding_slot: 2 }, TZ), null);
  assert.equal(planHeadline({ ...base, account_status: 'active', plan: 'founding', founding_slot: 2 }, TZ).title, 'Founding member #2');
  const trial = { ...base, account_status: 'trialing', plan: 'standard' as const, trial_ends_at: '2026-11-04T18:00:00Z' };
  assert.match(billingBanner(trial, TZ)!.text, /Free trial — ends Wed, Nov 4, 2026\. Your card will be charged \$30 that day/);
  assert.match(planHeadline(trial, TZ).detail, /First charge: \$30 on Wed, Nov 4, 2026/);
  assert.match(billingBanner({ ...trial, cancel_at_period_end: true }, TZ)!.text, /nothing will be charged/);
  const due = billingBanner({ ...base, account_status: 'past_due', plan: 'standard', past_due_since: '2026-11-01T12:00:00Z' }, TZ)!;
  assert.equal(due.tone, 'critical');
  assert.match(due.text, /by Sun, Nov 8, 2026/, '7 days of grace');
  assert.match(billingBanner({ ...base, account_status: 'cancelled', plan: 'standard', current_period_end: '2026-12-01T12:00:00Z' }, TZ)!.text, /Full access continues until Tue, Dec 1, 2026/);
  for (const s of ['trial_expired', 'inactive']) assert.match(billingBanner({ ...base, account_status: s, plan: 'standard' }, TZ)!.text, /read-only.*Nothing has been deleted|read-only — nothing has been deleted/);
});
