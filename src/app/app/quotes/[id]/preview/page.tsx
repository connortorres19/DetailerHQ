import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/app/shell/PageHeader';
import { Notice } from '@/components/app/ui/Notice';
import { QuoteDocument } from '@/components/quotes/QuoteDocument';
import { getQuote } from '@/data/leads';
import { requireBusiness } from '@/data/session';
import { idSchema } from '@/domain/customer';
import styles from '../../styles';

export const metadata: Metadata = { title: 'Quote preview' };

// Exactly what the customer will see (the same component as /q/[token]); internal notes never appear.
export default async function QuotePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { business } = await requireBusiness(`/app/quotes/${id}/preview`);
  if (!idSchema.safeParse(id).success) notFound();
  const found = await getQuote(id);
  if (!found) notFound();
  const q = found.quote;
  return (
    <>
      <PageHeader
        title={`Preview · Quote #${q.number}`}
        back={
          <Link href={`/app/quotes/${id}`}>
            <ArrowLeft size={14} aria-hidden="true" /> Quote
          </Link>
        }
      />
      <div className={styles.previewWrap}>
        <div className={styles.previewBanner}>
          <Notice tone="info">This is what the customer sees on their link. Internal notes and follow-ups are never shown.</Notice>
        </div>
        <QuoteDocument
          q={{
            number: q.number,
            business: { name: business.name, phone: business.phone_e164, timezone: business.timezone },
            customerFirstName: q.customer?.first_name ?? null,
            vehicle: q.vehicle_text,
            items: q.quote_items,
            subtotalCents: q.subtotal_cents,
            discountCents: q.discount_cents,
            totalCents: q.total_cents,
            validUntil: q.valid_until,
            notes: q.notes,
            terms: q.terms,
            proposedStart: q.proposed_start,
            sentAt: q.sent_at,
          }}
        />
      </div>
    </>
  );
}
