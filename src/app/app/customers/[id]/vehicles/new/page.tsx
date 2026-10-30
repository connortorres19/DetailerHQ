import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { getCustomer, listSizeClasses } from '@/data/customers';
import { requireBusiness } from '@/data/session';
import { customerName, idSchema } from '@/domain/customer';
import { createVehicle } from '../../../actions';
import { VehicleForm } from '../../../VehicleForm';
import styles from '../../../customers.module.css';

export const metadata: Metadata = { title: 'Add vehicle' };

export default async function NewVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireBusiness(`/app/customers/${id}/vehicles/new`);
  if (!idSchema.safeParse(id).success) notFound();
  const [customer, sizes] = await Promise.all([getCustomer(id), listSizeClasses()]);
  if (!customer) notFound();
  return (
    <div className={styles.narrow}>
      <PageHeader
        title="Add vehicle"
        description={`For ${customerName(customer)}`}
        back={
          <Link href={`/app/customers/${id}`}>
            <ArrowLeft size={14} aria-hidden="true" /> {customerName(customer)}
          </Link>
        }
      />
      <VehicleForm action={createVehicle.bind(null, id)} sizes={sizes} submitLabel="Save vehicle" cancelHref={`/app/customers/${id}`} />
    </div>
  );
}
