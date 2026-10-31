import type { Metadata } from 'next';
import { Panel } from '@/components/app/ui/Panel';
import { requireBusiness } from '@/data/session';
import { SERVICE_MODES, US_TIMEZONES, formatPhone } from '@/domain/business';
import { env } from '@/lib/env';
import Link from 'next/link';
import { BookingModeForm, BusinessProfileForm } from './forms';
import { getBookingMode } from '@/data/availability';
import styles from './settings.module.css';

export const metadata: Metadata = { title: 'Business settings' };

export default async function BusinessSettingsPage() {
  const { business } = await requireBusiness('/app/settings');
  const bookingMode = await getBookingMode();
  const mode = SERVICE_MODES.find((m) => m.value === business.service_mode);
  const timezone = US_TIMEZONES.find((t) => t.value === business.timezone);

  return (
    <div className={styles.stack}>
      <Panel title="Business details" id="business-details">
        <BusinessProfileForm
          mode={business.service_mode}
          initial={{
            name: business.name,
            phone: formatPhone(business.phone_e164),
            email: business.email ?? '',
            serviceAreaText: business.service_area_text ?? '',
            shopAddressLine1: business.shop_address_line1 ?? '',
            shopCity: business.shop_city ?? '',
            shopState: business.shop_state ?? '',
            shopPostalCode: business.shop_postal_code ?? '',
          }}
        />
      </Panel>

      <Panel title="Set at setup" id="fixed">
        <dl className={styles.dl}>
          <dt>Booking link</dt>
          <dd className={styles.mono}>
            {new URL(env.NEXT_PUBLIC_SITE_URL).host}/b/{business.slug}
          </dd>
          <dt>Time zone</dt>
          <dd>
            {timezone?.label} <span className={styles.muted}>({business.timezone})</span>
          </dd>
          <dt>Where you work</dt>
          <dd>{mode?.label}</dd>
        </dl>
        <p className={styles.muted}>These can’t be changed from the app yet. They affect your booking link and every time customers see.</p>
      </Panel>

      <Panel title="How customers book" id="booking-mode">
        <BookingModeForm current={bookingMode} />
        <p className={styles.muted}>
          Working hours, blocked time, booking rules and jobs at the same time are in <Link href="/app/availability">Availability</Link>.
        </p>
      </Panel>
    </div>
  );
}
