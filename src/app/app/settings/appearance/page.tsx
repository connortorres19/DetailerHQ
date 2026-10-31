import type { Metadata } from 'next';
import Link from 'next/link';
import { Panel } from '@/components/app/ui/Panel';
import { getThemePreference, requireBusiness } from '@/data/session';
import { ThemeForm } from './ThemeForm';
import styles from './appearance.module.css';

export const metadata: Metadata = { title: 'Appearance' };

export default async function AppearancePage() {
  await requireBusiness('/app/settings/appearance');
  const theme = await getThemePreference();
  return (
    <Panel title="Dashboard appearance" id="appearance">
      <ThemeForm current={theme} />
      <p className={styles.note}>
        Only your DetailerHQ dashboard changes. Your public booking page always uses your <Link href="/app/settings/branding">branding</Link> on a light page.
      </p>
    </Panel>
  );
}
