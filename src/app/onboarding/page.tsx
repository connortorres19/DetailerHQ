import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getBusiness, requireUser } from '@/data/session';
import { OnboardingForm } from './OnboardingForm';
import styles from './onboarding.module.css';
import { Wordmark } from '@/components/layout/Wordmark';
import { signOut } from '@/app/(auth)/actions';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Set up your business · DetailerHQ' };

export default async function OnboardingPage() {
  const user = await requireUser('/onboarding');
  if (await getBusiness()) redirect('/app');
  return (
    <main id="main" className={styles.page}>
      <header className={styles.top}>
        <Wordmark tone="default" />
        <form action={signOut}>
          <button type="submit" className={styles.signOut}>
            Sign out
          </button>
        </form>
      </header>
      <section className={styles.card} aria-labelledby="onboarding-title">
        <p className={styles.overline}>Business setup</p>
        <h1 id="onboarding-title" className={styles.title}>
          Set up your business
        </h1>
        <p className={styles.intro}>
          These details create your DetailerHQ workspace. Services, hours and your booking page come later.
        </p>
        <OnboardingForm defaultEmail={user.email} siteHost={new URL(env.NEXT_PUBLIC_SITE_URL).host} />
      </section>
    </main>
  );
}
