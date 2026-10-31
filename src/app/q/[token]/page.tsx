import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Notice } from '@/components/app/ui/Notice';
import { PublicFrame } from '@/components/booking/PublicFrame';
import { QuoteDocument } from '@/components/quotes/QuoteDocument';
import { getPublicQuote } from '@/data/leads';
import { QuoteAnswer } from './QuoteAnswer';
import styles from './q.module.css';

export const metadata: Metadata = { title: 'Your quote', robots: { index: false, follow: false } };

// The customer's quote, found only by its secret link. No account, no internal notes.
export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lookup = await getPublicQuote(token);
  if (!lookup.ok) {
    if (lookup.error?.code === 'DH005') {
      return (
        <PublicFrame>
          <h1 className={styles.headline}>Please try again in a few minutes</h1>
          <p>There were too many attempts from this connection.</p>
        </PublicFrame>
      );
    }
    notFound();
  }
  const q = lookup.quote;
  const name = q.business.name;
  const state =
    q.status === 'accepted' || q.status === 'converted'
      ? { tone: 'positive' as const, text: `You accepted this quote. ${name} will be in touch to ${q.status === 'converted' ? 'confirm your booking' : 'book a time'}.` }
      : q.status === 'declined'
        ? { tone: 'info' as const, text: 'You declined this quote. Contact the business if you change your mind.' }
        : q.status === 'expired'
          ? { tone: 'attention' as const, text: `This quote has expired. Contact ${name} for an updated quote.` }
          : null;

  return (
    <PublicFrame>
      <h1 className={styles.headline}>Your quote from {name}</h1>
      {state ? (
        <div className={styles.banner}>
          <Notice tone={state.tone}>{state.text}</Notice>
        </div>
      ) : null}
      <QuoteDocument
        q={{
          number: q.number,
          business: q.business,
          customerFirstName: q.customer_first_name,
          vehicle: q.vehicle,
          items: q.items,
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
      {q.status === 'sent' ? <QuoteAnswer token={token} business={name} /> : null}
    </PublicFrame>
  );
}
