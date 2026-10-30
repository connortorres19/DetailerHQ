import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { getVehicle, listSizeClasses } from '@/data/customers';
import { requireBusiness } from '@/data/session';
import { customerName, idSchema, vehicleName } from '@/domain/customer';
import { updateVehicle } from '../../../../actions';
import { VehicleForm } from '../../../../VehicleForm';
import { vehicleValues } from '../../../../values';
import styles from '../../../../customers.module.css';

export const metadata: Metadata = { title: 'Edit vehicle' };

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string; vehicleId: string }> }) {
  const { id, vehicleId } = await params;
  await requireBusiness(`/app/customers/${id}`);
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(vehicleId).success) notFound();
  const [vehicle, sizes] = await Promise.all([getVehicle(id, vehicleId), listSizeClasses()]);
  if (!vehicle || !vehicle.customer) notFound();
  return (
    <div className={styles.narrow}>
      <PageHeader
        title={`Edit ${vehicleName(vehicle)}`}
        description={`For ${customerName(vehicle.customer)}`}
        back={
          <Link href={`/app/customers/${id}`}>
            <ArrowLeft size={14} aria-hidden="true" /> {customerName(vehicle.customer)}
          </Link>
        }
      />
      <VehicleForm
        action={updateVehicle.bind(null, id, vehicleId)}
        sizes={sizes}
        initial={vehicleValues(vehicle)}
        submitLabel="Save changes"
        cancelHref={`/app/customers/${id}`}
      />
    </div>
  );
}
