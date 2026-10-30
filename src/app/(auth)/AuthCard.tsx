import Link from 'next/link';
import { Wordmark } from '@/components/layout/Wordmark';
import styles from './auth.module.css';

export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main id="main" className={styles.page}>
      <Link href="/" className={styles.brand} aria-label="DetailerHQ home">
        <Wordmark tone="default" />
      </Link>
      <section className={styles.card} aria-labelledby="auth-title">
        <h1 id="auth-title" className={styles.title}>
          {title}
        </h1>
        {intro ? <p className={styles.intro}>{intro}</p> : null}
        <div className={styles.content}>{children}</div>
      </section>
      {footer ? <p className={styles.footer}>{footer}</p> : null}
    </main>
  );
}
