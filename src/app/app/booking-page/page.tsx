import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Circle, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { ButtonLink } from '@/components/app/ui/Button';
import { Panel } from '@/components/app/ui/Panel';
import { requireBusiness } from '@/data/session';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { CancellationForm, CopyBookingLink, LiveForm } from './forms';
import styles from './booking-page.module.css';

export const metadata: Metadata = { title: 'Booking page' };

export default async function BookingPageSettings() {
  const { business } = await requireBusiness('/app/booking-page');
  const supabase = await createClient();
  const [settings, hours, services] = await Promise.all([
    supabase
      .from('booking_settings')
      .select('customer_can_cancel, booking_mode')
      .single(),
    supabase.from('availability_rules').select('id', { count: 'exact', head: true }),
    supabase.from('services').select('id', { count: 'exact', head: true }).is('archived_at', null).eq('is_bookable', true).eq('is_addon', false),
  ]);
  if (settings.error) throw new Error(`Could not load booking page settings: ${settings.error.message}`);
  const s = settings.data;
  const live = Boolean(business.published_at && business.accepting_requests);
  const url = `${env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/book/${business.slug}`;
  const ready = [
    { done: Boolean(business.activated_at), label: 'Confirm your email address' },
    { done: (hours.count ?? 0) > 0, label: 'Set your working hours', href: '/app/availability' },
    { done: (services.count ?? 0) > 0, label: 'Add a service customers can book online', href: '/app/services' },
  ];

  return (
    <>
      <PageHeader title="Booking page" description="The page you share with customers. They book without an account." />
      <div className={styles.stack}>
        <Panel title="Your page" id="status">
          <div className={styles.status}>
            <p className={styles.state}>
              <span className={live ? styles.live : styles.offline}>{live ? 'Live' : 'Offline'}</span>
              {live
                ? s.booking_mode === 'instant'
                  ? 'Customers can book open times instantly.'
                  : 'Customers can send booking requests for you to approve.'
                : 'Customers who open the link see that the page isn’t available.'}
            </p>
            <p className={styles.url}>
              <span className={styles.mono}>{url.replace(/^https?:\/\//, '')}</span>
              <CopyBookingLink url={url} />
            </p>
            <div className={styles.buttons}>
              <ButtonLink href={`/book/${business.slug}/preview`} icon={<ExternalLink size={16} strokeWidth={1.5} aria-hidden="true" />}>
                Preview
              </ButtonLink>
              <LiveForm live={live} />
            </div>
            {!live ? (
              <ul className={styles.ready} role="list" aria-label="Before going live">
                {ready.map((r) => (
                  <li key={r.label} data-done={r.done}>
                    {r.done ? <Check size={16} strokeWidth={2} aria-hidden="true" /> : <Circle size={16} strokeWidth={1.5} aria-hidden="true" />}
                    {r.done || !r.href ? <span>{r.label}</span> : <Link href={r.href}>{r.label}</Link>}
                    <span className="visually-hidden">{r.done ? '(done)' : '(to do)'}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className={styles.hint}>
              Approval or instant booking is set in <Link href="/app/settings#booking-mode">Settings</Link>; hours, notice and cutoffs in{' '}
              <Link href="/app/availability">Availability</Link>.
            </p>
          </div>
        </Panel>
        <Panel title="Look and wording" id="text">
          <p className={styles.hint}>
            Your logo, colours, cover photo, gallery, description and policies are set in <Link href="/app/settings/branding">Settings → Branding</Link>,
            with a live preview before you publish.
          </p>
          <div className={styles.buttons}>
            <ButtonLink href="/app/settings/branding">Edit branding</ButtonLink>
          </div>
        </Panel>
        <Panel title="Cancelling online" id="cancelling">
          <CancellationForm online={s.customer_can_cancel} />
        </Panel>
      </div>
    </>
  );
}
