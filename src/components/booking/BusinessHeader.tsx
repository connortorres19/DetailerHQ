import { MapPin, Phone } from 'lucide-react';
import type { BookingPage } from '@/domain/booking';
import { formatPhone } from '@/domain/business';
import styles from './booking.module.css';

const MODE_LINE = { mobile: 'Mobile detailing', shop: 'Detailing at our shop', both: 'Mobile and in-shop detailing' } as const;

// Business identity at the top of the booking page. No logo uploads exist yet, so the mark is the
// business's initials (DESIGN_SYSTEM §13 avatar: initials only, never generated imagery).
export function BusinessHeader({ page, compact = false }: { page: Pick<BookingPage, 'name' | 'service_mode' | 'service_area' | 'shop_address' | 'phone' | 'intro'>; compact?: boolean }) {
  const initials = page.name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  const where =
    page.service_mode !== 'mobile' && page.shop_address?.city
      ? [page.shop_address.line1, `${page.shop_address.city}, ${page.shop_address.state ?? ''} ${page.shop_address.postal_code ?? ''}`.trim()].filter(Boolean).join(', ')
      : page.service_area;
  return (
    <header className={styles.business}>
      <div className={styles.mark} aria-hidden="true">
        {initials}
      </div>
      <div className={styles.businessText}>
        <h1 className={styles.businessName}>{page.name}</h1>
        <p className={styles.businessLine}>
          {MODE_LINE[page.service_mode]}
          {page.service_area && page.service_mode !== 'shop' ? ` · ${page.service_area}` : ''}
        </p>
        {!compact ? (
          <ul className={styles.contactList} role="list">
            {where && page.service_mode !== 'mobile' ? (
              <li>
                <MapPin size={15} strokeWidth={1.5} aria-hidden="true" />
                {where}
              </li>
            ) : null}
            {page.phone ? (
              <li>
                <Phone size={15} strokeWidth={1.5} aria-hidden="true" />
                <a href={`tel:${page.phone}`}>{formatPhone(page.phone)}</a>
                <span aria-hidden="true">·</span>
                <a href={`sms:${page.phone}`}>Text</a>
              </li>
            ) : null}
          </ul>
        ) : null}
        {!compact && page.intro ? <p className={styles.intro}>{page.intro}</p> : null}
      </div>
    </header>
  );
}
