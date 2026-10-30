import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';

// Test-only helpers. The secret key is read from the local stack at test time and never
// leaves the test process; the app itself has no access to it.
const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
export const local = { url: status.API_URL as string, publishable: status.PUBLISHABLE_KEY as string, secret: status.SECRET_KEY as string, db: status.DB_URL as string };

// Direct database access for fixtures and cleanup only (as the Phase 1 tests do).
export const db = new pg.Pool({ connectionString: local.db, max: 2 });

export const admin: SupabaseClient = createClient(local.url, local.secret, { auth: { persistSession: false, autoRefreshToken: false } });
export const anon = () => createClient(local.url, local.publishable, { auth: { persistSession: false, autoRefreshToken: false } });

export const PASSWORD = 'detailing-is-craft-42';
export const uniqueEmail = (tag: string) => `e2e-${tag}-${randomUUID().slice(0, 8)}@example.com`;

const created = new Set<string>();
export async function createConfirmedUser(email: string, password = PASSWORD) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.add(data.user.id);
  return data.user;
}

export async function invite(email: string) {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error) throw error;
  created.add(data.user.id);
  return data.user;
}

export const track = (id: string) => created.add(id);

// Deleting a user cascades to memberships but not to businesses, so businesses go through the
// database-side deletion helper the Phase 1 tests use.
export async function cleanup() {
  for (const id of created) {
    const { rows } = await db.query('select business_id from public.memberships where user_id = $1', [id]);
    for (const row of rows) await db.query('select app.delete_business_data($1)', [row.business_id]);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  created.clear();
}

type Mail = { subject: string; html: string };
const MAIL = process.env.E2E_MAIL ?? 'mailpit';

async function fetchMail(to: string): Promise<Mail[]> {
  if (MAIL === 'sink') {
    const all = (await (await fetch('http://127.0.0.1:54330/messages')).json()) as { to: string[]; subject: string; html: string }[];
    return all.filter((m) => m.to.includes(to)).map(({ subject, html }) => ({ subject, html }));
  }
  const base = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
  const list = await (await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
  return Promise.all(
    (list.messages ?? []).map(async (m: { ID: string; Subject: string }) => {
      const full = await (await fetch(`${base}/api/v1/message/${m.ID}`)).json();
      return { subject: m.Subject, html: full.HTML as string };
    }),
  );
}

// Waits for an email to `to` whose subject matches, and returns the first link in it.
export async function linkFromEmail(to: string, subject: RegExp, seen = 0): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const mails = (await fetchMail(to)).filter((m) => subject.test(m.subject));
    if (mails.length > seen) {
      const href = mails[mails.length - 1]!.html.match(/href="([^"]+)"/)?.[1];
      if (href) return href.replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No "${subject}" email for ${to}`);
}
