import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { Panel } from '@/components/app/ui/Panel';
import { getFollowUps } from '@/data/leads';
import { requireBusiness } from '@/data/session';
import { SOURCE_LABELS } from '@/domain/leads';
import { formatCents } from '@/domain/service';
import { dayRange, formatDate } from '@/domain/time';
import styles from '../leads/leads.module.css';

export const metadata: Metadata = { title: 'Follow-ups' };

const who = (p: { first_name?: string; last_name?: string | null; contact_first_name?: string; contact_last_name?: string | null } | null) =>
  p ? [p.first_name ?? p.contact_first_name, p.last_name ?? p.contact_last_name].filter(Boolean).join(' ') : 'No customer';

// What needs chasing: follow-ups due, quotes waiting on the customer or on you, uncontacted leads.
export default async function FollowUpsPage() {
  const { business } = await requireBusiness('/app/follow-ups');
  const tz = business.timezone;
  const endOfToday = dayRange(tz).end;
  const f = await getFollowUps();
  const all = [
    ...f.leadFollowUps.map((l) => ({ id: l.id, href: `/app/leads/${l.id}`, kind: 'Lead', name: who(l), at: l.next_follow_up_at!, note: l.follow_up_note })),
    ...f.quoteFollowUps.map((q) => ({ id: q.id, href: `/app/quotes/${q.id}`, kind: `Quote #${q.number}`, name: who(q.customer), at: q.next_follow_up_at, note: q.follow_up_note })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const due = all.filter((x) => new Date(x.at) < endOfToday);
  const upcoming = all.filter((x) => new Date(x.at) >= endOfToday);
  const when = (iso: string) => formatDate(tz, iso, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const day = (iso: string) => formatDate('UTC', `${iso}T12:00:00Z`, { month: 'short', day: 'numeric' });
  const now = new Date();

  const list = (items: typeof all, empty: string) =>
    items.length ? (
      <ul className={styles.simpleList} role="list">
        {items.map((x) => (
          <li key={`${x.kind}-${x.id}`}>
            <span>
              <Link href={x.href}>{x.name}</Link> <span className={styles.muted}>· {x.kind}{x.note ? ` · ${x.note}` : ''}</span>
            </span>
            <span className={new Date(x.at) < now ? styles.due : styles.muted}>{when(x.at)}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className={styles.muted}>{empty}</p>
    );

  return (
    <>
      <PageHeader title="Follow-ups" description="Who to chase today, quotes waiting for an answer, and leads nobody has contacted yet." />
      <div className={styles.detail}>
        <div className={styles.column}>
          <Panel title={`Due today or overdue · ${due.length}`} id="due">
            {list(due, 'Nothing due. Set follow-ups on leads and quotes so nothing slips.')}
          </Panel>
          <Panel title={`Accepted — ready to book · ${f.accepted.length}`} id="accepted">
            {f.accepted.length ? (
              <ul className={styles.simpleList} role="list">
                {f.accepted.map((q) => (
                  <li key={q.id}>
                    <span>
                      <Link href={`/app/quotes/${q.id}`}>{who(q.customer)}</Link> <span className={styles.muted}>· Quote #{q.number} · {formatCents(q.total_cents)}</span>
                    </span>
                    <span className={styles.muted}>Accepted {formatDate(tz, q.decided_at, { month: 'short', day: 'numeric' })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>No accepted quotes waiting to be booked.</p>
            )}
          </Panel>
          <Panel title={`Waiting on the customer · ${f.awaiting.length}`} id="awaiting">
            {f.awaiting.length ? (
              <ul className={styles.simpleList} role="list">
                {f.awaiting.map((q) => (
                  <li key={q.id}>
                    <span>
                      <Link href={`/app/quotes/${q.id}`}>{who(q.customer)}</Link> <span className={styles.muted}>· Quote #{q.number} · {formatCents(q.total_cents)}</span>
                    </span>
                    <span className={styles.muted}>
                      Sent {formatDate(tz, q.sent_at, { month: 'short', day: 'numeric' })}
                      {q.valid_until ? ` · valid until ${day(q.valid_until)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>No quotes waiting for an answer.</p>
            )}
          </Panel>
        </div>
        <div className={styles.column}>
          <Panel title={`Not contacted yet · ${f.uncontacted.length}`} id="uncontacted">
            {f.uncontacted.length ? (
              <ul className={styles.simpleList} role="list">
                {f.uncontacted.map((l) => (
                  <li key={l.id}>
                    <span>
                      <Link href={`/app/leads/${l.id}`}>{who(l)}</Link> <span className={styles.muted}>· {SOURCE_LABELS[l.source] ?? l.source}</span>
                    </span>
                    <span className={styles.muted}>Added {formatDate(tz, l.created_at, { month: 'short', day: 'numeric' })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>Every new lead has been contacted.</p>
            )}
          </Panel>
          <Panel title={`Upcoming follow-ups · ${upcoming.length}`} id="upcoming">
            {list(upcoming, 'No upcoming follow-ups.')}
          </Panel>
        </div>
      </div>
    </>
  );
}
