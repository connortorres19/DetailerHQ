import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { ButtonLink } from '@/components/app/ui/Button';
import { EmptyState } from '@/components/app/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { listBookings } from '@/data/bookings';
import { requireBusiness } from '@/data/session';
import { linePrice } from '@/domain/booking';
import { formatPhone } from '@/domain/business';
import { FILTERS, parseFilter, STATUS_LABEL } from '@/domain/bookings';
import { formatCents, formatDuration } from '@/domain/service';
import { formatDate } from '@/domain/time';
import styles from './bookings.module.css';

export const metadata: Metadata = { title: 'Bookings' };

const EMPTY: Record<string, [string, string]> = {
  all: ['No bookings yet', 'Requests and bookings from your booking page will appear here.'],
  pending: ['Nothing waiting', 'New requests that need your answer will appear here.'],
  confirmed: ['No confirmed bookings', 'Confirmed appointments will appear here.'],
  completed: ['No completed jobs yet', 'Jobs you mark completed will appear here.'],
  cancelled: ['Nothing cancelled', 'Cancelled appointments and no-shows will appear here.'],
  declined: ['Nothing declined', 'Declined, withdrawn and expired requests will appear here.'],
};

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { business } = await requireBusiness('/app/bookings');
  const filter = parseFilter((await searchParams).view);
  const { rows, counts, truncated } = await listBookings(filter);
  const tz = business.timezone;
  const day = (iso: string) => formatDate(tz, iso, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = (iso: string) => formatDate(tz, iso, { hour: 'numeric', minute: '2-digit' });

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Requests waiting for you first, then upcoming appointments, then past ones."
        actions={
          <ButtonLink href="/app/calendar" icon={<CalendarDays size={16} strokeWidth={1.5} aria-hidden="true" />}>
            Calendar
          </ButtonLink>
        }
      />
      <nav className={styles.tabs} aria-label="Filter bookings">
        {FILTERS.map((f) => (
          <Link key={f.value} href={f.value === 'all' ? '/app/bookings' : `/app/bookings?view=${f.value}`} aria-current={filter === f.value ? 'page' : undefined}>
            {f.label}
            <span className={styles.count}>{counts[f.value]}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState title={EMPTY[filter]![0]} body={EMPTY[filter]![1]} />
      ) : (
        <ul className={styles.list} role="list" aria-label="Bookings">
          {rows.map((r) => {
            const [label, tone] = STATUS_LABEL[r.status];
            const main = r.items.filter((i) => !i.isAddon);
            const addons = r.items.filter((i) => i.isAddon);
            return (
              <li key={r.id}>
                <Link href={`/app/bookings/${r.id}`} className={styles.row}>
                  <span className={styles.when}>
                    <span className={styles.day}>{day(r.proposal?.start ?? r.start)}</span>
                    <span className={styles.time}>
                      {time(r.proposal?.start ?? r.start)} · {formatDuration(r.durationMin)}
                    </span>
                  </span>
                  <span className={styles.who}>
                    <span className={styles.name}>{r.name}</span>
                    <span className={styles.meta}>{[formatPhone(r.phone), r.email].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className={styles.what}>
                    <span>
                      {main.map((i) => i.name).join(', ') || 'Appointment'}
                      {addons.length ? <span className={styles.meta}> + {addons.map((i) => i.name).join(', ')}</span> : null}
                    </span>
                    <span className={styles.meta}>{[r.vehicle, r.sizeName].filter(Boolean).join(' · ')}</span>
                    {r.notes ? <span className={styles.note}>“{r.notes}”</span> : null}
                  </span>
                  <span className={styles.price}>
                    {r.isMinimum ? linePrice({ priceType: 'starting_at', priceCents: r.totalCents }) : formatCents(r.totalCents)}
                  </span>
                  <span className={styles.status}>
                    <StatusBadge tone={tone}>{label}</StatusBadge>
                    {r.proposal ? <span className={styles.meta}>was {day(r.start)} {time(r.start)}</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {truncated ? <p className={styles.footnote}>Showing the 300 most recent requests and appointments.</p> : null}
    </>
  );
}
