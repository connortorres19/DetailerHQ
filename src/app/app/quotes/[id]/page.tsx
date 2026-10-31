import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { Notice } from '@/components/app/ui/Notice';
import { Panel } from '@/components/app/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QuoteDocument } from '@/components/quotes/QuoteDocument';
import { getCustomerChoice } from '@/data/appointments';
import { getQuote, quoteCatalog } from '@/data/leads';
import { requireBusiness } from '@/data/session';
import { idSchema } from '@/domain/customer';
import { pipelineHistoryLine, quoteDuration, quoteStatus } from '@/domain/leads';
import { formatDate } from '@/domain/time';
import { env } from '@/lib/env';
import { quoteTokenFor } from '@/lib/booking/server';
import { FollowUpForm } from '../../follow-ups/FollowUpForm';
import { QuoteEditor } from '../QuoteEditor';
import { fromQuote } from '../initial';
import { ConvertQuote, QuoteActions } from './QuoteActions';
import styles from '../styles';

export const metadata: Metadata = { title: 'Quote' };

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; sent?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { business } = await requireBusiness(`/app/quotes/${id}`);
  if (!idSchema.safeParse(id).success) notFound();
  const found = await getQuote(id);
  if (!found) notFound(); // also what another business's quote looks like (RLS)
  const { quote: q, history, appointment, lead } = found;
  const tz = business.timezone;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const s = quoteStatus(q.status, q.valid_until, today);
  const name = q.customer ? [q.customer.first_name, q.customer.last_name].filter(Boolean).join(' ') : 'No customer';
  const when = (iso: string) => formatDate(tz, iso, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  // The link is rebuilt from the stored nonce with the server secret (only its hash is stored).
  const link = q.status === 'sent' && q.token_nonce && q.link_version ? `${env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/q/${quoteTokenFor(q.token_nonce, q.link_version).token}` : null;
  const draft = q.status === 'draft';
  const [catalog, customer] = draft ? await Promise.all([quoteCatalog(), q.customer_id ? getCustomerChoice(q.customer_id) : Promise.resolve(null)]) : [null, null];

  return (
    <>
      <PageHeader
        title={
          <span className={styles.titleRow}>
            Quote #{q.number} · {name}
            <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
          </span>
        }
        description={q.vehicle_text ?? undefined}
        back={
          <Link href="/app/quotes">
            <ArrowLeft size={14} aria-hidden="true" /> Quotes
          </Link>
        }
      />
      {sp.saved || sp.sent ? (
        <div className={styles.flash}>
          <Notice tone="positive">{sp.sent ? 'Quote sent. Copy the link below and send it to the customer.' : 'Draft saved.'}</Notice>
        </div>
      ) : null}

      <div className={styles.detail}>
        <div className={styles.column}>
          {draft && catalog ? (
            <QuoteEditor quoteId={q.id} initial={fromQuote(q, customer, tz)} services={catalog.services} sizes={catalog.sizes} today={today} />
          ) : (
            <QuoteDocument
              q={{
                number: q.number,
                business: { name: business.name, phone: business.phone_e164, timezone: tz },
                customerFirstName: q.customer?.first_name ?? null,
                vehicle: q.vehicle_text,
                items: q.quote_items,
                subtotalCents: q.subtotal_cents,
                discountCents: q.discount_cents,
                totalCents: q.total_cents,
                validUntil: q.valid_until,
                notes: q.notes,
                terms: q.terms,
                proposedStart: q.proposed_start,
                sentAt: q.sent_at,
              }}
            />
          )}
          {q.status === 'accepted' ? (
            <Panel title="Book this quote" id="convert">
              <ConvertQuote
                quoteId={q.id}
                durationMin={quoteDuration(q.quote_items.map((i) => ({ quantity: i.quantity, durationMin: i.duration_min })))}
                proposedStart={q.proposed_start}
                tz={tz}
                today={today}
                serviceMode={business.service_mode}
                address={{ line1: q.customer?.address_line1 ?? '', city: q.customer?.city ?? '', state: q.customer?.state ?? '', postalCode: q.customer?.postal_code ?? '' }}
              />
            </Panel>
          ) : null}
        </div>

        <div className={styles.column}>
          <Panel title={draft ? 'Send' : 'Quote'} id="actions">
            <QuoteActions quoteId={q.id} status={s.value === 'expired' ? 'expired' : q.status} link={s.value === 'expired' ? null : link} internalNotes={q.internal_notes} />
          </Panel>
          <Panel title="Related" id="related">
            <dl className={styles.dl}>
              <dt>Customer</dt>
              <dd>{q.customer ? <Link href={`/app/customers/${q.customer.id}`}>{name}</Link> : '—'}</dd>
              {lead ? (
                <>
                  <dt>Lead</dt>
                  <dd>
                    <Link href={`/app/leads/${lead.id}`}>{[lead.contact_first_name, lead.contact_last_name].filter(Boolean).join(' ')}</Link>
                  </dd>
                </>
              ) : null}
              {appointment ? (
                <>
                  <dt>Booking</dt>
                  <dd>
                    <Link href={`/app/bookings/${appointment.id}`}>{when(appointment.starts_at)}</Link>
                  </dd>
                </>
              ) : null}
              {q.sent_at ? (
                <>
                  <dt>Sent</dt>
                  <dd>{when(q.sent_at)}</dd>
                </>
              ) : null}
              {q.decided_at ? (
                <>
                  <dt>Answered</dt>
                  <dd>{when(q.decided_at)}</dd>
                </>
              ) : null}
            </dl>
          </Panel>
          {q.status === 'sent' || q.status === 'accepted' ? (
            <Panel title="Follow-up" id="follow-up">
              <FollowUpForm kind="quote" id={q.id} current={q.next_follow_up_at} note={q.follow_up_note} today={today} label={q.next_follow_up_at ? `Due ${when(q.next_follow_up_at)}` : null} />
            </Panel>
          ) : null}
          <Panel title="History" id="history">
            {history.length ? (
              <ol className={styles.timeline} role="list">
                {history.map((e) => (
                  <li key={e.id}>
                    <span>{pipelineHistoryLine({ ...e, metadata: (e.metadata ?? {}) as Record<string, unknown> })}</span>
                    <time className={styles.muted} dateTime={e.created_at}>
                      {when(e.created_at)}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.muted}>Not sent yet.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
