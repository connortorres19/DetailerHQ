import 'server-only';
import type Stripe from 'stripe';
import { billingConfig, FOUNDING_PRICE_CENTS, TRIAL_DAYS } from './config';
import { billingPool, stripe } from './stripe';

// DetailerHQ's own subscription billing — Stripe Checkout, Customer Portal and webhooks. Every state
// change comes from an object re-fetched from Stripe with the secret key (or a verified webhook that
// names it), applied through billing_api (billing_worker role). Nothing the browser sends — no
// status, no amount, no price, no metadata — is trusted. Never logs keys or card details.

export class BillingError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'already_founding' | 'sold_out' | 'in_checkout' | 'in_progress' | 'already_subscribed' | 'no_subscription' | 'stripe' | 'not_allowed',
  ) {
    super(message);
  }
}

type BillingRow = {
  plan: 'founding' | 'standard' | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  trial_used: boolean;
  founding_slot: number | null;
  founding_access_revoked_at: string | null;
  account_status: string;
  business_name: string;
  business_email: string | null;
};

const LIVE = ['trialing', 'active', 'past_due', 'incomplete', 'unpaid', 'paused'];
const db = () => billingPool();
const id = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : (v?.id ?? null));
const ts = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);

export async function billingFor(businessId: string): Promise<BillingRow> {
  const { rows: [row] } = await db().query('select * from billing_api.billing_for($1)', [businessId]);
  if (!row) throw new BillingError('Business not found.', 'not_allowed');
  return row as BillingRow;
}

const urls = (path: string) => {
  const site = billingConfig()!.siteUrl;
  return {
    success: `${site}/app/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel: `${site}/app/settings/billing?checkout=cancelled`,
    back: `${site}${path}`,
  };
};

/** The business's Stripe customer — created once, by the server, and never moved. */
export async function ensureCustomer(businessId: string, ownerEmail: string): Promise<string> {
  const b = await billingFor(businessId);
  if (b.stripe_customer_id) return b.stripe_customer_id;
  const customer = await stripe().customers.create(
    { email: ownerEmail || b.business_email || undefined, name: b.business_name, metadata: { business_id: businessId } },
    { idempotencyKey: `customer:${businessId}` },
  );
  await db().query('select billing_api.set_customer($1, $2)', [businessId, customer.id]);
  return customer.id;
}

// --- Founding 5 -------------------------------------------------------------------------------------

/**
 * Creates the one-time $30 Checkout session for a spot the database already reserved for this
 * business (public.start_founding_reservation, run as the signed-in owner). A previous open session
 * for the same reservation is expired first, so only one can ever be paid.
 */
export async function foundingCheckout(businessId: string, slot: number, ownerEmail: string): Promise<string> {
  const c = billingConfig()!;
  const customer = await ensureCustomer(businessId, ownerEmail);
  const { rows: [current] } = await db().query('select * from billing_api.founding_reservation_for($1)', [businessId]);
  if (current?.checkout_session_id) {
    const old = await stripe().checkout.sessions.retrieve(current.checkout_session_id);
    if (old.status === 'complete') {
      await handleCheckoutSession(old.id);
      throw new BillingError('Your founding membership payment already went through.', 'already_founding');
    }
    if (old.status === 'open') {
      const expired = await stripe().checkout.sessions.expire(old.id);
      if (expired.status !== 'expired') throw new BillingError('Please try again in a moment.', 'in_progress');
    }
  }
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer,
      client_reference_id: businessId,
      line_items: [{ price: c.STRIPE_PRICE_FOUNDING, quantity: 1 }],
      allowed_payment_method_types: ['card'], // instant confirmation only (cards and card wallets): no delayed bank methods
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60, // Stripe's minimum is 30 minutes
      success_url: urls('').success,
      cancel_url: urls('').cancel,
      metadata: { kind: 'founding', business_id: businessId, slot: String(slot) },
      payment_intent_data: { metadata: { kind: 'founding', business_id: businessId, slot: String(slot) }, description: `DetailerHQ Founding 5 — lifetime membership (spot ${slot})` },
      custom_text: { submit: { message: 'One-time payment of $30.00 for a lifetime DetailerHQ Founding 5 membership. There are no recurring charges.' } },
    });
  } catch {
    await db().query('select billing_api.release_founding($1, null)', [slot]); // no session was created
    throw new BillingError('Stripe couldn’t start the checkout. Please try again.', 'stripe');
  }
  await db().query('select billing_api.attach_founding_session($1, $2, $3, $4)', [businessId, slot, session.id, ts(session.expires_at)]);
  return session.url!;
}

/** Verifies a completed founding payment against Stripe's own records, then claims the spot. */
async function claimFounding(session: Stripe.Checkout.Session) {
  const c = billingConfig()!;
  const businessId = session.client_reference_id;
  const items = session.line_items?.data ?? (await stripe().checkout.sessions.listLineItems(session.id, { limit: 5 })).data;
  const paid =
    session.mode === 'payment' && session.status === 'complete' && session.payment_status === 'paid' &&
    session.amount_total === FOUNDING_PRICE_CENTS && session.currency === 'usd' &&
    items.length === 1 && id(items[0]!.price) === c.STRIPE_PRICE_FOUNDING && items[0]!.quantity === 1;
  if (!businessId || !paid) return { outcome: 'not_paid', businessId };
  // The customer must be the one DetailerHQ created for this business.
  const owner = await db().query('select billing_api.business_for_customer($1) as b', [id(session.customer)]);
  const { rows: [r] } = await db().query('select * from billing_api.claim_founding($1, $2, $3, $4, $5)', [
    session.id, owner.rows[0]?.b === businessId ? businessId : null, id(session.payment_intent), session.amount_total, session.currency,
  ]);
  if (r.outcome === 'not_reserved') {
    // Paid without a reservation (expired session, sold out, tampering): never a sixth spot — refund.
    if (session.payment_intent) await stripe().refunds.create({ payment_intent: id(session.payment_intent)!, reason: 'requested_by_customer', metadata: { reason: 'no_founding_reservation' } }, { idempotencyKey: `refund:${session.id}` });
    return { outcome: 'refunded_no_reservation', businessId };
  }
  // A founding member is never billed again: end any trial/subscription now, without charge.
  if (r.cancel_subscription) await stripe().subscriptions.cancel(r.cancel_subscription, { prorate: false, invoice_now: false });
  return { outcome: r.outcome, businessId };
}

// --- Standard ---------------------------------------------------------------------------------------

const longDate = (d: Date, tz: string) => d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

/**
 * Checkout for the $30/month plan. A card is ALWAYS required (also for the trial): the owner
 * authorizes $30/month at checkout, nothing is charged during the 3-day trial, and Stripe bills the
 * card automatically at the trial end and monthly after that, until they cancel. The trial end is a
 * fixed date (not "3 days from whenever checkout finishes"), so the dates shown are exact; the
 * session expires after an hour. A business gets one trial; later subscriptions are billed at once.
 */
export async function standardCheckout(businessId: string, ownerEmail: string, timezone: string): Promise<{ url: string; trialEnd: Date | null }> {
  const c = billingConfig()!;
  const b = await billingFor(businessId);
  if (b.plan === 'founding' && !b.founding_access_revoked_at) throw new BillingError('You’re a founding member — there’s nothing to subscribe to.', 'already_founding');
  if (b.stripe_subscription_id && LIVE.includes(b.subscription_status ?? '')) throw new BillingError('You already have a subscription. Manage it below.', 'already_subscribed');
  const customer = await ensureCustomer(businessId, ownerEmail);
  const trialEnd = b.trial_used ? null : new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const message = trialEnd
    ? `Card required. You won’t be charged today. Your ${TRIAL_DAYS}-day free trial ends ${longDate(trialEnd, timezone)}. Your first charge of $30.00 is on ${longDate(trialEnd, timezone)}, then $30.00 every month until you cancel. Cancel before the trial ends and you won’t be charged.`
    : 'You’ll be charged $30.00 today and then every month until you cancel. Cancel anytime.';
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: businessId,
    line_items: [{ price: c.STRIPE_PRICE_STANDARD, quantity: 1 }],
    allowed_payment_method_types: ['card'],
    payment_method_collection: 'always', // never a cardless trial
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    subscription_data: {
      metadata: { business_id: businessId },
      ...(trialEnd
        ? { trial_end: Math.floor(trialEnd.getTime() / 1000), trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } }
        : {}),
    },
    metadata: { kind: 'standard', business_id: businessId },
    success_url: urls('').success,
    cancel_url: urls('').cancel,
    custom_text: { submit: { message } },
  });
  return { url: session.url!, trialEnd };
}

export async function portalUrl(businessId: string): Promise<string> {
  const b = await billingFor(businessId);
  if (!b.stripe_customer_id) throw new BillingError('There’s no billing account yet.', 'no_subscription');
  const s = await stripe().billingPortal.sessions.create({ customer: b.stripe_customer_id, return_url: urls('/app/settings/billing').back });
  return s.url;
}

/** Re-reads a subscription from Stripe and applies it. Enforces "founding is never billed" and "one subscription". */
export async function syncSubscription(subscriptionId: string): Promise<{ outcome: string; businessId: string | null }> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const customerId = id(sub.customer)!;
  const { rows: [{ b: businessId }] } = await db().query('select billing_api.business_for_customer($1) as b', [customerId]);
  if (!businessId) return { outcome: 'unknown_customer', businessId: null };
  if (sub.metadata?.business_id && sub.metadata.business_id !== businessId) return { outcome: 'business_mismatch', businessId };
  // Price check: only DetailerHQ's Standard price counts.
  if (!sub.items.data.some((i) => i.price.id === billingConfig()!.STRIPE_PRICE_STANDARD)) return { outcome: 'not_standard_price', businessId };
  const customer = await stripe().customers.retrieve(customerId);
  const hasCard = Boolean(sub.default_payment_method || (!customer.deleted && customer.invoice_settings?.default_payment_method));
  const periodEnd = Math.max(...sub.items.data.map((i) => i.current_period_end ?? 0));
  const { rows: [{ outcome }] } = await db().query('select billing_api.sync_subscription($1, $2, $3, $4, $5, $6, $7, $8) as outcome', [
    businessId, customerId, sub.id, sub.status, ts(sub.trial_end), ts(periodEnd), Boolean(sub.cancel_at_period_end || sub.cancel_at), hasCard,
  ]);
  if ((outcome === 'cancel_founding' || outcome === 'duplicate') && LIVE.includes(sub.status)) {
    await stripe().subscriptions.cancel(sub.id, { prorate: false, invoice_now: false });
  }
  return { outcome, businessId };
}

/** Handles a Checkout session by id (from a verified webhook, or the owner's return from Checkout). */
export async function handleCheckoutSession(sessionId: string): Promise<{ outcome: string; businessId: string | null }> {
  const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ['line_items'] });
  const businessId = session.client_reference_id;
  if (session.status === 'expired') {
    const { rows: [r] } = await db().query('select * from billing_api.founding_reservation($1)', [session.id]);
    if (r?.state === 'reserved') await db().query('select billing_api.release_founding($1, $2)', [r.slot, session.id]);
    return { outcome: r ? 'released' : 'expired', businessId };
  }
  if (session.status !== 'complete') return { outcome: 'open', businessId };
  if (session.mode === 'payment') return claimFounding(session);
  if (session.mode === 'subscription' && session.subscription) return syncSubscription(id(session.subscription)!);
  return { outcome: 'ignored', businessId };
}

/**
 * The owner came back from Checkout (?session_id=…): apply it now rather than waiting for the
 * webhook — but only a session DetailerHQ created for this owner's own business.
 */
export async function confirmReturn(businessId: string, sessionId: string) {
  if (!/^cs_(test|live)_[A-Za-z0-9_]{8,}$/.test(sessionId)) return { outcome: 'invalid', businessId };
  const s = await stripe().checkout.sessions.retrieve(sessionId);
  if (s.client_reference_id !== businessId) return { outcome: 'not_yours', businessId };
  return handleCheckoutSession(s.id);
}

/** One verified webhook event, processed once. Objects are re-fetched (event order doesn't matter). */
export async function handleEvent(event: Stripe.Event): Promise<string> {
  const { rows: [{ go }] } = await db().query('select billing_api.begin_event($1, $2, $3) as go', [event.id, event.type, ts(event.created)]);
  if (!go) return 'duplicate';
  let result: { outcome: string; businessId: string | null } = { outcome: 'ignored', businessId: null };
  try {
    const obj = event.data.object as unknown as Record<string, unknown> & { id: string };
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.expired':
        result = await handleCheckoutSession(obj.id);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
      case 'customer.subscription.trial_will_end':
        result = await syncSubscription(obj.id);
        break;
      case 'payment_method.automatically_updated': {
        // The card network updated an expiring card: refresh the subscription's card state.
        const pm = event.data.object as Stripe.PaymentMethod;
        const cust = id(pm.customer);
        const { rows: [r] } = cust ? await db().query('select billing_api.business_for_customer($1) as b', [cust]) : { rows: [] };
        const b = r?.b ? await billingFor(r.b) : null;
        if (b?.stripe_subscription_id) result = await syncSubscription(b.stripe_subscription_id);
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.payment_action_required': {
        const inv = event.data.object as Stripe.Invoice;
        const sub = id(inv.parent?.subscription_details?.subscription);
        if (sub) {
          result = await syncSubscription(sub);
          if (event.type === 'invoice.paid' && result.businessId && inv.amount_paid > 0) await db().query('select billing_api.mark_paid($1)', [result.businessId]);
        }
        break;
      }
      case 'charge.refunded':
      case 'charge.dispute.created':
      case 'charge.dispute.closed': {
        const pi = id((event.data.object as Stripe.Charge | Stripe.Dispute).payment_intent);
        // Recorded only: a refund or dispute never reopens a spot or removes access by itself.
        if (pi) await db().query('select billing_api.record_founding_refund($1, $2)', [pi, event.type !== 'charge.refunded']);
        result = { outcome: 'recorded', businessId: null };
        break;
      }
    }
  } catch (e) {
    await db().query('select billing_api.finish_event($1, null, $2, $3)', [event.id, 'error', e instanceof Error ? e.message.slice(0, 300) : 'error']);
    throw e;
  }
  await db().query('select billing_api.finish_event($1, $2, $3, null)', [event.id, result.businessId, result.outcome]);
  return result.outcome;
}

/**
 * Catch-up for missed webhooks: founding reservations whose session should have expired (asks
 * Stripe; expires it if still open), and this business's subscription.
 */
export async function reconcile(businessId?: string) {
  const { rows } = await db().query('select * from billing_api.stale_founding_reservations()');
  for (const r of rows) {
    try {
      let s = await stripe().checkout.sessions.retrieve(r.checkout_session_id);
      if (s.status === 'open') s = await stripe().checkout.sessions.expire(s.id);
      await handleCheckoutSession(s.id);
    } catch {
      /* Stripe unreachable: try again next time; the reservation stays (never released on our clock alone) */
    }
  }
  if (businessId) {
    const b = await billingFor(businessId);
    if (b.stripe_subscription_id) await syncSubscription(b.stripe_subscription_id).catch(() => undefined);
  }
}
