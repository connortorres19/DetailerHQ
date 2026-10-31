import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { getCustomerChoice } from '@/data/appointments';
import { getLead, leadFormOptions } from '@/data/leads';
import { requireBusiness } from '@/data/session';
import { formatPhone } from '@/domain/business';
import { idSchema } from '@/domain/customer';
import { LeadForm } from '../../LeadForm';

export const metadata: Metadata = { title: 'Edit lead' };

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireBusiness(`/app/leads/${id}/edit`);
  if (!idSchema.safeParse(id).success) notFound();
  const [found, options] = await Promise.all([getLead(id), leadFormOptions()]);
  if (!found) notFound();
  const l = found.lead;
  const customer = l.customer_id ? await getCustomerChoice(l.customer_id) : null;
  return (
    <>
      <PageHeader
        title="Edit lead"
        back={
          <Link href={`/app/leads/${id}`}>
            <ArrowLeft size={14} aria-hidden="true" /> Lead
          </Link>
        }
      />
      <LeadForm
        leadId={id}
        initialCustomer={customer}
        services={options.services}
        sizes={options.sizes}
        initial={{
          source: l.source,
          firstName: l.contact_first_name,
          lastName: l.contact_last_name ?? '',
          phone: formatPhone(l.contact_phone_e164),
          email: l.contact_email ?? '',
          vehicleId: l.vehicle_id ?? '',
          year: l.vehicle_year ? String(l.vehicle_year) : '',
          make: l.vehicle_make ?? '',
          model: l.vehicle_model ?? '',
          sizeId: l.size_class_id ?? '',
          serviceId: l.service_id ?? '',
          request: l.request_text ?? '',
          notes: l.notes ?? '',
        }}
      />
    </>
  );
}
