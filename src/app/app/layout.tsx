import type { Metadata } from 'next';
import { AppShell } from '@/components/app/shell/AppShell';
import { getBillingSummary } from '@/data/billing';
import { getThemePreference, requireBusiness } from '@/data/session';
import { billingBanner } from '@/domain/billing';

export const metadata: Metadata = { title: { template: '%s · DetailerHQ', default: 'DetailerHQ' } };

// Every /app page: signed in (proxy + here) and has a business (else onboarding). The wrapper
// carries the user's saved theme into the first HTML, so the page never flashes the wrong one
// (globals.css: dark tokens apply while an .app-theme[data-theme] is on the page).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ user, business }, theme] = await Promise.all([requireBusiness(), getThemePreference()]);
  const banner = billingBanner(await getBillingSummary(business), business.timezone);
  return (
    <div className="app-theme" data-theme={theme}>
      <AppShell business={business} user={user} billing={banner}>
        {children}
      </AppShell>
    </div>
  );
}
