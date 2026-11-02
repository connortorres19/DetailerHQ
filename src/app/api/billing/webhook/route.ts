import { NextResponse, type NextRequest } from 'next/server';
import { handleEvent } from '@/lib/billing/billing';
import { billingConfig } from '@/lib/billing/config';
import { stripe } from '@/lib/billing/stripe';

// POST /api/billing/webhook — Stripe events for DetailerHQ's own subscriptions.
// 1. The signature is verified on the raw body (STRIPE_WEBHOOK_SECRET, 5-minute tolerance) — an
//    unsigned or altered request is refused before anything is read.
// 2. Each event is processed once (billing_events), and the object it names is re-fetched from
//    Stripe before anything changes, so forged contents or out-of-order delivery can't mislead it.
// 3. A failure answers 500, so Stripe retries (for up to 3 days).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const c = billingConfig();
  if (!c) return new NextResponse(null, { status: 404 });
  const signature = request.headers.get('stripe-signature');
  const body = await request.text();
  if (!signature || body.length > 512_000) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  let event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, c.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }
  if (event.livemode) return NextResponse.json({ error: 'live events are not accepted' }, { status: 400 }); // test mode only
  try {
    const outcome = await handleEvent(event);
    return NextResponse.json({ received: true, outcome });
  } catch {
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
