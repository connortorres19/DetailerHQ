import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, Check, Circle, Inbox, UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { ButtonLink } from '@/components/app/ui/Button';
import { EmptyState, Panel } from '@/components/app/ui/Panel';
import { getToday } from '@/data/dashboard';
import { requireBusiness } from '@/data/session';
import { formatDate, formatMoney, formatTimeRange } from '@/domain/time';
import styles from './today.module.css';

export const metadata: Metadata = { title: 'Today' };

// DESIGN_SYSTEM §10.3, ordered by urgency. No vanity KPI tiles.
export default async function TodayPage() {
  const { business } = await requireBusiness();
  const today = await getToday(business);
  const tz = business.timezone;

  const checklist = [
    { done: true, label: 'Create your workspace' },
    { done: Boolean(business.phone_e164 || business.email), label: 'Add business contact details', href: '/app/settings' },
    { done: today.activeCustomers > 0, label: 'Add your first customer', href: '/app/customers/new' },
    { done: today.activeServices > 0, label: 'Add your services', href: '/app/services/new' },
    { done: today.hourWindows > 0, label: 'Set your working hours', href: '/app/availability' },
  ];
  const setupDone = checklist.every((i) => i.done);

  return (
    <>
      <PageHeader
        title="Today"
        description={`${formatDate(tz, new Date(), { weekday: 'long', month: 'long', day: 'numeric' })} · ${formatDate(tz, new Date(), { timeZoneName: 'short' }).split(' ').pop()}`}
      />
      <div className={styles.grid}>
        <div className={styles.column}>
          {today.pendingRequests > 0 ? (
            <Panel title="Needs your action" id="needs-action">
              <p className={styles.attention}>
                <Inbox size={16} strokeWidth={1.5} aria-hidden="true" /> {today.pendingRequests} pending{' '}
                {today.pendingRequests === 1 ? 'request' : 'requests'}
              </p>
            </Panel>
          ) : null}

          <Panel title="Today’s schedule" id="schedule" flush>
            {today.schedule.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={20} strokeWidth={1.5} />}
                title="Nothing scheduled today"
                body="Appointments will show here once you start taking bookings."
              />
            ) : (
              <ul className={styles.list} role="list">
                {today.schedule.map((a) => (
                  <li key={a.id} className={styles.job}>
                    <span className={`${styles.time} tabular`}>{formatTimeRange(tz, a.starts_at, a.ends_at)}</span>
                    <span className={styles.who}>
                      {a.customer?.first_name} {a.customer?.last_name}
                    </span>
                    <span className={styles.meta}>
                      {[a.vehicle?.year, a.vehicle?.make, a.vehicle?.model].filter(Boolean).join(' ')}
                      {a.location_type === 'mobile' && a.service_address_line1 ? ` · ${a.service_address_line1}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className={styles.column}>
          <Panel title="This week" id="week">
            <p className={styles.week}>
              {today.week.jobs === 0
                ? 'No jobs scheduled this week.'
                : `${today.week.jobs} ${today.week.jobs === 1 ? 'job' : 'jobs'} scheduled · ${formatMoney(today.week.bookedCents)} booked job value`}
            </p>
          </Panel>

          <Panel title="Customers" id="customers-summary" action={<Link href="/app/customers" className={styles.link}>View all</Link>}>
            {today.activeCustomers === 0 ? (
              <div className={styles.inline}>
                <p className={styles.week}>No customers yet.</p>
                <ButtonLink href="/app/customers/new" size="sm" icon={<UserPlus size={16} strokeWidth={1.5} aria-hidden="true" />}>
                  Add customer
                </ButtonLink>
              </div>
            ) : (
              <p className={styles.week}>
                <span className="tabular">{today.activeCustomers}</span> active {today.activeCustomers === 1 ? 'customer' : 'customers'}
              </p>
            )}
          </Panel>

          {setupDone ? null : (
            <Panel title="Setup checklist" id="setup">
              <ul className={styles.checklist} role="list">
                {checklist.map((item) => (
                  <li key={item.label} data-done={item.done}>
                    {item.done ? <Check size={16} strokeWidth={2} aria-hidden="true" /> : <Circle size={16} strokeWidth={1.5} aria-hidden="true" />}
                    {item.done || !item.href ? <span>{item.label}</span> : <Link href={item.href}>{item.label}</Link>}
                    <span className="visually-hidden">{item.done ? '(done)' : '(to do)'}</span>
                  </li>
                ))}
              </ul>
              <p className={styles.later}>Your booking page isn’t available yet.</p>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
