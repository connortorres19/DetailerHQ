import 'server-only';
import pg from 'pg';
import { renderEmail, type EmailContext, type EmailLinks } from '@/domain/email';
import { quoteTokenFor, statusTokenFor } from '@/lib/booking/server';
import { emailConfig } from './config';
import { sign } from './crypto';
import { forgetAccessToken } from './oauth';
import { sendMessage, SendError, type Connection } from './transport';

// The background sender. Runs in the server (route /api/email/worker, called every minute by the
// database's scheduler, and right after each change via after()). Connects as email_worker, which
// can only call the email_api functions. Never logs addresses' credentials or tokens.

const BACKOFF_S = [60, 300, 1800, 7200, 21600]; // after attempts 1–5; the 6th failure is final
export const MAX_ATTEMPTS = BACKOFF_S.length + 1;

const globalPool = globalThis as unknown as { emailPool?: pg.Pool };
export function workerPool() {
  const c = emailConfig();
  if (!c) return null;
  globalPool.emailPool ??= new pg.Pool({ connectionString: c.EMAIL_WORKER_DATABASE_URL, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 });
  return globalPool.emailPool;
}

type Job = {
  id: string;
  business_id: string;
  template: string;
  category: string;
  recipient: string;
  attempts: number;
  provider: 'google' | 'microsoft' | 'smtp' | null;
  connection_status: 'pending' | 'verified' | 'needs_attention' | null;
  from_address: string | null;
  from_name: string | null;
  secret: Buffer | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_security: string | null;
};

export type RunResult = { sent: number; retried: number; failed: number; held: number; skipped: number };

let running: Promise<RunResult> | null = null;

/** Sends due emails. Concurrent calls in one process share the run; other processes are safe too (SKIP LOCKED). */
export function processDue(opts: { only?: string; limit?: number } = {}): Promise<RunResult> {
  if (opts.only) return run(opts);
  running ??= run(opts).finally(() => (running = null));
  return running;
}

async function run({ only, limit = 25 }: { only?: string; limit?: number }): Promise<RunResult> {
  const pool = workerPool();
  const out: RunResult = { sent: 0, retried: 0, failed: 0, held: 0, skipped: 0 };
  if (!pool) return out;
  if (!only) await pool.query('select email_api.schedule_daily()');
  const { rows } = await pool.query<Job>('select * from email_api.claim($1, $2)', [limit, only ?? null]);
  for (const job of rows) {
    try {
      const status = await deliver(pool, job);
      out[status] += 1;
    } catch {
      // Unexpected: the lock expires and the job is picked up again.
      out.retried += 1;
    }
  }
  return out;
}

async function finish(pool: pg.Pool, id: string, status: string, error: string | null = null, messageId: string | null = null, retryAt: Date | null = null) {
  await pool.query('select email_api.finish($1, $2, $3, $4, $5)', [id, status, error, messageId, retryAt]);
}

async function deliver(pool: pg.Pool, job: Job): Promise<keyof RunResult> {
  if (!job.provider || !job.secret || !job.from_address) {
    await finish(pool, job.id, 'skipped', 'email is not connected');
    return 'skipped';
  }
  // Nothing is sent from an unverified connection, except the test that verifies an OAuth one.
  if (job.connection_status !== 'verified' && !(job.template === 'connection_test' && job.connection_status === 'pending' && job.provider !== 'smtp')) {
    await finish(pool, job.id, 'held', job.connection_status === 'needs_attention' ? 'email needs attention' : 'email not verified yet');
    return 'held';
  }
  const { rows } = await pool.query<{ context: EmailContext & { skip?: string; business: { id: string; slug: string | null } } }>('select email_api.context($1) as context', [job.id]);
  const ctx = rows[0]!.context;
  if (ctx.skip) {
    await finish(pool, job.id, 'skipped', ctx.skip);
    return 'skipped';
  }

  const links = linksFor(job, ctx);
  const rendered = renderEmail(ctx, links);
  const headers: Record<string, string> = { 'X-DetailerHQ-Email': job.id };
  if (links.unsubscribe) {
    headers['List-Unsubscribe'] = `<${links.unsubscribe.replace('/u/', '/api/email/unsubscribe/')}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  const conn: Connection = {
    businessId: job.business_id,
    provider: job.provider,
    fromAddress: job.from_address,
    fromName: job.from_name ?? (ctx.business as { name: string }).name,
    secret: job.secret,
    smtpHost: job.smtp_host,
    smtpPort: job.smtp_port,
    smtpUsername: job.smtp_username,
    smtpSecurity: job.smtp_security,
  };
  try {
    const res = await sendMessage(conn, { to: job.recipient, subject: rendered.subject, html: rendered.html, text: rendered.text, headers }, async (secret) => {
      await pool.query('select email_api.update_secret($1, $2)', [job.business_id, secret]);
    });
    await finish(pool, job.id, 'sent', null, res.messageId);
    if (job.template === 'connection_test' && job.connection_status === 'pending') await pool.query('select email_api.mark_verified($1)', [job.business_id]);
    return 'sent';
  } catch (e) {
    const err = e instanceof SendError ? e : new SendError('Sending failed unexpectedly.', 'transient');
    if (err.kind === 'auth') {
      forgetAccessToken(job.business_id);
      await pool.query('select email_api.connection_failed($1, $2)', [job.business_id, err.message]);
      await finish(pool, job.id, job.template === 'connection_test' ? 'failed' : 'held', err.message);
      return job.template === 'connection_test' ? 'failed' : 'held';
    }
    if (err.kind === 'transient' && job.attempts < MAX_ATTEMPTS) {
      await finish(pool, job.id, 'queued', err.message, null, new Date(Date.now() + BACKOFF_S[job.attempts - 1]! * 1000));
      return 'retried';
    }
    await finish(pool, job.id, 'failed', err.message);
    return 'failed';
  }
}

function linksFor(job: Job, ctx: EmailContext & { business: { id: string; slug: string | null } }): EmailLinks {
  const site = emailConfig()!.siteUrl;
  const links: EmailLinks = { logo: (ctx.business as { logo: string | null }).logo ? `${site}/media/${(ctx.business as { logo: string }).logo}.png` : null };
  const raw = ctx as unknown as { request?: { link_key?: string | null; id?: string }; appointment?: { link_key?: string | null }; quote?: { nonce?: string | null; link_version?: number | null } };
  if (job.category === 'owner') {
    links.dashboard = `${site}/app/settings/notifications`;
    const refs = ctx as unknown as { lead?: unknown; quote?: unknown; summary?: unknown; overdue?: unknown };
    const path =
      job.template === 'owner_new_lead' ? '/app/leads' : refs.quote ? '/app/quotes' : job.template === 'owner_overdue_followups' ? '/app/follow-ups' : job.template === 'owner_daily_summary' ? '/app/calendar' : '/app/bookings';
    links.action = { label: 'Open DetailerHQ', url: `${site}${path}` };
    return links;
  }
  if (job.template === 'connection_test') return links;
  const linkKey = raw.request?.link_key ?? raw.appointment?.link_key;
  if (job.template.startsWith('quote_')) {
    const q = raw.quote;
    if (q?.nonce && q.link_version && ['quote_sent', 'quote_expiring', 'quote_accepted'].includes(job.template))
      links.action = { label: job.template === 'quote_accepted' ? 'View your quote' : 'Review your quote', url: `${site}/q/${quoteTokenFor(q.nonce, q.link_version).token}` };
    if (job.category === 'follow_up') links.unsubscribe = `${site}/u/${sign('unsubscribe', { b: job.business_id, e: job.recipient, c: 'follow_up' })}`;
    return links;
  }
  if (linkKey) {
    links.action = {
      label: job.template === 'time_proposed' ? 'Accept or decline the new time' : 'View your booking',
      url: `${site}/r/${statusTokenFor(linkKey).token}`,
    };
  }
  return links;
}
