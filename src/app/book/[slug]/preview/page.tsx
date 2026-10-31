import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Notice } from '@/components/app/ui/Notice';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { BrandScope, Gallery } from '@/components/booking/Branding';
import { BusinessHeader } from '@/components/booking/BusinessHeader';
import { Policies } from '@/components/booking/Policies';
import { getPreviewBookingPage } from '@/data/booking';
import { getBusiness } from '@/data/session';
import { previewSlots } from './actions';

export const metadata: Metadata = { title: 'Booking page preview', robots: { index: false } };

// The owner's own page exactly as customers see it, in any state. Anyone else gets a 404.
// ?draft=1 shows saved but unpublished branding changes (Settings → Branding).
export default async function PreviewPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ draft?: string }> }) {
  const { slug } = await params;
  const draft = (await searchParams).draft === '1';
  const business = await getBusiness();
  if (!business || business.slug !== slug) notFound();
  const page = await getPreviewBookingPage(draft);
  const live = Boolean(page.published && page.accepting_requests);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: page.timezone }).format(new Date());

  return (
    <>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <Notice
          tone={draft ? 'attention' : live ? 'info' : 'attention'}
          action={<Link href={draft ? '/app/settings/branding' : '/app/booking-page'}>Back to {draft ? 'branding' : 'settings'}</Link>}
        >
          {draft
            ? 'Draft preview — your saved branding changes, not yet published. Customers still see your published page.'
            : `Preview — ${live ? 'this is your live page.' : 'your page is offline; customers can’t see it yet.'}`}{' '}
          Booking is turned off in the preview.
        </Notice>
      </div>
      <BrandScope branding={page.branding}>
        <BusinessHeader page={page} />
        <BookingFlow page={{ ...page, accepting_requests: true }} today={today} loadSlots={previewSlots} preview />
        <Gallery branding={page.branding} name={page.name} />
        <Policies page={page} />
      </BrandScope>
    </>
  );
}
