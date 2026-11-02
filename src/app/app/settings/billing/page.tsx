import type { Metadata } from 'next';
import Link from 'next/link';
import { Notice } from '@/components/app/ui/Notice';
import { Panel } from '@/components/app/ui/Panel';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { requireBusiness } from '@/data/session';
import { DATA_TERMS, FOUNDING_TERMS, foundingSummary, planHeadline, STANDARD_TERMS, TRIAL_DAYS, type Availability, type BillingSummary } from '@/domain/billing';
import { confirmReturn } from '@/lib/billing/billing';
import { billingConfig, billingProblem } from '@/lib/billing/config';
import { createClient } from '@/lib/supabase/server';
import { becomeFoundingMember, openBillingPortal, refreshBilling, startStandardTrial } from './actions';
import styles from './billing.module.css';

export const metadata: Metadata = { title: 'Billing' };

const ERRORS: Record<string, string> = {
  not_configured: 'Billing isn’t set up on this server yet.',
  not_activated: 'Confirm your email to activate your account first.',
  not_allowed: 'Billing changes aren’t available for this account. Contact support.',
  rate_limited: 'Too many attempts. Wait a few minutes and try again.',
  already_founding: 'You’re already a founding member — nothing more to pay.',
  sold_out: 'All five founding spots are claimed. Standard membership is open to everyone.',
  in_checkout: 'Every remaining founding spot is in someone’s checkout right now. Try again in about 30 minutes.',
  in_progress: 'A checkout is already in progress. Finish it, or try again in a moment.',
  already_subscribed: 'You already have a subscription. Use Manage billing to change it.',
  no_subscription: 'There’s no billing account yet — choose a plan first.',
  stripe: 'Stripe couldn’t be reached. Nothing was charged. Please try again.',
};

const OUTCOME: Record<string, { tone: 'positive' | 'attention' | 'info'; text: string }> = {
  claimed: { tone: 'positive', text: 'Welcome, founding member! Your $30 payment is confirmed. You’ll never be charged again.' },
  already_claimed: { tone: 'positive', text: 'Your founding membership is confirmed.' },
  refunded_no_reservation: { tone: 'attention', text: 'Your founding spot had expired before payment completed, so the payment was refunded in full. Nothing was kept.' },
  ok: { tone: 'positive', text: 'You’re subscribed. Details are below.' },
  open: { tone: 'info', text: 'Your checkout isn’t finished yet.' },
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; session_id?: string; error?: string; refreshed?: string }> }) {
  const { business } = await requireBusiness('/app/settings/billing');
  const q = await searchParams;
  const configured = Boolean(billingConfig());
  // Back from Stripe Checkout: confirm with Stripe now (the webhook may still be on its way).
  let returned: (typeof OUTCOME)[string] | null = null;
  if (configured && q.checkout === 'success' && q.session_id) {
    const r = await confirmReturn(business.id, q.session_id).catch(() => null);
    returned = r ? (OUTCOME[r.outcome] ?? { tone: 'info', text: 'Thanks — we’re confirming your payment with Stripe. This page updates in a moment.' }) : { tone: 'info', text: 'We’re confirming your checkout with Stripe. Refresh in a moment.' };
  }
  const supabase = await createClient();
  const [{ data: row }, { data: biz }, { data: avail }] = await Promise.all([
    supabase.from('business_billing').select('plan, subscription_status, trial_ends_at, current_period_end, cancel_at_period_end, past_due_since, founding_slot, founding_access_revoked_at, trial_used, stripe_customer_id').maybeSingle(),
    supabase.from('businesses').select('account_status').single(),
    supabase.rpc('founding_availability'),
  ]);
  const summary: BillingSummary = {
    account_status: biz?.account_status ?? business.account_status,
    plan: row?.plan ?? null,
    subscription_status: row?.subscription_status ?? null,
    trial_ends_at: row?.trial_ends_at ?? null,
    current_period_end: row?.current_period_end ?? null,
    cancel_at_period_end: row?.cancel_at_period_end ?? false,
    past_due_since: row?.past_due_since ?? null,
    founding_slot: row?.founding_slot ?? null,
    founding_access_revoked_at: row?.founding_access_revoked_at ?? null,
  };
  const head = planHeadline(summary, business.timezone);
  const founding = foundingSummary((avail as Availability | null) ?? null);
  const isFounding = summary.plan === 'founding' && !summary.founding_access_revoked_at;
  const liveSub = ['trialing', 'active', 'past_due', 'cancelled'].includes(summary.account_status) && summary.plan === 'standard';
  const trialAvailable = !row?.trial_used;
  const error = q.error ? (ERRORS[q.error] ?? ERRORS.stripe) : null;

  return (
    <div className={styles.stack}>
      {returned ? <Notice tone={returned.tone}>{returned.text}</Notice> : null}
      {q.checkout === 'cancelled' ? <Notice tone="info">Checkout cancelled — nothing was charged.</Notice> : null}
      {error ? <Notice tone="critical">{error}</Notice> : null}
      {q.refreshed ? <Notice tone="positive">Billing details refreshed from Stripe.</Notice> : null}
      {!configured ? <Notice tone="attention">{billingProblem()}</Notice> : null}

      <Panel title="Your plan" id="plan">
        <div className={styles.current} data-status={summary.account_status}>
          <p className={styles.planTitle}>{head.title}</p>
          <p className={styles.muted}>{head.detail}</p>
        </div>
        {configured && (liveSub || (row?.stripe_customer_id && !isFounding) || isFounding) ? (
          <div className={styles.buttons}>
            {row?.stripe_customer_id ? (
              <form action={openBillingPortal}>
                <SubmitButton variant={summary.account_status === 'past_due' ? 'primary' : 'secondary'} pendingLabel="Opening…">
                  {isFounding ? 'Receipts and payment details' : summary.account_status === 'past_due' ? 'Update card' : 'Manage billing'}
                </SubmitButton>
              </form>
            ) : null}
            <form action={refreshBilling}>
              <SubmitButton variant="secondary" pendingLabel="Checking…">
                Refresh from Stripe
              </SubmitButton>
            </form>
          </div>
        ) : null}
        {liveSub ? <p className={styles.muted}>Manage billing opens Stripe: update your card, see invoices, cancel or renew. Cancelling keeps full access until the end of the paid period.</p> : null}
      </Panel>

      {!isFounding && !liveSub ? (
        <div className={styles.plans}>
          <section className={styles.plan} aria-labelledby="plan-founding">
            <p className={styles.flag}>{founding.label}</p>
            <h2 id="plan-founding" className={styles.planName}>
              Founding 5
            </h2>
            <p className={styles.price}>
              <span className={styles.amount}>$30</span> <span className={styles.period}>once · lifetime</span>
            </p>
            <ul className={styles.terms}>
              {FOUNDING_TERMS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {founding.note ? <p className={styles.muted}>{founding.note}</p> : null}
            {founding.available && configured && summary.plan !== 'founding' ? (
              <form action={becomeFoundingMember}>
                <SubmitButton pendingLabel="Reserving your spot…">Become a founding member — $30 once</SubmitButton>
              </form>
            ) : null}
            {founding.available ? <p className={styles.fine}>Your spot is held for 30 minutes while you pay. It’s only yours once Stripe confirms the payment.</p> : null}
          </section>

          <section className={styles.plan} aria-labelledby="plan-standard">
            <p className={styles.flag}>{trialAvailable ? `${TRIAL_DAYS}-day free trial` : 'Monthly'}</p>
            <h2 id="plan-standard" className={styles.planName}>
              Standard
            </h2>
            <p className={styles.price}>
              <span className={styles.amount}>$30</span> <span className={styles.period}>per month</span>
            </p>
            <ul className={styles.terms}>
              {(trialAvailable ? STANDARD_TERMS : STANDARD_TERMS.filter((t) => !/trial/i.test(t))).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {configured ? (
              <form action={startStandardTrial}>
                <SubmitButton variant={founding.available ? 'secondary' : 'primary'} pendingLabel="Opening checkout…">
                  {trialAvailable ? `Start ${TRIAL_DAYS}-day free trial` : 'Subscribe — $30/month'}
                </SubmitButton>
              </form>
            ) : null}
            <p className={styles.fine}>
              {trialAvailable
                ? 'Card required. Stripe’s checkout shows your trial end date and first $30 charge date before you confirm.'
                : 'You’ve already used your free trial, so billing starts today.'}
            </p>
          </section>
        </div>
      ) : null}

      {summary.account_status === 'pilot' && !summary.plan ? (
        <p className={styles.muted}>Pilot access stays free until you choose a plan. Choosing one ends pilot access for this business.</p>
      ) : null}
      <p className={styles.muted}>
        {DATA_TERMS} Payments are processed by Stripe; DetailerHQ never sees your card number. <Link href="/pricing">Pricing and terms</Link>
      </p>
    </div>
  );
}
