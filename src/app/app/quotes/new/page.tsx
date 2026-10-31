import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { getLead, quoteCatalog } from '@/data/leads';
import { requireBusiness } from '@/data/session';
import { idSchema } from '@/domain/customer';
import { QuoteEditor } from '../QuoteEditor';
import { empty, fromCustomer, fromLead } from '../initial';

export const metadata: Metadata = { title: 'New quote' };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ lead?: string; customer?: string }> }) {
  const { business } = await requireBusiness('/app/quotes/new');
  const sp = await searchParams;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: business.timezone }).format(new Date());
  const catalog = await quoteCatalog();
  const lead = sp.lead && idSchema.safeParse(sp.lead).success ? await getLead(sp.lead) : null;
  const initial = lead
    ? await fromLead(lead.lead, today, catalog.services.find((s) => s.id === lead.lead.service_id) ?? null)
    : sp.customer && idSchema.safeParse(sp.customer).success
      ? await fromCustomer(sp.customer, today)
      : empty(today);
  return (
    <>
      <PageHeader
        title="New quote"
        description={lead ? `For ${[lead.lead.contact_first_name, lead.lead.contact_last_name].filter(Boolean).join(' ')}` : 'Prices are saved with the quote — later catalog changes won’t alter it.'}
        back={
          <Link href={lead ? `/app/leads/${lead.lead.id}` : '/app/quotes'}>
            <ArrowLeft size={14} aria-hidden="true" /> {lead ? 'Lead' : 'Quotes'}
          </Link>
        }
      />
      <QuoteEditor quoteId={null} initial={initial} services={catalog.services} sizes={catalog.sizes} today={today} />
    </>
  );
}
