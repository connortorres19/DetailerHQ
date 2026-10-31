import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Notice } from '@/components/app/ui/Notice';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { BusinessHeader } from '@/components/booking/BusinessHeader';
import { Policies } from '@/components/booking/Policies';
import { getPreviewBookingPage } from '@/data/booking';
import { getBusiness } from '@/data/session';
import { previewSlots } from './actions';

export const metadata: Metadata = { title: 'Booking page preview', robots: { index: false } };

// The owner's own page exactly as customers see it, in any state. Anyone else gets a 404.
export default async function PreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getBusiness();
  if (!business || business.slug !== slug) notFound();
  const page = await getPreviewBookingPage();
  const live = Boolean(page.published && page.accepting_requests);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: page.timezone }).format(new Date());

  return (
    <>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <Notice tone={live ? 'info' : 'attention'} action={<Link href="/app/booking-page">Back to settings</Link>}>
          Preview — {live ? 'this is your live page.' : 'your page is offline; customers can’t see it yet.'} Booking is turned off in the preview.
        </Notice>
      </div>
      <BusinessHeader page={page} />
      <BookingFlow page={{ ...page, accepting_requests: true }} today={today} loadSlots={previewSlots} preview />
      <Policies page={page} />
    </>
  );
}
