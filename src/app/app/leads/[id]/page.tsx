import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText, Mail, MessageSquare, Pencil, Phone } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { ButtonLink } from '@/components/app/ui/Button';
import { Notice } from '@/components/app/ui/Notice';
import { Panel } from '@/components/app/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { findDuplicates } from '@/data/customers';
import { getLead } from '@/data/leads';
import { requireBusiness } from '@/data/session';
import { formatPhone } from '@/domain/business';
import { customerName, idSchema } from '@/domain/customer';
import { leadStatus, leadVehicle, LOST_REASONS, pipelineHistoryLine, quoteStatus, SOURCE_LABELS } from '@/domain/leads';
import { formatCents } from '@/domain/service';
import { formatDate } from '@/domain/time';
import { FollowUpForm } from '../../follow-ups/FollowUpForm';
import { ConvertToCustomer, LeadActivityForm, LeadStatusForm } from './LeadActions';
import styles from '../leads.module.css';

export const metadata: Metadata = { title: 'Lead' };

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const { business } = await requireBusiness(`/app/leads/${id}`);
  if (!idSchema.safeParse(id).success) notFound();
  const found = await getLead(id);
  if (!found) notFound(); // also what another business's lead looks like (RLS)
  const { lead: l, history, quotes, customer } = found;
  const tz = business.timezone;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const name = [l.contact_first_name, l.contact_last_name].filter(Boolean).join(' ');
  const s = leadStatus(l.status);
  const when = (iso: string) => formatDate(tz, iso, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const matches = l.customer_id ? [] : (await findDuplicates(l.contact_phone_e164, l.contact_email)).filter((m) => !m.archived_at);

  return (
    <>
      <PageHeader
        title={
          <span className={styles.titleRow}>
            {name}
            <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
          </span>
        }
        description={`${SOURCE_LABELS[l.source] ?? l.source} lead · added ${formatDate(tz, l.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}`}
        back={
          <Link href="/app/leads">
            <ArrowLeft size={14} aria-hidden="true" /> Leads
          </Link>
        }
        actions={
          <>
            <ButtonLink href={`/app/leads/${id}/edit`} icon={<Pencil size={16} strokeWidth={1.5} aria-hidden="true" />}>
              Edit
            </ButtonLink>
            {l.status !== 'lost' ? (
              <ButtonLink href={`/app/quotes/new?lead=${id}`} variant="primary" icon={<FileText size={16} strokeWidth={1.5} aria-hidden="true" />}>
                Create quote
              </ButtonLink>
            ) : null}
          </>
        }
      />
      {saved ? (
        <div className={styles.flash}>
          <Notice tone="positive">Lead saved.</Notice>
        </div>
      ) : null}

      <div className={styles.detail}>
        <div className={styles.column}>
          <Panel title="Details" id="details">
            <dl className={styles.dl}>
              <dt>Contact</dt>
              <dd>
                <span className={styles.stack} style={{ gap: 4 }}>
                  {l.contact_phone_e164 ? (
                    <span>
                      <Phone size={14} aria-hidden="true" /> <a href={`tel:${l.contact_phone_e164}`}>{formatPhone(l.contact_phone_e164)}</a> ·{' '}
                      <MessageSquare size={14} aria-hidden="true" /> <a href={`sms:${l.contact_phone_e164}`}>Text</a>
                    </span>
                  ) : null}
                  {l.contact_email ? (
                    <span>
                      <Mail size={14} aria-hidden="true" /> <a href={`mailto:${l.contact_email}`}>{l.contact_email}</a>
                    </span>
                  ) : null}
                </span>
              </dd>
              <dt>Vehicle</dt>
              <dd>{[leadVehicle(l), l.size?.name].filter(Boolean).join(' · ') || 'Not recorded'}</dd>
              <dt>Wants</dt>
              <dd className={styles.preline}>
                {l.service?.name ? <strong>{l.service.name}</strong> : null}
                {l.service?.name && l.request_text ? <br /> : null}
                {l.request_text ?? (l.service ? null : 'Not recorded')}
              </dd>
              <dt>Last contacted</dt>
              <dd>{l.last_contacted_at ? when(l.last_contacted_at) : 'Not contacted yet'}</dd>
              {l.status === 'lost' && l.lost_reason ? (
                <>
                  <dt>Lost because</dt>
                  <dd>{LOST_REASONS.find((r) => r.value === l.lost_reason)?.label}</dd>
                </>
              ) : null}
              <dt>Customer</dt>
              <dd>
                {customer ? (
                  <Link href={`/app/customers/${customer.id}`}>{customerName(customer)}</Link>
                ) : (
                  <span className={styles.muted}>No customer record yet</span>
                )}
              </dd>
              {l.notes ? (
                <>
                  <dt>Internal notes</dt>
                  <dd className={styles.preline}>{l.notes}</dd>
                </>
              ) : null}
            </dl>
          </Panel>

          <Panel title="Quotes" id="quotes">
            {quotes.length ? (
              <ul className={styles.simpleList} role="list">
                {quotes.map((q) => {
                  const qs = quoteStatus(q.status, q.valid_until, today);
                  return (
                    <li key={q.id}>
                      <Link href={`/app/quotes/${q.id}`}>Quote #{q.number} · {formatCents(q.total_cents)}</Link>
                      <StatusBadge tone={qs.tone}>{qs.label}</StatusBadge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.muted}>No quotes yet.</p>
            )}
          </Panel>

          <Panel title="History" id="history">
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
          </Panel>
        </div>

        <div className={styles.column}>
          <Panel title="Status" id="status">
            <LeadStatusForm leadId={id} status={l.status} lostReason={l.lost_reason} />
          </Panel>
          <Panel title="Follow-up" id="follow-up">
            <FollowUpForm kind="lead" id={id} current={l.next_follow_up_at} note={l.follow_up_note} today={today} label={l.next_follow_up_at ? `Due ${when(l.next_follow_up_at)}` : null} />
          </Panel>
          <Panel title="Contact log" id="activity">
            <LeadActivityForm leadId={id} />
          </Panel>
          {!l.customer_id ? (
            <Panel title="Customer record" id="customer">
              <ConvertToCustomer leadId={id} matches={matches.map((m) => ({ id: m.id, name: customerName(m) }))} />
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
