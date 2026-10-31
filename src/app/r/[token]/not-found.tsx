import { PublicFrame } from '@/components/booking/PublicFrame';
import styles from './status.module.css';

// Wrong, expired or guessed links all get the same answer.
export default function NotFound() {
  return (
    <PublicFrame>
      <h1 className={styles.headline}>This link isn’t valid</h1>
      <p className={styles.next}>Check that you copied the whole link, or contact the business you booked with.</p>
    </PublicFrame>
  );
}
