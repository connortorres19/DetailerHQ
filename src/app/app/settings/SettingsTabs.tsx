'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './settings.module.css';

const TABS = [
  { href: '/app/settings', label: 'Business' },
  { href: '/app/settings/branding', label: 'Branding' },
  { href: '/app/settings/notifications', label: 'Notifications' },
  { href: '/app/settings/appearance', label: 'Appearance' },
  { href: '/app/settings/account', label: 'Account' },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className={styles.tabs} aria-label="Settings sections">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={pathname === t.href || (t.href !== '/app/settings' && pathname.startsWith(`${t.href}/`)) ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
