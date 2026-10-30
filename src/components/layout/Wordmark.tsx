import { brand } from '@/config/brand';
import styles from './Wordmark.module.css';

// Provisional wordmark: name set in Plex Sans with a small brass mark (no logo until the
// name is cleared — D-19).
export function Wordmark({ tone = 'inverse' }: { tone?: 'inverse' | 'default' }) {
  return (
    <span className={[styles.wordmark, styles[tone]].join(' ')}>
      <svg className={styles.mark} width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <rect x="0.5" y="0.5" width="17" height="17" rx="2" fill="none" stroke="currentColor" />
        <rect x="4" y="10.5" width="10" height="3" fill="currentColor" />
      </svg>
      <span>{brand.name}</span>
    </span>
  );
}
