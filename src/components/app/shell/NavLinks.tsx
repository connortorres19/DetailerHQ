'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ellipsis } from 'lucide-react';
import { NAV } from './nav';
import styles from './AppShell.module.css';

const isActive = (pathname: string, item: (typeof NAV)[number]) =>
  'exact' in item && item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

export function NavLinks() {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const moreActive = NAV.some((item) => !('phone' in item) && isActive(pathname, item));
  return (
    <>
      <ul className={styles.navList} role="list">
        {NAV.map((item) => {
          const { href, label, icon: Icon } = item;
          return (
            <li key={href} className={'phone' in item ? undefined : styles.phoneHidden}>
              <Link href={href} className={styles.navLink} aria-current={isActive(pathname, item) ? 'page' : undefined}>
                <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
        <li className={styles.phoneOnly}>
          <button
            type="button"
            className={styles.navLink}
            aria-expanded={more}
            aria-controls="more-nav"
            data-active={moreActive || undefined}
            onClick={() => setMore((m) => !m)}
          >
            <Ellipsis size={20} strokeWidth={1.5} aria-hidden="true" />
            <span>More</span>
          </button>
        </li>
      </ul>
      {more ? (
        <ul id="more-nav" className={styles.moreSheet} role="list" aria-label="More">
          {NAV.filter((item) => !('phone' in item)).map((item) => {
            const { href, label, icon: Icon } = item;
            return (
              <li key={href}>
                <Link href={href} className={styles.moreLink} aria-current={isActive(pathname, item) ? 'page' : undefined} onClick={() => setMore(false)}>
                  <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}
