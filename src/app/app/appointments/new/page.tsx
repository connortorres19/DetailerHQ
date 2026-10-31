import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { Notice } from '@/components/app/ui/Notice';
import { getCalendarHold, getCustomerChoice, getOwnerMenu } from '@/data/appointments';
import { requireBusiness } from '@/data/session';
import { isIsoDate } from '@/domain/bookings';
import { US_TIMEZONES } from '@/domain/business';
import { idSchema } from '@/domain/customer';
import { AppointmentForm } from './AppointmentForm';
import styles from './appointments.module.css';

export const metadata: Metadata = { title: 'New appointment' };

// Book a customer who called, texted or walked in — or turn a calendar hold into a booking.
export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<{ customer?: string; hold?: string; date?: string }> }) {
  const { business } = await requireBusiness('/app/appointments/new');
  const sp = await searchParams;
  const tz = business.timezone;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const [menu, customer, hold] = await Promise.all([
    getOwnerMenu(),
    sp.customer && idSchema.safeParse(sp.customer).success ? getCustomerChoice(sp.customer) : Promise.resolve(null),
    sp.hold && idSchema.safeParse(sp.hold).success ? getCalendarHold(sp.hold) : Promise.resolve(null),
  ]);
  const holdMissing = Boolean(sp.hold) && !hold;

  return (
    <>
      <PageHeader
        title={hold ? 'Book this hold' : 'New appointment'}
        description="For customers who call, text or walk in. Confirmed straight away, using your hours, prices and capacity."
        back={
          <Link href={hold ? '/app/calendar' : '/app/bookings'}>
            <ArrowLeft size={14} aria-hidden="true" /> {hold ? 'Calendar' : 'Bookings'}
          </Link>
        }
      />
      {holdMissing ? (
        <div className={styles.flash}>
          <Notice tone="attention">That hold has expired or was released. Choose a time below instead.</Notice>
        </div>
      ) : null}
      <AppointmentForm
        services={menu.services}
        sizes={menu.sizes}
        serviceMode={business.service_mode}
        tz={tz}
        zone={US_TIMEZONES.find((z) => z.value === tz)?.label ?? tz}
        today={today}
        initialDate={sp.date && isIsoDate(sp.date) && sp.date >= today ? sp.date : today}
        initialCustomer={customer}
        hold={hold}
      />
    </>
  );
}
