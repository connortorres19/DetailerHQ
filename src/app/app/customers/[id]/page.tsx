import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Car, Mail, MessageSquare, Pencil, Phone, Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { ButtonLink } from '@/components/app/ui/Button';
import { ConfirmAction } from '@/components/app/ui/ConfirmAction';
import { Notice } from '@/components/app/ui/Notice';
import { EmptyState, Panel } from '@/components/app/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { findDuplicates, getCustomer } from '@/data/customers';
import { requireBusiness } from '@/data/session';
import { formatPhone } from '@/domain/business';
import { CONTACT_PREFERENCES, LEAD_SOURCES, customerName, idSchema, vehicleName } from '@/domain/customer';
import { formatDate } from '@/domain/time';
import { archiveCustomer, archiveVehicle, restoreCustomer, restoreVehicle } from '../actions';
import styles from '../customers.module.css';

export const metadata: Metadata = { title: 'Customer' };

const SAVED: Record<string, [tone: 'positive' | 'critical', text: string]> = {
  created: ['positive', 'Customer added.'],
  updated: ['positive', 'Changes saved.'],
  archived: ['positive', 'Customer archived. Restore them any time.'],
  restored: ['positive', 'Customer restored.'],
  'vehicle-added': ['positive', 'Vehicle added.'],
  'vehicle-updated': ['positive', 'Vehicle saved.'],
  'vehicle-archived': ['positive', 'Vehicle archived.'],
  'vehicle-restored': ['positive', 'Vehicle restored.'],
  error: ['critical', 'That didn’t save. Please try again.'],
};

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { business } = await requireBusiness(`/app/customers/${id}`);
  if (!idSchema.safeParse(id).success) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound(); // also what another business's customer looks like (RLS)

  const { saved } = await searchParams;
  const flash = saved ? SAVED[saved] : undefined;
  const duplicates = customer.archived_at ? [] : (await findDuplicates(customer.phone_e164, customer.email, id)).filter((d) => !d.archived_at);
  const name = customerName(customer);
  const vehicles = customer.vehicles.filter((v) => !v.archived_at);
  const archivedVehicles = customer.vehicles.filter((v) => v.archived_at);
  const address = [customer.address_line1, [customer.city, customer.state].filter(Boolean).join(', '), customer.postal_code].filter(Boolean).join(' · ');
  const label = <T extends { value: string; label: string }>(list: readonly T[], value: string | null) => list.find((i) => i.value === value)?.label;

  return (
    <>
      <PageHeader
        title={
          <span className={styles.titleRow}>
            {name}
            {customer.archived_at ? <StatusBadge tone="neutral">Archived</StatusBadge> : null}
          </span>
        }
        description={`Customer since ${formatDate(business.timezone, customer.created_at, { month: 'short', year: 'numeric' })}`}
        back={
          <Link href="/app/customers">
            <ArrowLeft size={14} aria-hidden="true" /> Customers
          </Link>
        }
        actions={
          <>
            <ButtonLink href={`/app/customers/${id}/edit`} icon={<Pencil size={16} strokeWidth={1.5} aria-hidden="true" />}>
              Edit
            </ButtonLink>
            {customer.archived_at ? (
              <ConfirmAction
                action={restoreCustomer.bind(null, id)}
                label="Restore"
                confirmLabel="Restore customer"
                message={`Restore ${name}? They’ll appear in your customer list again.`}
              />
            ) : (
              <ConfirmAction
                action={archiveCustomer.bind(null, id)}
                label="Archive"
                confirmLabel="Archive customer"
                message={`Archive ${name}? They’ll be hidden from your customer list. Nothing is deleted, and you can restore them.`}
              />
            )}
          </>
        }
      />
      {flash ? (
        <div className={styles.flash}>
          <Notice tone={flash[0]}>{flash[1]}</Notice>
        </div>
      ) : null}
      {duplicates.length ? (
        <div className={styles.flash}>
          <Notice tone="attention">
            Possible duplicate: {duplicates.map((d, i) => (
              <span key={d.id}>
                {i ? ', ' : ''}
                <Link href={`/app/customers/${d.id}`}>{customerName(d)}</Link>
              </span>
            ))}{' '}
            {duplicates.length === 1 ? 'has' : 'have'} the same phone or email. Records are never merged automatically — check before adding vehicles or jobs.
          </Notice>
        </div>
      ) : null}

      <div className={styles.detail}>
        <Panel title="Contact" id="contact">
          <dl className={styles.dl}>
            <dt>Phone</dt>
            <dd className="tabular">
              {customer.phone_e164 ? (
                <span className={styles.contactRow}>
                  {formatPhone(customer.phone_e164)}
                  <a href={`tel:${customer.phone_e164}`} aria-label={`Call ${name}`}>
                    <Phone size={14} strokeWidth={1.5} aria-hidden="true" />
                  </a>
                  <a href={`sms:${customer.phone_e164}`} aria-label={`Text ${name}`}>
                    <MessageSquare size={14} strokeWidth={1.5} aria-hidden="true" />
                  </a>
                </span>
              ) : (
                '—'
              )}
            </dd>
            <dt>Email</dt>
            <dd>
              {customer.email ? (
                <span className={styles.contactRow}>
                  {customer.email}
                  <a href={`mailto:${customer.email}`} aria-label={`Email ${name}`}>
                    <Mail size={14} strokeWidth={1.5} aria-hidden="true" />
                  </a>
                </span>
              ) : (
                '—'
              )}
            </dd>
            <dt>Prefers</dt>
            <dd>{label(CONTACT_PREFERENCES, customer.preferred_contact) ?? 'No preference'}</dd>
            <dt>Address</dt>
            <dd>{address || '—'}</dd>
            <dt>Found you via</dt>
            <dd>{label(LEAD_SOURCES, customer.source) ?? 'Not recorded'}</dd>
          </dl>
          {customer.notes ? (
            <div className={styles.notes}>
              <h3 className={styles.subhead}>Notes</h3>
              <p>{customer.notes}</p>
            </div>
          ) : null}
        </Panel>

        <Panel
          title={`Vehicles · ${vehicles.length}`}
          id="vehicles"
          flush
          action={
            <ButtonLink href={`/app/customers/${id}/vehicles/new`} size="sm" icon={<Plus size={16} strokeWidth={1.5} aria-hidden="true" />}>
              Add vehicle
            </ButtonLink>
          }
        >
          {vehicles.length === 0 ? (
            <EmptyState icon={<Car size={20} strokeWidth={1.5} />} title="No vehicles yet" body="Add the vehicles you work on for this customer." />
          ) : (
            <ul className={styles.vehicles} role="list">
              {vehicles.map((v) => (
                <li key={v.id} className={styles.vehicle}>
                  <div>
                    <p className={styles.vehicleName}>{vehicleName(v)}</p>
                    <p className={styles.secondary}>
                      {[v.color, v.size_class?.name, v.plate].filter(Boolean).join(' · ') || 'No details yet'}
                    </p>
                    {v.notes ? <p className={styles.vehicleNotes}>{v.notes}</p> : null}
                  </div>
                  <div className={styles.vehicleActions}>
                    <ButtonLink href={`/app/customers/${id}/vehicles/${v.id}/edit`} size="sm" variant="ghost">
                      Edit
                    </ButtonLink>
                    <ConfirmAction
                      action={archiveVehicle.bind(null, id, v.id)}
                      label="Archive"
                      confirmLabel="Archive vehicle"
                      message={`Archive the ${vehicleName(v)}? Use this when it’s sold or no longer serviced. You can restore it.`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {archivedVehicles.length ? (
            <details className={styles.archived}>
              <summary>Archived vehicles · {archivedVehicles.length}</summary>
              <ul className={styles.vehicles} role="list">
                {archivedVehicles.map((v) => (
                  <li key={v.id} className={styles.vehicle}>
                    <p className={styles.secondary}>{vehicleName(v)}</p>
                    <ConfirmAction action={restoreVehicle.bind(null, id, v.id)} label="Restore" confirmLabel="Restore vehicle" message={`Restore the ${vehicleName(v)}?`} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
