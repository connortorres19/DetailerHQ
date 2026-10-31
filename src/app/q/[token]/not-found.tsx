import { PublicFrame } from '@/components/booking/PublicFrame';
import styles from './q.module.css';

// Wrong, withdrawn or guessed links all get the same answer.
export default function NotFound() {
  return (
    <PublicFrame>
      <h1 className={styles.headline}>This quote link isn’t valid</h1>
      <p>Check that you copied the whole link, or contact the business that sent it — they may have updated the quote.</p>
    </PublicFrame>
  );
}
