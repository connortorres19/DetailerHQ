import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { getCustomerChoice } from '@/data/appointments';
import { leadFormOptions } from '@/data/leads';
import { requireBusiness } from '@/data/session';
import { idSchema } from '@/domain/customer';
import { LeadForm } from '../LeadForm';

export const metadata: Metadata = { title: 'New lead' };

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  await requireBusiness('/app/leads/new');
  const { customer } = await searchParams;
  const [options, initialCustomer] = await Promise.all([
    leadFormOptions(),
    customer && idSchema.safeParse(customer).success ? getCustomerChoice(customer) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader
        title="New lead"
        back={
          <Link href="/app/leads">
            <ArrowLeft size={14} aria-hidden="true" /> Leads
          </Link>
        }
      />
      <LeadForm leadId={null} initial={{ source: 'phone' }} initialCustomer={initialCustomer} services={options.services} sizes={options.sizes} />
    </>
  );
}
