import Link from 'next/link';
import { brand } from '@/config/brand';
import styles from './booking.module.css';

// Shared frame for booking and status pages: canvas background, centred column and a single
// small "Powered by" link — the detailer's brand leads, ours stays quiet (DESIGN_SYSTEM §1.1).
export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.frame}>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <Link href="/">Powered by {brand.name}</Link>
      </footer>
    </div>
  );
}
