import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Notice } from '@/components/app/ui/Notice';
import { PublicFrame } from '@/components/booking/PublicFrame';
import { getRequestStatus } from '@/data/booking';
import { aboutDuration, cutoffPhrase, estimateLabel, linePrice, sentence, statusCopy } from '@/domain/booking';
import { formatPhone, US_TIMEZONES } from '@/domain/business';
import { CopyLink, StatusActions } from './StatusActions';
import styles from './status.module.css';

export const metadata: Metadata = { title: 'Your booking', robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ new?: string }> };

// The customer's own booking, found only by the secret link (PRODUCT_PLAN §6.4, DESIGN_SYSTEM §13.11).
export default async function StatusPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { new: isNew } = await searchParams;
  const lookup = await getRequestStatus(token);
  if (!lookup.ok) {
    if (lookup.error?.code === 'DH005') {
      return (
        <PublicFrame>
          <h1 className={styles.headline}>Please try again in a few minutes</h1>
          <p className={styles.next}>There were too many attempts from this connection.</p>
        </PublicFrame>
      );
    }
    notFound();
  }
  const s = lookup.status;
  const tz = s.business.timezone;
  const zone = US_TIMEZONES.find((z) => z.value === tz)?.label ?? tz;
  const when = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso));
  const copy = statusCopy(s);
  const a = s.appointment;
  const confirmed = a && (a.status === 'scheduled' || a.status === 'in_progress');
  const phone = s.business.phone;

  return (
    <PublicFrame>
      <header className={styles.business}>
        <p className={styles.businessName}>{s.business.name}</p>
        {phone ? (
          <p className={styles.contact}>
            <a href={`tel:${phone}`}>Call {formatPhone(phone)}</a> · <a href={`sms:${phone}`}>Text</a>
          </p>
        ) : null}
      </header>

      {isNew === '1' ? (
        <div className={styles.banner}>
          {confirmed ? (
            <Notice tone="positive">You’re booked with {sentence(s.business.name)} Keep this link to check or cancel your appointment.</Notice>
          ) : s.status === 'pending' ? (
            <Notice tone="info">Request sent to {s.business.name} — not confirmed yet. Keep this link to see their answer.</Notice>
          ) : null}
        </div>
      ) : null}

      <section className={styles.state} aria-labelledby="status-headline">
        <span className={`${styles.badge} ${styles[copy.tone]}`}>{copy.badge}</span>
        <h1 id="status-headline" className={styles.headline}>
          {copy.headline}
        </h1>
        <p className={styles.next}>{copy.next}</p>
        {s.status === 'pending' && s.time_held ? (
          <Notice tone="info">
            Your requested time ({when(s.requested_start)}) is being held while {s.business.name} reviews your request. This is not a confirmation yet.
          </Notice>
        ) : null}
        {s.status === 'declined' && s.decline_message ? <p className={styles.message}>“{s.decline_message}”</p> : null}
        {a?.customer_message ? <p className={styles.message}>“{a.customer_message}”</p> : null}
      </section>

      {s.status === 'time_proposed' && s.proposal ? (
        <section className={styles.proposal} aria-label="Suggested time">
          <p className={styles.proposalTime}>{when(s.proposal.start)}</p>
          {s.proposal.message ? <p>“{s.proposal.message}”</p> : null}
          <p className={styles.small}>Held for you until {when(s.proposal.answer_by)}.</p>
          <StatusActions token={token} kind="proposal" />
        </section>
      ) : null}

      <dl className={styles.details}>
        <dt>{a ? 'Appointment' : 'Requested'}</dt>
        <dd>
          {when(a?.starts_at ?? s.requested_start)}
          <span className={styles.small}>Times are in {zone}</span>
        </dd>
        <dt>Services</dt>
        <dd>
          <ul className={styles.items} role="list">
            {(s.items ?? []).map((i) => (
              <li key={i.name}>
                <span>
                  {i.is_addon ? '+ ' : ''}
                  {i.name}
                </span>
                <span>{linePrice({ priceType: i.price_type, priceCents: i.price_cents })}</span>
              </li>
            ))}
          </ul>
        </dd>
        <dt>Estimate</dt>
        <dd>
          {estimateLabel({ totalCents: s.estimate_cents, isMinimum: s.estimate_is_minimum })} · {aboutDuration(s.duration_min)}
          <span className={styles.small}>
            {s.estimate_is_minimum ? 'Starting price — ' : 'Estimate — '}
            {s.business.name} confirms the final price. No payment is taken online.
          </span>
        </dd>
        <dt>Vehicle</dt>
        <dd>
          {s.vehicle}
          {s.size_class ? ` · ${s.size_class}` : ''}
        </dd>
        <dt>Location</dt>
        <dd>{s.location_type === 'mobile' ? 'At your address' : 'At the shop'}</dd>
        <dt>Your contact</dt>
        <dd>{[s.contact.phone ? `Phone ${s.contact.phone}` : null, s.contact.email ? `Email ${s.contact.email}` : null].filter(Boolean).join(' · ')}</dd>
        <dt>Reference</dt>
        <dd className={styles.mono}>#{s.request_number}</dd>
      </dl>

      {s.can_withdraw && s.status === 'pending' ? <StatusActions token={token} kind="withdraw" /> : null}
      {confirmed && a?.status === 'scheduled' ? (
        a.can_cancel ? (
          <StatusActions token={token} kind="cancel" cutoff={cutoffPhrase(s.policies.cancel_cutoff_hours)} />
        ) : (
          <p className={styles.small}>
            {s.policies.online_cancellation
              ? `Online cancellation is only available ${cutoffPhrase(s.policies.cancel_cutoff_hours)}.`
              : 'This business doesn’t take cancellations online.'}{' '}
            To change or cancel, contact {sentence(s.business.name)}
          </p>
        )
      ) : null}

      {confirmed && (s.policies.prep_instructions || s.policies.cancellation) ? (
        <section className={styles.policies}>
          {s.policies.prep_instructions ? (
            <>
              <h2>Before your appointment</h2>
              <p>{s.policies.prep_instructions}</p>
            </>
          ) : null}
          {s.policies.cancellation ? (
            <>
              <h2>Cancellation policy</h2>
              <p>{s.policies.cancellation}</p>
            </>
          ) : null}
        </section>
      ) : null}

      <footer className={styles.save}>
        <p>Save this page to check for updates. Anyone with this link can see this booking, so share it only with people you trust.</p>
        <CopyLink />
        {s.business.slug && !confirmed && s.status !== 'pending' && s.status !== 'time_proposed' ? (
          <Link href={`/book/${s.business.slug}`}>Make a new booking</Link>
        ) : null}
      </footer>
    </PublicFrame>
  );
}
