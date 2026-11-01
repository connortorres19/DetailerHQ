'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { checkCustomText, CUSTOMER_TEMPLATES, OWNER_TEMPLATES, REMINDER_CHOICES } from '@/domain/email';
import { failed, type FormState } from '@/domain/forms';
import { requireBusiness } from '@/data/session';
import { describeDbError } from '@/data/workflow';
import { emailConfig } from '@/lib/email/config';
import { byteaHex, decryptCredentials, encryptCredentials, toBuffer } from '@/lib/email/crypto';
import { forgetAccessToken, revoke } from '@/lib/email/oauth';
import { checkSmtpHost, SMTP_PORTS } from '@/lib/email/smtp-guard';
import { checkSmtpLogin, sendMessage, SendError } from '@/lib/email/transport';
import { processDue, workerPool } from '@/lib/email/worker';
import { createClient } from '@/lib/supabase/server';

const PATH = '/app/settings/notifications';
const ok = (message: string, extra: Record<string, string> = {}): FormState => ({ status: 'success', message, values: { at: String(Date.now()), ...extra } });
const notConfigured = () => failed('Email isn’t set up on this server yet (see docs/PHASE7_EMAIL.md).');

// --- SMTP (custom domain) -------------------------------------------------------------------------

const smtpSchema = z.object({
  fromAddress: z.string().trim().toLowerCase().pipe(z.email('Enter the address customers will see emails from.')),
  fromName: z.string().trim().max(80, 'Use 80 characters or fewer.').optional().default(''),
  host: z.string().trim().toLowerCase().min(3, 'Enter your mail server, like smtp.yourdomain.com.').max(253),
  port: z.coerce.number().refine((p) => (SMTP_PORTS as readonly number[]).includes(p), 'Use port 465 (SSL) or 587 (STARTTLS).'),
  username: z.string().trim().min(1, 'Enter the login (usually your full email address).').max(254),
  password: z.string().min(1, 'Enter the password or app password.').max(500),
});

// Save the SMTP details (encrypted), check the login by sending a one-time code to the sending
// address, and wait for the owner to type it in. Nothing else is sent until then.
export async function connectSmtp(_: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness(PATH);
  const c = emailConfig();
  if (!c) return notConfigured();
  const parsed = smtpSchema.safeParse(Object.fromEntries(formData));
  const values = Object.fromEntries([...formData.entries()].filter(([k]) => k !== 'password').map(([k, v]) => [k, String(v)]));
  if (!parsed.success) return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])), values };
  const v = parsed.data;
  const host = await checkSmtpHost(v.host, c.allowPrivateSmtp);
  if (!host.ok) return { status: 'error', message: host.message, fieldErrors: { host: host.message }, values };

  // Check the login first (nothing is saved, so a mistake never replaces a working connection).
  try {
    await checkSmtpLogin({ smtpHost: v.host, smtpPort: v.port, smtpUsername: v.username }, v.password);
  } catch (e) {
    const err = e instanceof SendError ? e : null;
    const message = err?.kind === 'auth' ? 'The mail server refused the login. Check the username and password (many hosts need an app password).' : (err?.message ?? 'Couldn’t connect to that server.');
    return { status: 'error', message, values };
  }
  forgetAccessToken(business.id);
  const supabase = await createClient();
  const secret = encryptCredentials(business.id, 'smtp', { password: v.password });
  const saved = await supabase.rpc('save_email_connection', {
    p_provider: 'smtp', p_from: v.fromAddress, p_from_name: v.fromName || business.name, p_secret: byteaHex(secret),
    p_smtp_host: v.host, p_smtp_port: v.port, p_smtp_username: v.username,
  });
  if (saved.error) return { status: 'error', message: describeDbError(saved.error).message, values };
  return sendCode(business.id, business.name, values);
}

async function sendCode(businessId: string, businessName: string, values: Record<string, string> = {}): Promise<FormState> {
  const pool = workerPool();
  if (!pool) return notConfigured();
  const { rows: [conn] } = await pool.query('select * from email_api.connection($1)', [businessId]);
  if (!conn || conn.provider !== 'smtp') return failed('Connect your email first.');
  const { rows: [{ code }] } = await pool.query('select email_api.start_verification($1) as code', [businessId]);
  try {
    await sendMessage(
      { businessId, provider: 'smtp', fromAddress: conn.from_address, fromName: conn.from_name, secret: toBuffer(conn.secret), smtpHost: conn.smtp_host, smtpPort: conn.smtp_port, smtpUsername: conn.smtp_username },
      {
        to: conn.from_address,
        subject: `Your DetailerHQ code: ${code}`,
        text: `Enter ${code} in DetailerHQ to finish connecting ${conn.from_address} for ${businessName}.\n\nThe code expires in 30 minutes. If you didn’t ask for this, ignore this email.`,
        html: `<p>Enter <strong style="font-size:20px;letter-spacing:2px">${code}</strong> in DetailerHQ to finish connecting ${conn.from_address} for ${businessName.replace(/[<>&]/g, '')}.</p><p>The code expires in 30 minutes. If you didn’t ask for this, ignore this email.</p>`,
      },
      async () => undefined,
    );
  } catch (e) {
    const err = e instanceof SendError ? e : null;
    revalidatePath(PATH);
    return { status: 'error', message: err?.kind === 'auth' ? 'The mail server refused the login. Check the username and password (many hosts need an app password).' : (err?.message ?? 'Couldn’t send through that server.'), values };
  }
  revalidatePath(PATH);
  return ok(`We sent a 6-digit code to ${conn.from_address}. Enter it below.`, { codeSent: '1' });
}

export async function resendCode(): Promise<FormState> {
  const { business } = await requireBusiness(PATH);
  return sendCode(business.id, business.name);
}

export async function verifyCode(_: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness(PATH);
  const code = String(formData.get('code') ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { status: 'error', message: 'Enter the 6-digit code.', fieldErrors: { code: 'Enter the 6-digit code.' } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('verify_email_code', { p_code: code });
  if (error) return failed(error.message.includes('expired') ? 'That code expired. Send a new one.' : 'There’s no code waiting — connect again.');
  if (!data) return { status: 'error', message: 'That code isn’t right.', fieldErrors: { code: 'That code isn’t right.' } };
  revalidatePath(PATH);
  redirect(`${PATH}?email=smtp_verified`); // the code form is replaced by the connected view
}

// --- Any connection --------------------------------------------------------------------------------

export async function sendTestEmail(): Promise<FormState> {
  await requireBusiness(PATH);
  if (!emailConfig()) return notConfigured();
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc('queue_test_email');
  if (error) return failed(describeDbError(error).kind === 'rate_limited' ? 'Too many test emails. Try again in an hour.' : 'Connect your email first.');
  await processDue({ only: id! });
  const { data } = await supabase.from('email_outbox').select('status, last_error, recipient').eq('id', id!).single();
  revalidatePath(PATH);
  return data?.status === 'sent' ? ok(`Test email sent to ${data.recipient}.`) : failed(`The test email didn’t send: ${data?.last_error ?? 'unknown error'}.`);
}

export async function disconnectEmail(): Promise<FormState> {
  const { business } = await requireBusiness(PATH);
  const pool = workerPool();
  // Revoke at the provider where possible (Google); then delete the credentials.
  if (pool) {
    const { rows: [conn] } = await pool.query('select * from email_api.connection($1)', [business.id]);
    if (conn && conn.provider === 'google') {
      try {
        const creds = decryptCredentials(business.id, 'google', toBuffer(conn.secret));
        if ('refreshToken' in creds) await revoke('google', creds.refreshToken);
      } catch {
        /* unreadable credentials: nothing to revoke */
      }
    }
  }
  forgetAccessToken(business.id);
  const supabase = await createClient();
  const { error } = await supabase.rpc('disconnect_email');
  if (error) return failed(describeDbError(error).message);
  revalidatePath(PATH);
  return ok('Email disconnected. Automatic emails are off until you connect again.');
}

// --- Preferences ----------------------------------------------------------------------------------

export async function saveCustomerEmails(_: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness(PATH);
  const hours = formData.getAll('reminder').map(Number).filter((h) => (REMINDER_CHOICES as readonly number[]).includes(h));
  if (hours.length > 2) return failed('Choose up to two reminder times.');
  const templates = Object.fromEntries(CUSTOMER_TEMPLATES.map((t) => [t.key, formData.get(`t_${t.key}`) === 'on']));
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_email_settings', { p_reminder_hours: hours, p_templates: templates });
  if (error) return failed(describeDbError(error).message);
  revalidatePath(PATH);
  return ok('Customer emails saved.');
}

export async function saveOwnerPrefs(_: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness(PATH);
  const prefs = Object.fromEntries(OWNER_TEMPLATES.map((t) => [t.key, formData.get(`o_${t.key}`) === 'on']));
  const hour = Number(formData.get('summaryHour'));
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return failed('Choose a time for the daily email.');
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_owner_email_prefs', { p_prefs: prefs, p_summary_hour: hour });
  if (error) return failed(describeDbError(error).message);
  revalidatePath(PATH);
  return ok('Your notifications are saved.');
}

export async function saveTemplate(template: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness(PATH);
  if (!CUSTOMER_TEMPLATES.some((t) => t.key === template)) return failed('Unknown email.');
  const v = { subject: String(formData.get('subject') ?? '').trim(), intro: String(formData.get('intro') ?? '').trim(), signoff: String(formData.get('signoff') ?? '').trim() };
  const fieldErrors: Record<string, string> = {};
  for (const k of ['subject', 'intro', 'signoff'] as const) {
    const problem = v[k] ? checkCustomText(k, v[k]) : null;
    if (problem) fieldErrors[k] = problem;
  }
  if (Object.keys(fieldErrors).length) return { status: 'error', message: 'Check the highlighted fields.', fieldErrors, values: v };
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_email_template', { p_template: template as never, p_subject: v.subject, p_intro: v.intro, p_signoff: v.signoff });
  if (error) return { status: 'error', message: describeDbError(error).message, values: v };
  revalidatePath(PATH);
  return ok('Email saved.', v);
}

export async function retryEmail(id: string): Promise<FormState> {
  await requireBusiness(PATH);
  const supabase = await createClient();
  const { error } = await supabase.rpc('retry_email', { p_id: id });
  if (error) return failed(error.message.includes('verify') ? 'Connect and verify your email first.' : 'Only failed or waiting emails can be retried.');
  await processDue({ only: id });
  revalidatePath(PATH);
  return ok('Retried.');
}

export async function cancelEmail(id: string): Promise<FormState> {
  await requireBusiness(PATH);
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_email', { p_id: id });
  if (error) return failed('This email can no longer be cancelled.');
  revalidatePath(PATH);
  return ok('Cancelled.');
}
