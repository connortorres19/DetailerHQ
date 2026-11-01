import 'server-only';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { emailConfig } from './config';

// Connection credentials (OAuth refresh tokens, SMTP passwords) are encrypted here, before the
// database sees them: AES-256-GCM, a random 96-bit IV per value, and the business id + provider as
// associated data — a ciphertext copied to another business's row won't decrypt. Format:
// 0x01 | iv (12) | tag (16) | ciphertext.

export type Credentials = { refreshToken: string } | { password: string };

const key = () => Buffer.from(emailConfig()!.EMAIL_ENCRYPTION_KEY, 'base64');
const aad = (businessId: string, provider: string) => Buffer.from(`detailerhq-email:v1:${businessId}:${provider}`);

export function encryptCredentials(businessId: string, provider: string, creds: Credentials): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(aad(businessId, provider));
  const body = Buffer.concat([cipher.update(JSON.stringify(creds), 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), body]);
}

export function decryptCredentials(businessId: string, provider: string, blob: Buffer): Credentials {
  if (blob.length < 30 || blob[0] !== 1) throw new Error('credentials: unknown format');
  const decipher = createDecipheriv('aes-256-gcm', key(), blob.subarray(1, 13));
  decipher.setAAD(aad(businessId, provider));
  decipher.setAuthTag(blob.subarray(13, 29));
  return JSON.parse(Buffer.concat([decipher.update(blob.subarray(29)), decipher.final()]).toString('utf8')) as Credentials;
}

/** Postgres bytea literal for supabase-js / PostgREST. */
export const byteaHex = (b: Buffer) => `\\x${b.toString('hex')}`;
/** node-postgres returns bytea as Buffer; PostgREST as \x… text. */
export const toBuffer = (v: unknown) => (Buffer.isBuffer(v) ? v : Buffer.from(String(v).replace(/^\\x/, ''), 'hex'));

// --- Signed values (OAuth state, unsubscribe links) -----------------------------------------------

const signingKey = (purpose: string) => createHmac('sha256', emailConfig()!.EMAIL_ENCRYPTION_KEY).update(`detailerhq:${purpose}`).digest();

export function sign(purpose: string, payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${createHmac('sha256', signingKey(purpose)).update(body).digest('base64url')}`;
}

export function verify<T>(purpose: string, token: string | null | undefined): T | null {
  if (!token || token.length > 2000) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', signingKey(purpose)).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
