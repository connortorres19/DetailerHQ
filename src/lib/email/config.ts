import 'server-only';
import { z } from 'zod';
import { env } from '@/lib/env';

// Server-only email configuration (Phase 7). Nothing here reaches browser code (test:bundle).
//   EMAIL_WORKER_DATABASE_URL  restricted email_worker login (worker functions only)
//   EMAIL_ENCRYPTION_KEY       32-byte base64 key that encrypts connection credentials
//   EMAIL_WORKER_SECRET        shared secret the database's scheduler sends to the worker route
//   GOOGLE_* / MICROSOFT_*     OAuth apps the operator registers (optional; free)
//   EMAIL_TRANSPORT=mock       local development and tests only: no real provider is contacted
const schema = z.object({
  EMAIL_WORKER_DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\/email_worker[.:@]/, 'must connect as the email_worker role'),
  EMAIL_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64'),
  EMAIL_WORKER_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  EMAIL_TRANSPORT: z.enum(['live', 'mock']).optional(),
  EMAIL_ALLOW_PRIVATE_SMTP: z.enum(['1']).optional(),
});
export type EmailConfig = z.infer<typeof schema> & { mock: boolean; allowPrivateSmtp: boolean; siteUrl: string };

let cached: EmailConfig | null | undefined;

/** Null when email isn't configured on this server: the app works, automatic emails are off. */
export function emailConfig(): EmailConfig | null {
  if (cached !== undefined) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) return (cached = null);
  const siteUrl = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(siteUrl);
  // The mock transport and private SMTP hosts exist for local development and tests; a public site
  // never uses them, whatever the environment says.
  cached = { ...parsed.data, siteUrl, mock: parsed.data.EMAIL_TRANSPORT === 'mock' && local, allowPrivateSmtp: parsed.data.EMAIL_ALLOW_PRIVATE_SMTP === '1' && local };
  return cached;
}

export const providerConfigured = (p: 'google' | 'microsoft', c = emailConfig()) =>
  Boolean(c && (c.mock || (p === 'google' ? c.GOOGLE_CLIENT_ID && c.GOOGLE_CLIENT_SECRET : c.MICROSOFT_CLIENT_ID && c.MICROSOFT_CLIENT_SECRET)));
