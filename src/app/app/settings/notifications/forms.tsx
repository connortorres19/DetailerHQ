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
import { cancelEmail, disconnectEmail, resendCode, retryEmail, saveCustomerEmails, saveOwnerPrefs, sendTestEmail, smtpConnection, testSavedConnection, verifyCode } from './actions';
import styles from './notifications.module.css';

type Conn = {
  provider: 'google' | 'microsoft' | 'smtp';
  from_address: string;
  from_name: string | null;
  status: 'pending' | 'verified' | 'needs_attention';
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_security: string | null;
  verification_expires_at: string | null;
  verified_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  last_sent_at: string | null;
};

const PROVIDER = { google: 'Gmail (Google sign-in)', microsoft: 'Microsoft 365 (Microsoft sign-in)', smtp: 'SMTP' } as const;
const SECURITY: Record<string, string> = { starttls: 'STARTTLS', ssl: 'SSL/TLS' };

function Status({ state }: { state: FormState }) {
  if (state.status === 'success') return <Notice tone="positive">{state.message}</Notice>;
  if (state.status === 'error') return <Notice tone="critical">{state.message}</Notice>;
  return null;
}

const latest = (...dates: (string | null)[]) => dates.filter(Boolean).sort().at(-1) ?? null;

export function ConnectionPanel({ connection, oauth, configured, timezone }: { connection: Conn | null; oauth: { google: boolean; microsoft: boolean }; configured: boolean; timezone: string }) {
  const [testState, test, testing] = useActionState(sendTestEmail, idle);
  const [checkState, check, checking] = useActionState(testSavedConnection, idle);
  const [discState, disconnect, disconnecting] = useActionState(disconnectEmail, idle);
  const [confirm, setConfirm] = useState(false);
  const [change, setChange] = useState(false);
  const fmt = (d: string) => new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(d));

  if (!connection || change) {
    const replacing = connection && change;
    return (
      <div className={styles.stack}>
        <Status state={discState} />
        {!configured ? <Notice tone="attention">Email sending isn’t set up on this server yet, so connecting is unavailable. Everything else works.</Notice> : null}
        <p>
          {replacing
            ? 'Enter the new details. Your current connection keeps working until the new one is checked.'
            : 'Customers get emails from your address, and their replies come straight to you. DetailerHQ only sends — it never reads your inbox.'}
        </p>
        <SmtpForm initial={replacing && connection.provider === 'smtp' ? connection : null} />
        {oauth.google || oauth.microsoft ? (
          <div className={styles.providers}>
            {oauth.google ? <ButtonLink href="/app/settings/notifications/connect/google" variant="ghost" native>Sign in with Google instead</ButtonLink> : null}
            {oauth.microsoft ? <ButtonLink href="/app/settings/notifications/connect/microsoft" variant="ghost" native>Sign in with Microsoft instead</ButtonLink> : null}
          </div>
        ) : null}
        {change ? (
          <Button type="button" variant="ghost" onClick={() => setChange(false)}>
            Keep the current settings
          </Button>
        ) : null}
      </div>
    );
  }

  const state = connection.status;
  const smtp = connection.provider === 'smtp';
  const lastOk = smtp ? latest(connection.last_checked_at, connection.last_sent_at, connection.verified_at) : latest(connection.last_sent_at, connection.verified_at);
  return (
    <div className={styles.stack}>
      <div className={styles.account} data-status={state}>
        <span className={styles.accountIcon} aria-hidden="true">
          {state === 'verified' ? <CheckCircle2 size={20} /> : state === 'needs_attention' ? <AlertTriangle size={20} /> : <Mail size={20} />}
        </span>
        <div className={styles.accountBody}>
          <p className={styles.accountAddress}>{connection.from_address}</p>
          <p>
            <span className={styles.badge} data-tone={state === 'verified' ? 'positive' : state === 'needs_attention' ? 'critical' : 'attention'}>
              {state === 'verified' ? 'Connected' : state === 'needs_attention' ? 'Needs attention' : 'Waiting for verification'}
            </span>
          </p>
          <dl className={styles.facts}>
            <div>
              <dt>Connection</dt>
              <dd>
                {smtp ? `${connection.smtp_host}, port ${connection.smtp_port}, ${SECURITY[connection.smtp_security ?? (connection.smtp_port === 465 ? 'ssl' : 'starttls')]}` : PROVIDER[connection.provider]}
              </dd>
            </div>
            <div>
              <dt>Last successful connection</dt>
              <dd>{lastOk ? fmt(lastOk) : 'Not yet'}</dd>
            </div>
            {connection.last_sent_at ? (
              <div>
                <dt>Last email sent</dt>
                <dd>{fmt(connection.last_sent_at)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
      {state === 'needs_attention' ? (
        <Notice tone="critical">
          Emails are on hold: {connection.last_error ?? 'the mail server refused the connection.'}{' '}
          {smtp ? 'Select Update password or settings and enter the new password' : 'Connect again'} to send them — held emails from the last 24 hours, and upcoming reminders, will go out.
        </Notice>
      ) : null}
      {state === 'pending' && smtp ? <CodeForm address={connection.from_address} /> : null}
      {state === 'pending' && !smtp ? <Notice tone="attention">The test email didn’t go through yet, so automatic emails are off. Send a test to try again.</Notice> : null}
      <Status state={checkState} />
      <Status state={testState} />
      <Status state={discState} />
      <div className={styles.buttons}>
        {smtp ? (
          <Button type="button" variant={state === 'pending' ? 'ghost' : 'secondary'} disabled={checking} onClick={() => startTransition(() => check())}>
            {checking ? 'Testing…' : 'Test connection'}
          </Button>
        ) : null}
        {state !== 'pending' || !smtp ? (
          <Button type="button" icon={<Send size={14} aria-hidden="true" />} disabled={testing} onClick={() => startTransition(() => test())}>
            {testing ? 'Sending…' : 'Send test email'}
          </Button>
        ) : null}
        {state === 'needs_attention' && connection.provider !== 'smtp' && oauth[connection.provider] ? (
          <ButtonLink href={`/app/settings/notifications/connect/${connection.provider}`} variant="primary" native>
            Reconnect
          </ButtonLink>
        ) : null}
        <Button type="button" variant={state === 'needs_attention' ? 'primary' : 'ghost'} onClick={() => setChange(true)}>
          {smtp ? 'Update password or settings' : 'Switch to SMTP'}
        </Button>
        {!confirm ? (
          <Button type="button" variant="ghost" onClick={() => setConfirm(true)}>
            Disconnect email
          </Button>
        ) : null}
      </div>
      {confirm ? (
        <div className={styles.confirm} role="group" aria-label="Disconnect email">
          <p>Disconnect {connection.from_address}? Its saved password is deleted, waiting emails are cancelled, and automatic emails stop until you connect again.</p>
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

// Typical settings for the common providers (the owner can change any of them).
const PRESETS = {
  gmail: { host: 'smtp.gmail.com', port: '587', security: 'starttls' },
  microsoft: { host: 'smtp.office365.com', port: '587', security: 'starttls' },
  other: null,
} as const;
type Preset = keyof typeof PRESETS;
const presetFor = (host?: string): Preset => (host === PRESETS.gmail.host ? 'gmail' : host === PRESETS.microsoft.host ? 'microsoft' : 'other');

function SmtpForm({ initial }: { initial: Conn | null }) {
  const [state, action, pending] = useActionState(smtpConnection, idle);
  const [intent, setIntent] = useState<'test' | 'connect'>('connect');
  const v = state.values ?? {};
  const start = {
    fromAddress: v.fromAddress ?? initial?.from_address ?? '',
    fromName: v.fromName ?? initial?.from_name ?? '',
    host: v.host ?? initial?.smtp_host ?? '',
    port: v.port ?? (initial?.smtp_port ? String(initial.smtp_port) : '587'),
    security: v.security ?? initial?.smtp_security ?? (initial?.smtp_port === 465 ? 'ssl' : 'starttls'),
    username: v.username ?? initial?.smtp_username ?? '',
  };
  const [provider, setProvider] = useState<Preset>(v.provider ? (v.provider as Preset) : presetFor(start.host));
  const [host, setHost] = useState(start.host);
  const [port, setPort] = useState(start.port);
  const [security, setSecurity] = useState(start.security);
  const e = state.fieldErrors ?? {};

  function choose(p: Preset) {
    setProvider(p);
    const preset = PRESETS[p];
    if (preset) {
      setHost(preset.host);
      setPort(preset.port);
      setSecurity(preset.security);
    } else if (host === PRESETS.gmail.host || host === PRESETS.microsoft.host) setHost('');
  }
  // Port 465 means SSL/TLS and 587 means STARTTLS almost everywhere: follow the port unless the owner picks otherwise.
  function changePort(value: string) {
    setPort(value);
    if (value.trim() === '465') setSecurity('ssl');
    else if (value.trim() === '587') setSecurity('starttls');
  }

  return (
    <form
      className={styles.form}
      noValidate
      autoComplete="off"
      aria-label="SMTP connection"
      onSubmit={(ev) => {
        // Submitted by hand (not as a form action) so the form keeps what was typed — including
        // the password — between "Test connection" and "Connect email". The password stays in
        // this page; the server never sends it back.
        ev.preventDefault();
        const submitter = (ev.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const fd = new FormData(ev.currentTarget);
        const which = submitter?.value === 'test' ? 'test' : 'connect';
        fd.set('intent', which);
        setIntent(which);
        startTransition(() => action(fd));
      }}
    >
      <Status state={state} />
      <SelectField
        name="provider"
        label="Email provider"
        value={provider}
        onChange={(ev) => choose(ev.target.value as Preset)}
        hint="Choosing Gmail or Outlook fills in their usual settings. You can change any of them."
        options={[
          { value: 'gmail', label: 'Gmail or Google Workspace' },
          { value: 'microsoft', label: 'Outlook or Microsoft 365' },
          { value: 'other', label: 'Other provider or my own domain' },
        ]}
      />
      <div className={styles.grid2}>
        <TextField name="fromAddress" label="Business email address" type="email" defaultValue={start.fromAddress} error={e.fromAddress} autoCapitalize="none" spellCheck={false} />
        <TextField name="fromName" label="Sender name (optional)" placeholder="Your business name" defaultValue={start.fromName} error={e.fromName} />
      </div>
      <div className={styles.grid3}>
        <TextField
          name="host"
          label="SMTP hostname"
          placeholder="smtp.yourprovider.com"
          value={host}
          onChange={(ev) => setHost(ev.target.value)}
          error={e.host}
          autoCapitalize="none"
          spellCheck={false}
        />
        <TextField name="port" label="SMTP port" inputMode="numeric" value={port} onChange={(ev) => changePort(ev.target.value)} error={e.port} hint="Usually 587 or 465" />
      </div>
      <SelectField
        name="security"
        label="Encryption"
        value={security}
        onChange={(ev) => setSecurity(ev.target.value)}
        error={e.security}
        hint="STARTTLS for port 587, SSL/TLS for port 465 — use what your provider lists."
        options={[
          { value: 'starttls', label: 'STARTTLS' },
          { value: 'ssl', label: 'SSL/TLS' },
        ]}
      />
      <div className={styles.grid2}>
        <TextField name="username" label="SMTP username" hint="Usually your full email address" defaultValue={start.username} error={e.username} autoCapitalize="none" spellCheck={false} />
        <TextField
          name="password"
          label="SMTP password or app password"
          type="password"
          error={e.password}
          autoComplete="new-password"
          hint={initial ? 'Enter it again — the saved one is never shown.' : 'Stored encrypted and never shown again.'}
        />
      </div>
      <p className={styles.muted}>
        We log in to your mail server to check these settings before anything is saved. For a new address we then email a 6-digit code to it, to make sure it’s yours.
      </p>
      <div className={styles.buttons}>
        <Button type="submit" name="intent" value="test" variant="secondary" disabled={pending}>
          {pending && intent === 'test' ? 'Testing…' : 'Test connection'}
        </Button>
        <Button type="submit" name="intent" value="connect" variant="primary" disabled={pending}>
          {pending && intent === 'connect' ? 'Connecting…' : 'Connect email'}
        </Button>
      </div>
    </form>
  );
}

function CodeForm({ address }: { address: string }) {
  const [state, action] = useActionState(verifyCode, idle);
  const [resent, resend, resending] = useActionState(resendCode, idle);
  return (
    <form action={action} className={styles.form}>
      <p>Last step: enter the 6-digit code we emailed to {address}. It proves the address is yours. Automatic emails start once it’s verified.</p>
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
