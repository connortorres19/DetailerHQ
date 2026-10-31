import styles from './booking.module.css';

// Unknown, unpublished, suspended or closing businesses all look the same: nothing about the
// business (or whether it exists) is revealed.
export function Unavailable() {
  return (
    <div className={styles.unavailable}>
      <h1 className={styles.unavailableTitle}>This booking page isn’t available</h1>
      <p>The link may be mistyped, or the business isn’t taking online bookings at the moment. Please contact the business directly.</p>
    </div>
  );
}
