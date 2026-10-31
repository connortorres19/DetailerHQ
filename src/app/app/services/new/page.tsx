import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { listSizeClasses } from '@/data/customers';
import { listCategories } from '@/data/services';
import { requireBusiness } from '@/data/session';
import { createService } from '../actions';
import { ServiceForm } from '../ServiceForm';
import styles from '../services.module.css';

export const metadata: Metadata = { title: 'Add service' };

export default async function NewServicePage() {
  await requireBusiness('/app/services/new');
  const [sizes, categories] = await Promise.all([listSizeClasses(), listCategories()]);
  return (
    <div className={styles.narrow}>
      <PageHeader
        title="Add service"
        back={
          <Link href="/app/services">
            <ArrowLeft size={14} aria-hidden="true" /> Services
          </Link>
        }
      />
      <ServiceForm
        action={createService}
        sizes={sizes}
        categories={categories}
        initial={{ priceType: 'fixed', baseHours: '2', baseMinutes: '0' }}
        submitLabel="Save service"
      />
    </div>
  );
}
