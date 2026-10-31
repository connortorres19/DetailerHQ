import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { BusinessHeader } from '@/components/booking/BusinessHeader';
import { Policies } from '@/components/booking/Policies';
import { getPublicBookingPage } from '@/data/booking';
import { loadSlots, submitBooking } from './actions';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getPublicBookingPage((await params).slug);
  return page
    ? { title: `Book with ${page.name}`, description: page.intro ?? `Book a detailing appointment with ${page.name}.` }
    : { title: 'Booking page not available', robots: { index: false } };
}

export default async function BookingPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPublicBookingPage(slug);
  if (!page) notFound();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: page.timezone }).format(new Date());

  return (
    <>
      <BusinessHeader page={page} />
      <BookingFlow page={page} today={today} loadSlots={loadSlots} submit={submitBooking.bind(null, page.slug)} />
      <Policies page={page} />
    </>
  );
}
