'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from './nav';
import styles from './AppShell.module.css';

export function NavLinks() {
  const pathname = usePathname();
  return (
    <ul className={styles.navList} role="list">
      {NAV.map(({ href, label, icon: Icon, ...item }) => {
        const active = 'exact' in item && item.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link href={href} className={styles.navLink} aria-current={active ? 'page' : undefined}>
              <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
