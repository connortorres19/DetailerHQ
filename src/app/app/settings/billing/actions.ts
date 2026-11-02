'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireBusiness } from '@/data/session';
import { BillingError, foundingCheckout, portalUrl, reconcile, standardCheckout } from '@/lib/billing/billing';
import { billingConfig } from '@/lib/billing/config';
import { createClient } from '@/lib/supabase/server';

// Settings → Billing. Each action works on the signed-in owner's own business (from the session —
// never from the form), and sends the owner to a Stripe-hosted page. Nothing here changes billing
// state directly: that only happens when Stripe confirms (webhook or re-fetched Checkout session).

const PATH = '/app/settings/billing';
const fail = (code: string): never => redirect(`${PATH}?error=${code}`);

// Starting checkouts calls Stripe for the owner: limit how often (per business, per server process).
const recent = new Map<string, number[]>();
function limited(businessId: string) {
  const now = Date.now();
  const hits = (recent.get(businessId) ?? []).filter((t) => t > now - 10 * 60_000);
  if (hits.length >= 10) return true;
  recent.set(businessId, [...hits, now]);
  return false;
}

async function context() {
  const { user, business } = await requireBusiness(PATH);
  if (!billingConfig()) fail('not_configured');
  if (business.account_status === 'pending_activation') fail('not_activated');
  if (['suspended', 'closing'].includes(business.account_status)) fail('not_allowed');
  if (limited(business.id)) fail('rate_limited');
  return { user, business };
}

export async function becomeFoundingMember() {
  const { user, business } = await context();
  const supabase = await createClient();
  // The database reserves a spot atomically (exactly five exist; one per business).
  let { data: slot, error } = await supabase.rpc('start_founding_reservation');
  if (error?.details === 'in_checkout') {
    await reconcile(); // checkouts whose webhook was missed: ask Stripe, release expired ones
    ({ data: slot, error } = await supabase.rpc('start_founding_reservation'));
  }
  if (error) fail(['already_founding', 'in_checkout', 'sold_out', 'in_progress'].includes(error.details ?? '') ? error.details! : 'stripe');
  let url = '';
  try {
    url = await foundingCheckout(business.id, Number(slot), user.email);
  } catch (e) {
    fail(e instanceof BillingError ? e.code : 'stripe');
  }
  redirect(url);
}

export async function startStandardTrial() {
  const { user, business } = await context();
  let url = '';
  try {
    url = (await standardCheckout(business.id, user.email, business.timezone)).url;
  } catch (e) {
    fail(e instanceof BillingError ? e.code : 'stripe');
  }
  redirect(url);
}

export async function openBillingPortal() {
  const { business } = await context();
  let url = '';
  try {
    url = await portalUrl(business.id);
  } catch (e) {
    fail(e instanceof BillingError ? e.code : 'stripe');
  }
  redirect(url);
}

export async function refreshBilling() {
  const { business } = await context();
  try {
    await reconcile(business.id);
  } catch {
    fail('stripe');
  }
  revalidatePath(PATH);
  redirect(`${PATH}?refreshed=1`);
}
