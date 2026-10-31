import type { BookingPage } from '@/domain/booking';
import { cutoffPhrase, sentence } from '@/domain/booking';
import { formatDuration } from '@/domain/service';
import styles from './booking.module.css';

const notice = (min: number) => (min === 0 ? null : min % 1440 === 0 ? `${min / 1440} day${min === 1440 ? '' : 's'}` : formatDuration(min));

// Booking and cancellation rules as the database enforces them, plus the owner's own wording.
export function Policies({ page, heading = 'Booking policies' }: { page: Pick<BookingPage, 'name' | 'policies' | 'booking_mode'>; heading?: string }) {
  const p = page.policies;
  const n = notice(p.min_notice_min);
  return (
    <section className={styles.policies} aria-labelledby="policies-heading">
      <h2 id="policies-heading" className={styles.sectionTitle}>
        {heading}
      </h2>
      <ul className={styles.policyList} role="list">
        <li>
          {page.booking_mode === 'instant'
            ? 'Open times are booked straight away — you’ll get a confirmation link.'
            : `Every booking is a request: ${page.name} confirms it, or suggests another time.`}
        </li>
        <li>
          {n ? `Book at least ${n} ahead` : 'Book any open time'}, up to {p.horizon_days} days out.
        </li>
        <li>
          {p.online_cancellation
            ? `Cancel online with your booking link ${cutoffPhrase(p.cancel_cutoff_hours)}. After that, contact ${sentence(page.name)}`
            : `To cancel, contact ${page.name} directly.`}
        </li>
        <li>Prices are estimates until {page.name} confirms the job. No payment is taken online.</li>
      </ul>
      {p.cancellation ? (
        <div className={styles.policyText}>
          <h3>Cancellation</h3>
          <p>{p.cancellation}</p>
        </div>
      ) : null}
      {p.rescheduling ? (
        <div className={styles.policyText}>
          <h3>Rescheduling</h3>
          <p>{p.rescheduling}</p>
        </div>
      ) : null}
      {p.prep_instructions ? (
        <div className={styles.policyText}>
          <h3>Before your appointment</h3>
          <p>{p.prep_instructions}</p>
        </div>
      ) : null}
    </section>
  );
}
