import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { requireBusiness } from '@/data/session';
import { createCustomer } from '../actions';
import { CustomerForm } from '../CustomerForm';
import styles from '../customers.module.css';

export const metadata: Metadata = { title: 'Add customer' };

export default async function NewCustomerPage() {
  await requireBusiness('/app/customers/new');
  return (
    <div className={styles.narrow}>
      <PageHeader
        title="Add customer"
        back={
          <Link href="/app/customers">
            <ArrowLeft size={14} aria-hidden="true" /> Customers
          </Link>
        }
      />
      <CustomerForm action={createCustomer} submitLabel="Save customer" cancelHref="/app/customers" />
    </div>
  );
}
