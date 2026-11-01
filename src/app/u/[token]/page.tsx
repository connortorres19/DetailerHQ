import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicFrame } from '@/components/booking/PublicFrame';
import { emailConfig } from '@/lib/email/config';
import { verify } from '@/lib/email/crypto';
import { workerPool } from '@/lib/email/worker';
import { UnsubscribeForm } from './UnsubscribeForm';

export const metadata: Metadata = { title: 'Email preferences', robots: { index: false } };

// /u/<signed token> — a customer stops quote follow-up emails from one business. Booking and quote
// emails they need (confirmations, changes, the quote itself) are not affected. A button (POST)
// confirms, so link scanners can't unsubscribe anyone by opening the link.
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = emailConfig() ? verify<{ b: string; e: string; c: string }>('unsubscribe', token) : null;
  if (!t) notFound();
  const pool = workerPool();
  const { rows } = await pool!.query<{ name: string | null }>('select email_api.business_name($1) as name', [t.b]);
  const name = rows[0]?.name ?? 'this business';
  return (
    <PublicFrame>
      <h1 style={{ fontSize: 'var(--text-h2)', lineHeight: 'var(--leading-h2)', fontWeight: 600 }}>Quote reminders from {name}</h1>
      <p style={{ margin: 'var(--space-3) 0 var(--space-6)', color: 'var(--color-text-label)' }}>
        Stop follow-up emails about quotes sent to <strong>{t.e}</strong>? You’ll still get emails about bookings and quotes you ask for.
      </p>
      <UnsubscribeForm token={token} />
    </PublicFrame>
  );
}
