import type { Metadata } from 'next';
import Link from 'next/link';
import { BellRing, Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { ButtonLink } from '@/components/app/ui/Button';
import { EmptyState } from '@/components/app/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { listLeads } from '@/data/leads';
import { requireBusiness } from '@/data/session';
import { formatPhone } from '@/domain/business';
import { LEAD_STATUSES, leadStatus, leadVehicle, SOURCE_LABELS } from '@/domain/leads';
import { formatDate } from '@/domain/time';
import styles from './leads.module.css';

export const metadata: Metadata = { title: 'Leads' };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { business } = await requireBusiness('/app/leads');
  const sp = await searchParams;
  const status = LEAD_STATUSES.some((s) => s.value === sp.status) ? sp.status! : 'all';
  const { rows, counts } = await listLeads({ status, q: sp.q });
  const tz = business.timezone;
  const now = new Date();
  const href = (s: string) => `/app/leads?${new URLSearchParams({ ...(s !== 'all' ? { status: s } : {}), ...(sp.q ? { q: sp.q } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Leads"
        description="People who asked about a job. Track them from first contact to a booking."
        actions={
          <>
            <ButtonLink href="/app/follow-ups" icon={<BellRing size={16} strokeWidth={1.5} aria-hidden="true" />}>
              Follow-ups
            </ButtonLink>
            <ButtonLink href="/app/leads/new" variant="primary" icon={<Plus size={16} strokeWidth={1.5} aria-hidden="true" />}>
              New lead
            </ButtonLink>
          </>
        }
      />
      <nav className={styles.tabs} aria-label="Lead status">
        {[{ value: 'all', label: 'All' }, ...LEAD_STATUSES].map((s) => (
          <Link key={s.value} href={href(s.value)} aria-current={status === s.value ? 'page' : undefined}>
            {s.label}
            <span className={styles.count}>{counts[s.value] ?? 0}</span>
          </Link>
        ))}
      </nav>
      <form className={styles.searchForm} role="search" action="/app/leads">
        {status !== 'all' ? <input type="hidden" name="status" value={status} /> : null}
        <input type="search" name="q" defaultValue={sp.q} placeholder="Search name, phone, email, vehicle or request" aria-label="Search leads" />
      </form>
      {rows.length === 0 ? (
        <EmptyState
          title={sp.q ? 'No leads match' : 'No leads here yet'}
          body={sp.q ? 'Try another name, phone number or vehicle.' : 'Log calls, texts and walk-ins as leads so nothing slips through.'}
        />
      ) : (
        <ul className={styles.list} role="list" aria-label="Leads">
          {rows.map((l) => {
            const s = leadStatus(l.status);
            const due = l.next_follow_up_at && new Date(l.next_follow_up_at) <= now;
            return (
              <li key={l.id}>
                <Link href={`/app/leads/${l.id}`} className={styles.row}>
                  <span className={styles.cell}>
                    <span className={styles.strong}>{[l.contact_first_name, l.contact_last_name].filter(Boolean).join(' ')}</span>
                    <span className={styles.muted}>{[formatPhone(l.contact_phone_e164), l.contact_email].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className={styles.cell}>
                    <span>{l.service?.name ?? (l.request_text ? l.request_text.slice(0, 80) : 'No request recorded')}</span>
                    <span className={styles.muted}>{[leadVehicle(l), l.size?.name].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className={styles.cell}>
                    <span className={styles.muted}>{SOURCE_LABELS[l.source] ?? l.source} · {formatDate(tz, l.created_at, { month: 'short', day: 'numeric' })}</span>
                    <span className={styles.muted}>
                      {l.last_contacted_at ? `Contacted ${formatDate(tz, l.last_contacted_at, { month: 'short', day: 'numeric' })}` : 'Not contacted yet'}
                    </span>
                  </span>
                  <span className={`${styles.cell} ${styles.right}`}>
                    <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                    {l.next_follow_up_at ? (
                      <span className={due ? styles.due : styles.muted}>Follow up {formatDate(tz, l.next_follow_up_at, { month: 'short', day: 'numeric' })}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
