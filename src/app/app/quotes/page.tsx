import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { ButtonLink } from '@/components/app/ui/Button';
import { Notice } from '@/components/app/ui/Notice';
import { EmptyState } from '@/components/app/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { listQuotes } from '@/data/leads';
import { requireBusiness } from '@/data/session';
import { QUOTE_STATUSES } from '@/domain/leads';
import { formatCents } from '@/domain/service';
import { formatDate } from '@/domain/time';
import styles from './styles';

export const metadata: Metadata = { title: 'Quotes' };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string; deleted?: string }> }) {
  const { business } = await requireBusiness('/app/quotes');
  const sp = await searchParams;
  const status = QUOTE_STATUSES.some((s) => s.value === sp.status) ? sp.status! : 'all';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: business.timezone }).format(new Date());
  const { rows, counts } = await listQuotes({ status, today });
  const day = (iso: string) => formatDate('UTC', `${iso}T12:00:00Z`, { month: 'short', day: 'numeric' });

  return (
    <>
      <PageHeader
        title="Quotes"
        description="Custom prices for custom jobs. Send a link; the customer accepts or declines; you book it."
        actions={
          <ButtonLink href="/app/quotes/new" variant="primary" icon={<Plus size={16} strokeWidth={1.5} aria-hidden="true" />}>
            New quote
          </ButtonLink>
        }
      />
      {sp.deleted ? (
        <div className={styles.flash}>
          <Notice tone="positive">Draft deleted.</Notice>
        </div>
      ) : null}
      <nav className={styles.tabs} aria-label="Quote status">
        {[{ value: 'all', label: 'All' }, ...QUOTE_STATUSES].map((s) => (
          <Link key={s.value} href={s.value === 'all' ? '/app/quotes' : `/app/quotes?status=${s.value}`} aria-current={status === s.value ? 'page' : undefined}>
            {s.label}
            <span className={styles.count}>{counts[s.value] ?? 0}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="No quotes here" body="Create a quote from a lead, a customer, or from scratch." />
      ) : (
        <ul className={styles.list} role="list" aria-label="Quotes">
          {rows.map((q) => (
            <li key={q.id}>
              <Link href={`/app/quotes/${q.id}`} className={styles.row}>
                <span className={styles.cell}>
                  <span className={styles.strong}>{q.customer ? [q.customer.first_name, q.customer.last_name].filter(Boolean).join(' ') : 'No customer'}</span>
                  <span className={styles.muted}>Quote #{q.number}</span>
                </span>
                <span className={styles.cell}>
                  <span>{q.quote_items.map((i) => i.name).slice(0, 3).join(', ') || 'No items yet'}</span>
                  <span className={styles.muted}>{q.vehicle_text}</span>
                </span>
                <span className={styles.cell}>
                  <span className={styles.muted}>{q.sent_at ? `Sent ${formatDate(business.timezone, q.sent_at, { month: 'short', day: 'numeric' })}` : `Created ${formatDate(business.timezone, q.created_at, { month: 'short', day: 'numeric' })}`}</span>
                  {q.valid_until ? <span className={styles.muted}>Valid until {day(q.valid_until)}</span> : null}
                </span>
                <span className={`${styles.cell} ${styles.right}`}>
                  <span className={styles.strong}>{formatCents(q.total_cents)}</span>
                  <StatusBadge tone={q.display.tone}>{q.display.label}</StatusBadge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
