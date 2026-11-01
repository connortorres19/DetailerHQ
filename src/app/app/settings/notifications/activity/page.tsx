import type { Metadata } from 'next';
import Link from 'next/link';
import { Panel } from '@/components/app/ui/Panel';
import { requireBusiness } from '@/data/session';
import { createClient } from '@/lib/supabase/server';
import { Activity } from '../forms';
import styles from '../notifications.module.css';

export const metadata: Metadata = { title: 'Email activity' };

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'problems', label: 'Failed or on hold' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'sent', label: 'Sent' },
] as const;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { business } = await requireBusiness('/app/settings/notifications/activity');
  const show = (await searchParams).show ?? 'all';
  const supabase = await createClient();
  let q = supabase.from('email_outbox').select('id, template, recipient, status, attempts, last_error, created_at, sent_at, next_attempt_at').order('created_at', { ascending: false }).limit(200);
  if (show === 'problems') q = q.in('status', ['failed', 'held']);
  if (show === 'scheduled') q = q.eq('status', 'queued');
  if (show === 'sent') q = q.eq('status', 'sent');
  const { data } = await q;
  return (
    <div className={styles.stack}>
      <p>
        <Link href="/app/settings/notifications">← Notifications</Link>
      </p>
      <Panel title="Email activity" id="activity">
        <nav className={styles.buttons} aria-label="Filter emails">
          {FILTERS.map((f) => (
            <Link key={f.key} href={`?show=${f.key}`} aria-current={show === f.key ? 'page' : undefined} className={styles.chip}>
              {f.label}
            </Link>
          ))}
        </nav>
        <Activity rows={data ?? []} timezone={business.timezone} />
      </Panel>
    </div>
  );
}
