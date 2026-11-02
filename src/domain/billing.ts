// Plans, terms and status wording for DetailerHQ's own billing (Phase 8). Pure: no server or
// browser APIs, so the pricing page, settings and banners say exactly the same thing (and unit tests
// can check it). Prices are fixed here and verified against Stripe by `npm run billing:check`.

export const PLAN_PRICE = '$30';
export const TRIAL_DAYS = 3;
export const FOUNDING_TOTAL = 5;

export type Availability = { total: number; claimed: number; in_checkout: number; remaining: number; open: number };

export const FOUNDING_TERMS = [
  '$30 one-time payment. No subscription, no recurring charges — ever.',
  'Lifetime access to DetailerHQ, with every feature.',
  'Permanent founding-member status.',
  'Limited to the first five businesses. Once all five are claimed, the offer is gone.',
];

export const STANDARD_TERMS = [
  '$30 per month, every feature included. No add-ons or extra charges.',
  `${TRIAL_DAYS}-day free trial. A card is required to start, and nothing is charged during the trial.`,
  'Your first $30 charge is on the day the trial ends, then every month until you cancel.',
  'Cancel anytime in Manage billing. Cancel before the trial ends and you’re never charged.',
  'If you cancel, you keep full access until the end of the period you paid for.',
];

export const DATA_TERMS = 'Your data is never deleted when a plan ends. Without an active plan your account becomes read-only until you choose one again.';

/** "3 of 5 founding spots left" — from real counts only. */
export function foundingSummary(a: Availability | null): { label: string; available: boolean; note: string | null } {
  if (!a) return { label: 'Founding spots unavailable right now', available: false, note: null };
  if (a.remaining <= 0) return { label: 'All five founding spots are claimed', available: false, note: 'Standard membership is open to everyone.' };
  const label = `${a.remaining} of ${a.total} founding spot${a.remaining === 1 ? '' : 's'} left`;
  if (a.open <= 0) return { label, available: false, note: 'Every remaining spot is in someone’s checkout right now. If a checkout isn’t completed, its spot opens again within about 30 minutes.' };
  return { label, available: true, note: a.in_checkout > 0 ? `${a.in_checkout} being purchased right now.` : null };
}

export type BillingSummary = {
  account_status: string;
  plan: 'founding' | 'standard' | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  past_due_since: string | null;
  founding_slot: number | null;
  founding_access_revoked_at: string | null;
};

const day = (iso: string, tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
const graceEnd = (iso: string) => new Date(new Date(iso).getTime() + 7 * 86_400_000).toISOString();

export type Banner = { tone: 'info' | 'attention' | 'critical'; text: string } | null;

/** The app-wide banner for the current billing state (null when there's nothing to say). */
export function billingBanner(b: BillingSummary, tz: string): Banner {
  switch (b.account_status) {
    case 'trialing':
      return b.trial_ends_at
        ? { tone: 'info', text: `Free trial — ends ${day(b.trial_ends_at, tz)}. Your card will be charged $30 that day, then monthly${b.cancel_at_period_end ? '' : ' unless you cancel'}.${b.cancel_at_period_end ? ' You cancelled, so nothing will be charged and access ends then.' : ''}` }
        : null;
    case 'cancelled':
      return b.current_period_end ? { tone: 'attention', text: `Your subscription is cancelled. Full access continues until ${day(b.current_period_end, tz)}, then your account becomes read-only.` } : null;
    case 'past_due':
      return { tone: 'critical', text: `Your last payment didn’t go through. Update your card in Settings → Billing${b.past_due_since ? ` by ${day(graceEnd(b.past_due_since), tz)}` : ''} to keep full access.` };
    case 'trial_expired':
      return { tone: 'critical', text: 'Your free trial has ended. Your account is read-only — nothing has been deleted. Choose a plan in Settings → Billing to continue.' };
    case 'inactive':
      return { tone: 'critical', text: 'Your account is read-only because there’s no active plan. Nothing has been deleted. Choose a plan in Settings → Billing to continue.' };
    default:
      return null;
  }
}

/** One-line plan description for Settings → Billing. */
export function planHeadline(b: BillingSummary, tz: string): { title: string; detail: string } {
  if (b.plan === 'founding' && !b.founding_access_revoked_at)
    return { title: `Founding member #${b.founding_slot}`, detail: 'Lifetime access, paid once ($30). You’ll never be charged again.' };
  if (b.plan === 'founding') return { title: `Founding member #${b.founding_slot} — access paused`, detail: 'Founding access was paused by DetailerHQ support. Contact us, or choose Standard to continue.' };
  if (b.account_status === 'pilot' && !b.plan) return { title: 'Pilot access', detail: 'You’re in the DetailerHQ pilot. Nothing is charged. Choose a plan below when you’re ready.' };
  if (!b.plan) return { title: 'No plan yet', detail: 'Choose a plan below.' };
  switch (b.account_status) {
    case 'trialing':
      return { title: 'Standard — free trial', detail: b.trial_ends_at ? `Trial ends ${day(b.trial_ends_at, tz)}. ${b.cancel_at_period_end ? 'You cancelled: nothing will be charged.' : `First charge: $30 on ${day(b.trial_ends_at, tz)}, then monthly.`}` : 'Trial active.' };
    case 'active':
      return { title: 'Standard — $30/month', detail: b.current_period_end ? `Next charge: $30 on ${day(b.current_period_end, tz)}.` : 'Active.' };
    case 'cancelled':
      return { title: 'Standard — cancelled', detail: b.current_period_end ? `Full access until ${day(b.current_period_end, tz)}. You won’t be charged again. You can renew before then.` : 'Cancelled.' };
    case 'past_due':
      return { title: 'Standard — payment failed', detail: `Stripe will retry the card. Update it in Manage billing${b.past_due_since ? ` by ${day(graceEnd(b.past_due_since), tz)}` : ''} to keep full access.` };
    case 'trial_expired':
      return { title: 'Trial ended', detail: 'Your account is read-only. Subscribe to continue — your data is all still here.' };
    default:
      return { title: 'No active plan', detail: 'Your account is read-only. Subscribe to continue — your data is all still here.' };
  }
}
