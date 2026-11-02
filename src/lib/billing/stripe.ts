import 'server-only';
import pg from 'pg';
import Stripe from 'stripe';
import { billingConfig } from './config';

// The Stripe client (secret key, server only) and the billing_worker database pool. In local
// development STRIPE_MOCK_URL points the official SDK at the local Stripe stand-in instead of
// api.stripe.com — never on a public site (see config.ts).

const g = globalThis as unknown as { stripeClient?: Stripe; billingPool?: pg.Pool };

export function stripe(): Stripe {
  const c = billingConfig();
  if (!c) throw new Error('Billing is not configured');
  g.stripeClient ??= new Stripe(c.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: 'DetailerHQ' },
    telemetry: false,
    ...(c.mock ? { host: c.mock.hostname, port: Number(c.mock.port || 80), protocol: c.mock.protocol.replace(':', '') as 'http' | 'https' } : {}),
  });
  return g.stripeClient;
}

export function billingPool(): pg.Pool {
  const c = billingConfig();
  if (!c) throw new Error('Billing is not configured');
  g.billingPool ??= new pg.Pool({ connectionString: c.BILLING_DATABASE_URL, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 });
  return g.billingPool;
}
