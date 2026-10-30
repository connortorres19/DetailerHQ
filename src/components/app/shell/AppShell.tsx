import { LogOut } from 'lucide-react';
import { signOut } from '@/app/(auth)/actions';
import { Wordmark } from '@/components/layout/Wordmark';
import { Notice } from '@/components/app/ui/Notice';
import type { Business, SessionUser } from '@/data/session';
import { NavLinks } from './NavLinks';
import styles from './AppShell.module.css';

// DESIGN_SYSTEM §10–11: sidebar ≥ 1024px, icon rail 768–1023px, bottom tab bar below 768px.
export function AppShell({ business, user, children }: { business: Business; user: SessionUser; children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <a href="#content" className={styles.skip}>
        Skip to content
      </a>
      <aside className={styles.sidebar} aria-label="Main">
        <div className={styles.brand}>
          <Wordmark tone="default" />
        </div>
        <p className={styles.business} title={business.name}>
          {business.name}
        </p>
        <nav aria-label="Main navigation" className={styles.nav}>
          <NavLinks />
        </nav>
        <div className={styles.account}>
          <p className={styles.email} title={user.email}>
            {user.email}
          </p>
          <form action={signOut}>
            <button type="submit" className={styles.signOut}>
              <LogOut size={16} strokeWidth={1.5} aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.mobileTop}>
          <span className={styles.mobileBusiness}>{business.name}</span>
          <form action={signOut}>
            <button type="submit" className={styles.signOut} aria-label="Sign out">
              <LogOut size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </form>
        </header>
        {business.account_status === 'pending_activation' ? (
          <div className={styles.banner}>
            <Notice tone="attention">
              Confirm your email to activate your account. Open the link we sent to {user.email}.
            </Notice>
          </div>
        ) : null}
        <main id="content" className={styles.content} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
