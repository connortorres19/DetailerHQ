import type { Metadata } from 'next';
import Link from 'next/link';
import { env } from '@/lib/env';
import { AuthCard } from '../AuthCard';
import { SignUpForm } from '../forms';

export const metadata: Metadata = { title: 'Create account · DetailerHQ' };

export default function SignUpPage() {
  if (env.AUTH_SIGNUP_MODE !== 'open') {
    return (
      <AuthCard
        title="Early access is invite-only"
        intro="DetailerHQ is working with a small group of detailing businesses during early access. If you’ve been invited, open the link in your invitation email to set your password."
        footer={
          <>
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </>
        }
      >
        <p />
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Create your account"
      intro="We’ll email you a link to confirm your address."
      footer={
        <>
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
