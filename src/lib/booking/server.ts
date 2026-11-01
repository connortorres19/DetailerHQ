import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import { headers } from 'next/headers';
import pg from 'pg';
import { z } from 'zod';

// The restricted public booking path (D-13, D-21): the server connects as the `booking_api`
// database role, which can only execute the public_api functions. The connection string and
// the IP-hash secret are server-only; they never reach browser code (checked by test:bundle).

const schema = z.object({
  BOOKING_DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/booking_api[.:@]/, 'must connect as the booking_api role'),
  BOOKING_HASH_SECRET: z.string().min(32),
});

let config: z.infer<typeof schema> | null = null;
function bookingConfig() {
  config ??= schema.parse({
    BOOKING_DATABASE_URL: process.env.BOOKING_DATABASE_URL,
    BOOKING_HASH_SECRET: process.env.BOOKING_HASH_SECRET,
  });
  return config;
}

// One small pool per server process (kept across dev reloads).
const globalPool = globalThis as unknown as { bookingPool?: pg.Pool };
function pool() {
  globalPool.bookingPool ??= new pg.Pool({
    connectionString: bookingConfig().BOOKING_DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  return globalPool.bookingPool;
}

export type PublicError = { code: string; message: string; detail: string | null };
export type PublicResult<T> = { ok: true; data: T } | { ok: false; error: PublicError };

type PublicFunction =
  | 'get_booking_page'
  | 'get_available_slots'
  | 'submit_booking_request'
  | 'get_request_status'
  | 'withdraw_request'
  | 'cancel_appointment'
  | 'accept_proposal'
  | 'decline_proposal'
  | 'get_quote'
  | 'accept_quote'
  | 'decline_quote';

// Calls one public_api function. Since migration 11 they return {"error": …} instead of raising
// (so failed attempts are rate-limited); unexpected database errors still throw.
export async function callPublic<T>(fn: PublicFunction, args: unknown[]): Promise<PublicResult<T>> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool().query(`select public_api.${fn}(${placeholders}) as result`, args);
  const result = rows[0]?.result as (T & { error?: PublicError }) | null;
  if (result && typeof result === 'object' && 'error' in result && result.error) return { ok: false, error: result.error };
  // Phase 7: send any emails this change queued (requests, answers, cancellations) after the response.
  if (fn !== 'get_booking_page' && fn !== 'get_available_slots' && fn !== 'get_request_status' && fn !== 'get_quote')
    void import('@/lib/email/kick').then((m) => m.kickEmail()).catch(() => undefined);
  return { ok: true, data: result as T };
}

export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest();

// Status links: 256-bit HMAC of the form's random idempotency key under the server secret, URL-safe.
// Unguessable without the secret, and a retried submit (same key) gets the same working link
// for the request the database already holds. Only the SHA-256 of the token is stored.
export function statusTokenFor(idempotencyKey: string) {
  const token = createHmac('sha256', bookingConfig().BOOKING_HASH_SECRET).update(`status-link:${idempotencyKey}`).digest('base64url');
  return { token, hash: sha256(token) };
}

export const isWellFormedToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

// Quote links. The database makes them (public.send_quote, migration 15): it draws the nonce from
// its CSPRNG and stores only sha256(token); owners never choose a token. The server passes a 32-byte
// subkey of its secret (never stored) and derives the same 256-bit token from the stored nonce to
// show the link again: token = base64url(HMAC-SHA256(key, "quote-link:v2:" + nonce)).
// Version 1 links (sent before migration 15) used HMAC(secret, "quote-link:" + nonce).
export function quoteLinkKey() {
  return createHmac('sha256', bookingConfig().BOOKING_HASH_SECRET).update('quote-link-key:v2').digest();
}

export function quoteTokenFor(nonce: string, version: number) {
  const token =
    version === 1
      ? createHmac('sha256', bookingConfig().BOOKING_HASH_SECRET).update(`quote-link:${nonce}`).digest('base64url')
      : createHmac('sha256', quoteLinkKey()).update(`quote-link:v2:${nonce}`).digest('base64url');
  return { token, hash: sha256(token) };
}

// Rate limits are keyed on an HMAC of the client IP: the database never sees a raw IP and a
// leaked table can't be reversed by enumerating addresses. Behind Vercel (or any proxy that
// overwrites it) the first x-forwarded-for entry is the client; see docs/PHASE4_BOOKING.md.
export async function clientIpHash() {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || 'unknown';
  return createHmac('sha256', bookingConfig().BOOKING_HASH_SECRET).update(ip).digest();
}
