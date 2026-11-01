import type { Metadata } from 'next';
import Link from 'next/link';
import { Notice } from '@/components/app/ui/Notice';
import { Panel } from '@/components/app/ui/Panel';
import { getUser, requireBusiness } from '@/data/session';
import { CUSTOMER_TEMPLATES, OWNER_TEMPLATES } from '@/domain/email';
import { emailConfig, providerConfigured } from '@/lib/email/config';
import { createClient } from '@/lib/supabase/server';
import { Activity, ConnectionPanel, CustomerEmailsForm, OwnerPrefsForm } from './forms';
import styles from './notifications.module.css';

export const metadata: Metadata = { title: 'Notifications' };

const RESULT: Record<string, { tone: 'positive' | 'critical' | 'attention'; text: string }> = {
  connected: { tone: 'positive', text: 'Email connected and verified — a test email is on its way to you. Automatic emails are on.' },
  smtp_verified: { tone: 'positive', text: 'Email connected and verified. Automatic emails are on.' },
  denied: { tone: 'attention', text: 'Access wasn’t granted, so nothing was connected.' },
  invalid_state: { tone: 'critical', text: 'That sign-in link expired or didn’t match. Start again.' },
  provider_error: { tone: 'critical', text: 'The email provider returned an error. Try again in a moment.' },
  no_offline_access: { tone: 'critical', text: 'The provider didn’t allow ongoing access. Remove DetailerHQ from your account’s connected apps, then connect again.' },
  save_failed: { tone: 'critical', text: 'The connection couldn’t be saved. Try again.' },
  test_failed: { tone: 'critical', text: 'Connected, but the test email failed, so automatic emails stay off. Check the error below and try again.' },
  not_configured: { tone: 'attention', text: 'This sign-in option isn’t set up on this server yet. Use another email option, or see the setup guide.' },
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { business } = await requireBusiness('/app/settings/notifications');
  const user = await getUser();
  const result = RESULT[(await searchParams).email ?? ''];
  const supabase = await createClient();
  const [conn, settings, templates, prefs, activity] = await Promise.all([
    supabase.from('email_connections').select('provider, from_address, from_name, status, smtp_host, smtp_port, smtp_username, verification_expires_at, verified_at, last_error, last_error_at, last_sent_at').maybeSingle(),
    supabase.from('email_settings').select('reminder_hours').maybeSingle(),
    supabase.from('email_template_settings').select('template, enabled, subject, intro, signoff'),
    supabase.from('email_owner_prefs').select('prefs, summary_hour').maybeSingle(),
    supabase.from('email_outbox').select('id, template, recipient, status, attempts, last_error, created_at, sent_at, next_attempt_at').order('created_at', { ascending: false }).limit(25),
  ]);
  const configured = Boolean(emailConfig());
  const c = conn.data;
  const enabled = Object.fromEntries((templates.data ?? []).map((t) => [t.template, t.enabled]));
  const customised = new Set((templates.data ?? []).filter((t) => t.subject || t.intro || t.signoff).map((t) => t.template));
  const ownerPrefs = (prefs.data?.prefs ?? {}) as Record<string, boolean>;

  return (
    <div className={styles.stack}>
      {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
      {!configured ? <Notice tone="attention">Email isn’t set up on this server yet. Everything else works; automatic emails are off.</Notice> : null}

      <Panel title="Email account" id="email-account">
        <ConnectionPanel
          connection={c ? { ...c, smtp_port: c.smtp_port ?? null } : null}
          businessName={business.name}
          google={providerConfigured('google')}
          microsoft={providerConfigured('microsoft')}
          configured={configured}
        />
      </Panel>

      <Panel title="Customer emails" id="customer-emails">
        {c?.status !== 'verified' ? <p className={styles.muted}>These go out once your email account is connected and verified.</p> : null}
        <CustomerEmailsForm
          templates={CUSTOMER_TEMPLATES.map((t) => ({ ...t, enabled: enabled[t.key] ?? true, customised: customised.has(t.key) }))}
          reminderHours={settings.data?.reminder_hours ?? [24]}
        />
      </Panel>

      <Panel title="Your notifications" id="owner-emails">
        <p className={styles.muted}>Sent to {user?.email} from your connected account. Only you see these.</p>
        <OwnerPrefsForm templates={OWNER_TEMPLATES.map((t) => ({ ...t, enabled: ownerPrefs[t.key] ?? true }))} summaryHour={prefs.data?.summary_hour ?? 7} />
      </Panel>

      <Panel title="Email activity" id="email-activity" action={<Link href="/app/settings/notifications/activity">See all</Link>}>
        <Activity rows={activity.data ?? []} timezone={business.timezone} />
      </Panel>
    </div>
  );
}
