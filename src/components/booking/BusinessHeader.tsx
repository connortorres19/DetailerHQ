import { Globe, Mail, MapPin, Phone } from 'lucide-react';
import { mediaUrl, socialUrlOk, SOCIAL_NETWORKS, websiteOk } from '@/domain/branding';
import { NO_BRANDING, type BookingPage, type PageBranding } from '@/domain/booking';
import { formatPhone } from '@/domain/business';
import styles from './booking.module.css';

const MODE_LINE = { mobile: 'Mobile detailing', shop: 'Detailing at our shop', both: 'Mobile and in-shop detailing' } as const;

type HeaderPage = Pick<BookingPage, 'name' | 'service_mode' | 'service_area' | 'shop_address' | 'phone' | 'intro'> & { branding?: PageBranding };

// Business identity at the top of the booking page: the owner's cover photo and logo when they've
// published them (Phase 6), otherwise the initials mark (DESIGN_SYSTEM §13: never generated imagery).
// Links were validated by the database; they're checked again here before becoming hrefs.
export function BusinessHeader({ page, compact = false, nameAs: Name = 'h1' }: { page: HeaderPage; compact?: boolean; nameAs?: 'h1' | 'p' }) {
  const b = page.branding ?? NO_BRANDING;
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
  const social = SOCIAL_NETWORKS.filter((n) => b.social[n.key] && socialUrlOk(n.key, b.social[n.key]!));
  const website = b.website_url && websiteOk(b.website_url) ? b.website_url : null;
  const banded = !b.cover && Boolean(b.colors.secondary);

  return (
    <header className={`${styles.businessWrap} ${banded ? styles.banded : ''}`}>
      {b.cover && !compact ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin, already sized WebP
        <img className={styles.cover} src={mediaUrl(b.cover.id)} alt="" width={b.cover.width} height={b.cover.height} fetchPriority="high" />
      ) : null}
      <div className={styles.business}>
        {b.logo ? (
          <div className={styles.logo}>
            {/* eslint-disable-next-line @next/next/no-img-element -- same-origin, already sized WebP */}
            <img src={mediaUrl(b.logo.id)} alt={`${page.name} logo`} width={b.logo.width} height={b.logo.height} />
          </div>
        ) : (
          <div className={styles.mark} aria-hidden="true">
            {initials}
          </div>
        )}
        <div className={styles.businessText}>
          <Name className={styles.businessName}>{page.name}</Name>
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
              {b.email ? (
                <li>
                  <Mail size={15} strokeWidth={1.5} aria-hidden="true" />
                  <a href={`mailto:${b.email}`}>{b.email}</a>
                </li>
              ) : null}
              {website ? (
                <li>
                  <Globe size={15} strokeWidth={1.5} aria-hidden="true" />
                  <a href={website} rel="noopener noreferrer" target="_blank">
                    {website.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')}
                  </a>
                </li>
              ) : null}
            </ul>
          ) : null}
          {!compact && page.intro ? <p className={styles.intro}>{page.intro}</p> : null}
          {!compact && social.length ? (
            <ul className={styles.social} role="list" aria-label={`${page.name} online`}>
              {social.map((n) => (
                <li key={n.key}>
                  <a href={b.social[n.key]} rel="me noopener noreferrer" target="_blank">
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </header>
  );
}
