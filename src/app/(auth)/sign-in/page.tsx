import type { Metadata } from 'next';
import { Notice } from '@/components/app/ui/Notice';
import { safeNext } from '@/domain/auth';
import { AuthCard } from '../AuthCard';
import { SignInForm } from '../forms';
import styles from '../auth.module.css';

export const metadata: Metadata = { title: 'Sign in · DetailerHQ' };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return (
    <AuthCard title="Sign in" intro="Use the email and password for your DetailerHQ account.">
      {params.error === 'link' ? (
        <div className={styles.notice}>
          <Notice tone="critical">That link is invalid or has expired. Sign in, or ask for a new one.</Notice>
        </div>
      ) : null}
      {params['signed-out'] ? (
        <div className={styles.notice}>
          <Notice tone="positive">You’ve signed out.</Notice>
        </div>
      ) : null}
      <SignInForm next={safeNext(params.next)} />
    </AuthCard>
  );
}
