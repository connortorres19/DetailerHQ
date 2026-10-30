import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '../AuthCard';
import { ForgotPasswordForm } from '../forms';

export const metadata: Metadata = { title: 'Reset password · DetailerHQ' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      intro="Enter your account email and we’ll send you a link to choose a new password."
      footer={<Link href="/sign-in">Back to sign in</Link>}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
