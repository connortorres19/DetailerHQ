import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { ConfirmAction } from '@/components/app/ui/ConfirmAction';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { listSizeClasses } from '@/data/customers';
import { getService, listCategories } from '@/data/services';
import { requireBusiness } from '@/data/session';
import { idSchema } from '@/domain/customer';
import { archiveService, restoreService, updateService } from '../actions';
import { ServiceForm } from '../ServiceForm';
import { serviceValues } from '../values';
import styles from '../services.module.css';

export const metadata: Metadata = { title: 'Edit service' };

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireBusiness(`/app/services/${id}`);
  if (!idSchema.safeParse(id).success) notFound();
  const [service, sizes, categories] = await Promise.all([getService(id), listSizeClasses(), listCategories()]);
  if (!service) notFound(); // also what another business's service looks like (RLS)

  return (
    <div className={styles.narrow}>
      <PageHeader
        title={
          <span className={styles.titleRow}>
            {service.name}
            {service.archived_at ? <StatusBadge tone="neutral">Archived</StatusBadge> : null}
          </span>
        }
        back={
          <Link href="/app/services">
            <ArrowLeft size={14} aria-hidden="true" /> Services
          </Link>
        }
        actions={
          service.archived_at ? (
            <ConfirmAction action={restoreService.bind(null, id)} label="Restore" confirmLabel="Restore service" message={`Restore ${service.name}?`} />
          ) : (
            <ConfirmAction
              action={archiveService.bind(null, id)}
              label="Archive"
              confirmLabel="Archive service"
              message={`Archive ${service.name}? It won’t be offered any more. Past requests and appointments keep it, and you can restore it.`}
            />
          )
        }
      />
      <ServiceForm action={updateService.bind(null, id)} sizes={sizes} categories={categories} initial={serviceValues(service)} submitLabel="Save changes" />
    </div>
  );
}
