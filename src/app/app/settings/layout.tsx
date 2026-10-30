import { PageHeader } from '@/components/app/shell/PageHeader';
import { SettingsTabs } from './SettingsTabs';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="settings">
      <PageHeader title="Settings" />
      <SettingsTabs />
      {children}
    </div>
  );
}
