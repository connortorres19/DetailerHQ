import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { getCustomer } from '@/data/customers';
import { requireBusiness } from '@/data/session';
import { customerName, idSchema } from '@/domain/customer';
import { updateCustomer } from '../../actions';
import { CustomerForm } from '../../CustomerForm';
import { customerValues } from '../../values';
import styles from '../../customers.module.css';

export const metadata: Metadata = { title: 'Edit customer' };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireBusiness(`/app/customers/${id}/edit`);
  if (!idSchema.safeParse(id).success) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound();
  return (
    <div className={styles.narrow}>
      <PageHeader
        title={`Edit ${customerName(customer)}`}
        back={
          <Link href={`/app/customers/${id}`}>
            <ArrowLeft size={14} aria-hidden="true" /> {customerName(customer)}
          </Link>
        }
      />
      <CustomerForm action={updateCustomer.bind(null, id)} initial={customerValues(customer)} submitLabel="Save changes" cancelHref={`/app/customers/${id}`} />
    </div>
  );
}
