'use client';

import Link from 'next/link';
import { startTransition, useActionState, useState } from 'react';
import { CheckCircle2, AlertTriangle, Mail, Send } from 'lucide-react';
import { Button, ButtonLink } from '@/components/app/ui/Button';
import { SelectField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { CUSTOMER_TEMPLATES, OWNER_TEMPLATES, REMINDER_CHOICES } from '@/domain/email';
import { idle, type FormState } from '@/domain/forms';
import { cancelEmail, connectSmtp, disconnectEmail, resendCode, retryEmail, saveCustomerEmails, saveOwnerPrefs, sendTestEmail, verifyCode } from './actions';
import styles from './notifications.module.css';

type Conn = {
  provider: 'google' | 'microsoft' | 'smtp';
  from_address: string;
  from_name: string | null;
  status: 'pending' | 'verified' | 'needs_attention';
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  verification_expires_at: string | null;
  verified_at: string | null;
  last_error: string | null;
  last_sent_at: string | null;
};

const PROVIDER = { google: 'Gmail / Google Workspace', microsoft: 'Outlook / Microsoft 365', smtp: 'Your own domain (SMTP)' } as const;

function Status({ state }: { state: FormState }) {
  if (state.status === 'success') return <Notice tone="positive">{state.message}</Notice>;
  if (state.status === 'error') return <Notice tone="critical">{state.message}</Notice>;
  return null;
}

export function ConnectionPanel({ connection, google, microsoft, configured }: { connection: Conn | null; businessName: string; google: boolean; microsoft: boolean; configured: boolean }) {
  const [testState, test, testing] = useActionState(sendTestEmail, idle);
  const [discState, disconnect, disconnecting] = useActionState(disconnectEmail, idle);
  const [confirm, setConfirm] = useState(false);
  const [change, setChange] = useState(false);

  if (!connection || change) {
    return (
      <div className={styles.stack}>
        <Status state={discState} />
        <p>Connect the email account you already use. Customers get emails from your address, and replies come straight to you. DetailerHQ can only <strong>send</strong> — it never reads your inbox.</p>
        <div className={styles.providers}>
          <ProviderButton href="/app/settings/notifications/connect/google" enabled={google} label="Connect Gmail or Google Workspace" />
          <ProviderButton href="/app/settings/notifications/connect/microsoft" enabled={microsoft} label="Connect Outlook or Microsoft 365" />
        </div>
        <details className={styles.smtp} open={!google && !microsoft && configured}>
          <summary>Use another email address (your own domain, via SMTP)</summary>
          <SmtpForm />
        </details>
        {change ? (
          <Button type="button" variant="ghost" onClick={() => setChange(false)}>
            Keep the current account
          </Button>
        ) : null}
      </div>
    );
  }

  const state = connection.status;
  return (
    <div className={styles.stack}>
      <div className={styles.account} data-status={state}>
        <span className={styles.accountIcon} aria-hidden="true">
          {state === 'verified' ? <CheckCircle2 size={20} /> : state === 'needs_attention' ? <AlertTriangle size={20} /> : <Mail size={20} />}
        </span>
        <div>
          <p className={styles.accountAddress}>{connection.from_address}</p>
          <p className={styles.muted}>
            {PROVIDER[connection.provider]}
            {connection.provider === 'smtp' ? ` · ${connection.smtp_host}:${connection.smtp_port}` : ''} ·{' '}
            <span className={styles.badge} data-tone={state === 'verified' ? 'positive' : state === 'needs_attention' ? 'critical' : 'attention'}>
              {state === 'verified' ? 'Connected' : state === 'needs_attention' ? 'Needs attention' : 'Waiting for verification'}
            </span>
            {connection.last_sent_at ? ` · last sent ${new Date(connection.last_sent_at).toLocaleString()}` : ''}
          </p>
        </div>
      </div>
      {state === 'needs_attention' ? (
        <Notice tone="critical">
          Emails are on hold: {connection.last_error ?? 'the provider refused the connection.'} Reconnect to send them (held emails from the last 24 hours, and upcoming reminders, will go out).
        </Notice>
      ) : null}
      {state === 'pending' && connection.provider === 'smtp' ? <CodeForm address={connection.from_address} /> : null}
      {state === 'pending' && connection.provider !== 'smtp' ? <Notice tone="attention">The test email didn’t go through yet, so automatic emails are off. Send a test to try again.</Notice> : null}
      <Status state={testState} />
      <Status state={discState} />
      <div className={styles.buttons}>
        {state !== 'pending' || connection.provider !== 'smtp' ? (
          <Button type="button" icon={<Send size={14} aria-hidden="true" />} disabled={testing} onClick={() => startTransition(() => test())}>
            {testing ? 'Sending…' : 'Send test email'}
          </Button>
        ) : null}
        {state === 'needs_attention' && connection.provider !== 'smtp' ? (
          <ButtonLink href={`/app/settings/notifications/connect/${connection.provider}`} variant="primary" native>
            Reconnect
          </ButtonLink>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => setChange(true)}>
          {state === 'needs_attention' && connection.provider === 'smtp' ? 'Reconnect' : 'Use a different account'}
        </Button>
        {!confirm ? (
          <Button type="button" variant="ghost" onClick={() => setConfirm(true)}>
            Disconnect
          </Button>
        ) : null}
      </div>
      {confirm ? (
        <div className={styles.confirm} role="group" aria-label="Disconnect email">
          <p>Disconnect {connection.from_address}? Its saved login is deleted, waiting emails are cancelled, and automatic emails stop until you connect again.</p>
          <div className={styles.buttons}>
            <Button type="button" variant="danger" disabled={disconnecting} onClick={() => (setConfirm(false), startTransition(() => disconnect()))}>
              Disconnect
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProviderButton({ href, enabled, label }: { href: string; enabled: boolean; label: string }) {
  return enabled ? (
    <ButtonLink href={href} native>
      {label}
    </ButtonLink>
  ) : (
    <span className={styles.unavailable} title="Not set up on this server yet">
      <Button type="button" disabled>
        {label}
      </Button>
      <span className={styles.muted}>Not set up on this server yet</span>
    </span>
  );
}

function SmtpForm() {
  const [state, action] = useActionState(connectSmtp, idle);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className={styles.form} noValidate autoComplete="off">
      <p className={styles.muted}>
        Use the outgoing (SMTP) settings from your email host. Many hosts need an <strong>app password</strong> rather than your normal password. We email a code to the address to
        prove it’s yours; the password is stored encrypted and never shown again.
      </p>
      <Status state={state.status === 'error' ? state : idle} />
      <div className={styles.grid2}>
        <TextField name="fromAddress" label="Send from (email address)" type="email" defaultValue={v.fromAddress} error={e.fromAddress} />
        <TextField name="fromName" label="Sender name (optional)" defaultValue={v.fromName} error={e.fromName} />
      </div>
      <div className={styles.grid3}>
        <TextField name="host" label="SMTP server" placeholder="smtp.yourdomain.com" defaultValue={v.host} error={e.host} autoCapitalize="none" spellCheck={false} />
        <SelectField
          name="port"
          label="Port"
          defaultValue={v.port ?? '587'}
          error={e.port}
          options={[
            { value: '587', label: '587 (STARTTLS)' },
            { value: '465', label: '465 (SSL)' },
            { value: '2525', label: '2525' },
          ]}
        />
      </div>
      <div className={styles.grid2}>
        <TextField name="username" label="Username" defaultValue={v.username} error={e.username} autoCapitalize="none" spellCheck={false} />
        <TextField name="password" label="Password or app password" type="password" error={e.password} autoComplete="new-password" />
      </div>
      <div className={styles.buttons}>
        <SubmitButton pendingLabel="Checking…">Connect and send code</SubmitButton>
      </div>
    </form>
  );
}

function CodeForm({ address }: { address: string }) {
  const [state, action] = useActionState(verifyCode, idle);
  const [resent, resend, resending] = useActionState(resendCode, idle);
  return (
    <form action={action} className={styles.form}>
      <p>Enter the 6-digit code we emailed to {address}.</p>
      <Status state={state.status === 'error' && !state.fieldErrors ? state : idle} />
      <Status state={resent} />
      <div className={styles.codeRow}>
        <TextField name="code" label="Verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} error={state.fieldErrors?.code} />
        <SubmitButton pendingLabel="Checking…">Verify</SubmitButton>
      </div>
      <Button type="button" variant="ghost" size="sm" disabled={resending} onClick={() => startTransition(() => resend())}>
        Send a new code
      </Button>
    </form>
  );
}

export function CustomerEmailsForm({ templates, reminderHours }: { templates: ((typeof CUSTOMER_TEMPLATES)[number] & { enabled: boolean; customised: boolean })[]; reminderHours: number[] }) {
  const [state, action] = useActionState(saveCustomerEmails, idle);
  const [hours, setHours] = useState<number[]>(reminderHours);
  return (
    <form action={action} className={styles.form}>
      <Status state={state} />
      <ul className={styles.toggles} role="list">
        {templates.map((t) => (
          <li key={t.key}>
            <label className={styles.toggle}>
              <input type="checkbox" name={`t_${t.key}`} defaultChecked={t.enabled} />
              <span>
                <span className={styles.toggleLabel}>{t.label}</span>
                <span className={styles.muted}>{t.when}</span>
              </span>
            </label>
            <Link href={`/app/settings/notifications/templates/${t.key}`} className={styles.edit}>
              {t.customised ? 'Edited' : 'Edit'}
              <span className="visually-hidden"> {t.label} email</span>
            </Link>
          </li>
        ))}
      </ul>
      <fieldset className={styles.fieldset}>
        <legend>Send appointment reminders (choose up to two)</legend>
        <div className={styles.chips}>
          {REMINDER_CHOICES.map((h) => (
            <label key={h} className={styles.chip}>
              <input
                type="checkbox"
                name="reminder"
                value={h}
                checked={hours.includes(h)}
                disabled={!hours.includes(h) && hours.length >= 2}
                onChange={(e) => setHours((cur) => (e.target.checked ? [...cur, h] : cur.filter((x) => x !== h)))}
              />
              {h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'} before` : `${h} hours before`}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={styles.buttons}>
        <SubmitButton pendingLabel="Saving…">Save customer emails</SubmitButton>
      </div>
    </form>
  );
}

export function OwnerPrefsForm({ templates, summaryHour }: { templates: ((typeof OWNER_TEMPLATES)[number] & { enabled: boolean })[]; summaryHour: number }) {
  const [state, action] = useActionState(saveOwnerPrefs, idle);
  return (
    <form action={action} className={styles.form}>
      <Status state={state} />
      <ul className={styles.toggles} role="list">
        {templates.map((t) => (
          <li key={t.key}>
            <label className={styles.toggle}>
              <input type="checkbox" name={`o_${t.key}`} defaultChecked={t.enabled} />
              <span>
                <span className={styles.toggleLabel}>{t.label}</span>
                <span className={styles.muted}>{t.when}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className={styles.narrow}>
        <SelectField
          name="summaryHour"
          label="Send daily emails at"
          defaultValue={String(summaryHour)}
          options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: new Date(2026, 0, 1, h).toLocaleTimeString('en-US', { hour: 'numeric' }) }))}
        />
      </div>
      <div className={styles.buttons}>
        <SubmitButton pendingLabel="Saving…">Save my notifications</SubmitButton>
      </div>
    </form>
  );
}

const LABEL: Record<string, string> = { ...Object.fromEntries([...CUSTOMER_TEMPLATES, ...OWNER_TEMPLATES].map((t) => [t.key, t.label])), connection_test: 'Test email' };
const STATUS: Record<string, { label: string; tone: string }> = {
  queued: { label: 'Scheduled', tone: 'neutral' },
  sending: { label: 'Sending', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'positive' },
  failed: { label: 'Failed', tone: 'critical' },
  held: { label: 'On hold', tone: 'attention' },
  skipped: { label: 'Not sent', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

type Row = { id: string; template: string; recipient: string; status: string; attempts: number; last_error: string | null; created_at: string; sent_at: string | null; next_attempt_at: string };

export function Activity({ rows, timezone }: { rows: Row[]; timezone: string }) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (!rows.length) return <p className={styles.muted}>No emails yet. They’ll appear here as bookings, quotes and reminders happen.</p>;
  return (
    <ul className={styles.activity} role="list" aria-label="Email activity">
      {rows.map((r) => (
        <ActivityRow key={r.id} r={r} when={fmt.format(new Date(r.status === 'queued' ? r.next_attempt_at : (r.sent_at ?? r.created_at)))} />
      ))}
    </ul>
  );
}

function ActivityRow({ r, when }: { r: Row; when: string }) {
  const [retryState, retry, retrying] = useActionState(async () => retryEmail(r.id), idle);
  const [cancelState, cancel, cancelling] = useActionState(async () => cancelEmail(r.id), idle);
  const s = STATUS[r.status] ?? STATUS.queued!;
  return (
    <li className={styles.activityRow} data-status={r.status}>
      <div>
        <p className={styles.strong}>{LABEL[r.template] ?? r.template}</p>
        <p className={styles.muted}>
          To {r.recipient} · {r.status === 'queued' ? `scheduled for ${when}` : when}
          {r.attempts > 1 ? ` · ${r.attempts} attempts` : ''}
        </p>
        {r.last_error && ['failed', 'held', 'skipped', 'queued'].includes(r.status) ? <p className={styles.error}>{r.last_error}</p> : null}
        {retryState.status === 'error' ? <p className={styles.error}>{retryState.message}</p> : null}
        {cancelState.status === 'error' ? <p className={styles.error}>{cancelState.message}</p> : null}
      </div>
      <div className={styles.rowActions}>
        <span className={styles.badge} data-tone={s.tone}>
          {s.label}
        </span>
        {r.status === 'failed' || r.status === 'held' ? (
          <Button type="button" size="sm" disabled={retrying} onClick={() => startTransition(() => retry())}>
            Retry<span className="visually-hidden"> {LABEL[r.template]} to {r.recipient}</span>
          </Button>
        ) : null}
        {['queued', 'held', 'failed'].includes(r.status) ? (
          <Button type="button" size="sm" variant="ghost" disabled={cancelling} onClick={() => startTransition(() => cancel())}>
            Cancel<span className="visually-hidden"> {LABEL[r.template]} to {r.recipient}</span>
          </Button>
        ) : null}
      </div>
    </li>
  );
}
