import type { Metadata } from 'next';
import { AppShell } from '@/components/app/shell/AppShell';
import { requireBusiness } from '@/data/session';

export const metadata: Metadata = { title: { template: '%s · DetailerHQ', default: 'DetailerHQ' } };

// Every /app page: signed in (proxy + here) and has a business (else onboarding).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, business } = await requireBusiness();
  return (
    <AppShell business={business} user={user}>
      {children}
    </AppShell>
  );
}
