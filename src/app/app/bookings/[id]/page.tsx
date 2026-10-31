import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, MessageSquare, Phone } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { Notice } from '@/components/app/ui/Notice';
import { Panel } from '@/components/app/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getBooking } from '@/data/bookings';
import { requireBusiness } from '@/data/session';
import { linePrice, estimateLabel } from '@/domain/booking';
import { SOURCE_LABEL } from '@/domain/appointments';
import { historyLine, STATUS_LABEL } from '@/domain/bookings';
import { formatPhone, US_TIMEZONES } from '@/domain/business';
import { idSchema } from '@/domain/customer';
import { formatDuration } from '@/domain/service';
import { formatDate } from '@/domain/time';
import { BookingActions } from './BookingActions';
import styles from '../bookings.module.css';

export const metadata: Metadata = { title: 'Booking' };

export default async function BookingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const { business } = await requireBusiness(`/app/bookings/${id}`);
  if (!idSchema.safeParse(id).success) notFound();
  const booking = await getBooking(id);
  if (!booking) notFound(); // also what another business's booking looks like (RLS)

  const { row, request, appointment, history, holdExpiresAt, duplicateOf, matches } = booking;
  const tz = business.timezone;
  const zone = US_TIMEZONES.find((z) => z.value === tz)?.label ?? tz;
  const when = (iso: string) => formatDate(tz, iso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const short = (iso: string) => formatDate(tz, iso, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const [label, tone] = STATUS_LABEL[row.status];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const started = new Date(row.start) <= new Date();
  const r = request as Record<string, string | number | null> | null;
  const address =
    (appointment?.service_address_line1 as string | null) ?? (r?.service_address_line1 as string | null)
      ? [appointment?.service_address_line1 ?? r?.service_address_line1, appointment?.service_city ?? r?.service_city, appointment?.service_state ?? r?.service_state, appointment?.service_postal_code ?? r?.service_postal_code]
          .filter(Boolean)
          .join(', ')
      : null;
  const location = ((appointment?.location_type ?? r?.location_type) as string) === 'shop' ? 'At your shop' : address ?? 'Customer’s address';
  const customerHref = appointment?.customer?.id ?? (r?.customer_id as string | null) ?? null;

  return (
    <>
      <PageHeader
        title={
          <span className={styles.titleRow}>
            {row.name}
            <StatusBadge tone={tone}>{label}</StatusBadge>
          </span>
        }
        description={`Booking #${row.number} · ${when(row.start)}`}
        back={
          <Link href="/app/bookings">
            <ArrowLeft size={14} aria-hidden="true" /> Bookings
          </Link>
        }
      />

      <div className={styles.notices}>
        {created === '1' ? <Notice tone="positive">Appointment created. It’s on your calendar now.</Notice> : null}
        {matches.length ? (
          <Notice tone="attention">
            Possible existing customer:{' '}
            {matches.map((m, i) => (
              <span key={m.id}>
                {i ? ', ' : ''}
                <Link href={`/app/customers/${m.id}`}>{[m.first_name, m.last_name].filter(Boolean).join(' ')}</Link>
              </span>
            ))}{' '}
            — same phone or email. Records are never merged automatically; you can choose the existing customer when you confirm.
          </Notice>
        ) : null}
        {duplicateOf ? (
          <Notice tone="info">
            Looks like a repeat of <Link href={`/app/bookings/${duplicateOf.id}`}>request #{duplicateOf.number}</Link> (same contact, vehicle and day).
          </Notice>
        ) : null}
        {holdExpiresAt && row.status === 'pending' ? <Notice tone="info">You’re holding this time until {short(holdExpiresAt)}. The customer still sees “pending”.</Notice> : null}
        {row.proposal ? (
          <Notice tone="info">
            You proposed {when(row.proposal.start)}. The customer can accept or decline on their booking link until {short(row.proposal.expiresAt)}; it’s confirmed only if they accept.
          </Notice>
        ) : null}
      </div>

      <div className={styles.detail}>
        <div className={styles.detailMain}>
          <Panel title="Actions" id="actions">
            <BookingActions
              bookingId={row.id}
              requestId={row.requestId}
              appointmentId={row.appointmentId}
              status={row.status}
              started={started}
              heldUntil={holdExpiresAt}
              duplicateOf={duplicateOf && ['pending', 'time_proposed'].includes(String(r?.status)) ? { id: duplicateOf.id, number: duplicateOf.number } : null}
              matches={matches.map((m) => ({
                id: m.id,
                name: [m.first_name, m.last_name].filter(Boolean).join(' '),
                vehicles: m.vehicles.filter((v) => !v.archived_at).map((v) => ({ id: v.id, label: [v.year, v.make, v.model].filter(Boolean).join(' ') })),
              }))}
              tz={tz}
              today={today}
              vehicleLabel={row.vehicle}
            />
          </Panel>

          <Panel title="Appointment" id="when">
            <dl className={styles.dl}>
              <dt>{appointment ? 'When' : 'Requested'}</dt>
              <dd>
                {when(row.start)}
                <span className={styles.meta}>
                  {formatDuration(row.durationMin)} · ends {formatDate(tz, row.end, { hour: 'numeric', minute: '2-digit' })} · {zone}
                </span>
              </dd>
              <dt>Where</dt>
              <dd>{location}</dd>
              <dt>Source</dt>
              <dd>{SOURCE_LABEL[row.source] ?? row.source}</dd>
              {appointment?.internal_notes ? (
                <>
                  <dt>Internal notes</dt>
                  <dd className={styles.preline}>
                    {String(appointment.internal_notes)} <span className={styles.meta}>(private)</span>
                  </dd>
                </>
              ) : null}
              {appointment?.cancel_reason ? (
                <>
                  <dt>Cancel reason</dt>
                  <dd>{String(appointment.cancel_reason)} <span className={styles.meta}>(private)</span></dd>
                </>
              ) : null}
              {r?.decline_reason ? (
                <>
                  <dt>Decline reason</dt>
                  <dd>{String(r.decline_reason)} <span className={styles.meta}>(private)</span></dd>
                </>
              ) : null}
              {r?.decline_message || appointment?.customer_message ? (
                <>
                  <dt>Shown to customer</dt>
                  <dd>“{String(r?.decline_message ?? appointment?.customer_message)}”</dd>
                </>
              ) : null}
            </dl>
          </Panel>

          <Panel title="Services" id="services">
            <table className={styles.breakdown}>
              <tbody>
                {row.items.map((i, n) => (
                  <tr key={`${i.name}-${n}`}>
                    <th scope="row">
                      {i.isAddon ? '+ ' : ''}
                      {i.name}
                      <span className={styles.meta}>{formatDuration(i.durationMin)}</span>
                    </th>
                    <td>{linePrice(i)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">
                    Estimated total
                    <span className={styles.meta}>
                      {formatDuration(row.durationMin)}
                      {row.sizeName ? ` · priced for ${row.sizeName}` : ''}
                    </span>
                  </th>
                  <td>{estimateLabel({ totalCents: row.totalCents, isMinimum: row.isMinimum })}</td>
                </tr>
              </tfoot>
            </table>
          </Panel>
        </div>

        <div className={styles.detailSide}>
          <Panel title="Customer" id="customer">
            <p className={styles.name}>{row.name}</p>
            <ul className={styles.contact} role="list">
              {row.phone ? (
                <>
                  <li>
                    <Phone size={15} strokeWidth={1.5} aria-hidden="true" />
                    <a href={`tel:${row.phone}`}>{formatPhone(row.phone)}</a>
                  </li>
                  <li>
                    <MessageSquare size={15} strokeWidth={1.5} aria-hidden="true" />
                    <a href={`sms:${row.phone}`}>Text {formatPhone(row.phone)}</a>
                  </li>
                </>
              ) : null}
              {row.email ? (
                <li>
                  <Mail size={15} strokeWidth={1.5} aria-hidden="true" />
                  <a href={`mailto:${row.email}`}>{row.email}</a>
                </li>
              ) : null}
            </ul>
            {r?.preferred_contact ? <p className={styles.meta}>Prefers {String(r.preferred_contact)}</p> : null}
            {customerHref ? (
              <p>
                <Link href={`/app/customers/${customerHref}`}>Open customer record</Link>
              </p>
            ) : (
              <p className={styles.meta}>A customer record is created when you confirm.</p>
            )}
            {customerHref ? (
              <p>
                <Link href={`/app/appointments/new?customer=${customerHref}`}>Book again</Link>
              </p>
            ) : null}
          </Panel>

          <Panel title="Vehicle" id="vehicle">
            <p className={styles.name}>{row.vehicle}</p>
            <p className={styles.meta}>{[row.sizeName, r?.vehicle_color ?? appointment?.vehicle?.color].filter(Boolean).join(' · ')}</p>
            {r?.vehicle_notes ? <p className={styles.quote}>“{String(r.vehicle_notes)}”</p> : null}
          </Panel>

          {row.notes ? (
            <Panel title="Customer notes" id="notes">
              <p className={styles.quote}>“{row.notes}”</p>
            </Panel>
          ) : null}

          <Panel title="History" id="history">
            {history.length ? (
              <ol className={styles.timeline} role="list">
                {history.map((e) => (
                  <li key={e.id}>
                    <span>{historyLine({ ...e, metadata: (e.metadata ?? {}) as Record<string, unknown> })}</span>
                    <time className={styles.meta} dateTime={e.created_at}>
                      {short(e.created_at)}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.meta}>No history yet.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
