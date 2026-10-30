import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '../../AuthCard';

export const metadata: Metadata = { title: 'Check your email · DetailerHQ' };

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthCard
      title="Check your email"
      intro={`We sent a confirmation link${email ? ` to ${email}` : ''}. Open it to finish creating your account.`}
      footer={<Link href="/sign-in">Back to sign in</Link>}
    >
      <p />
    </AuthCard>
  );
}
