import type { Metadata } from 'next';
import { Panel } from '@/components/app/ui/Panel';
import { signOut } from '@/app/(auth)/actions';
import { requireBusiness } from '@/data/session';
import { ChangeEmailForm, ChangePasswordForm } from '../forms';
import styles from '../settings.module.css';

export const metadata: Metadata = { title: 'Account settings' };

export default async function AccountSettingsPage() {
  const { user } = await requireBusiness('/app/settings/account');
  return (
    <div className={styles.stack}>
      <Panel title="Email" id="email">
        <p className={styles.current}>
          Signed in as <strong>{user.email}</strong>
        </p>
        <ChangeEmailForm />
      </Panel>
      <Panel title="Password" id="password">
        <ChangePasswordForm />
      </Panel>
      <Panel title="Sign out" id="sign-out">
        <form action={signOut} className={styles.inline}>
          <p className={styles.muted}>Sign out of DetailerHQ on this device.</p>
          <button type="submit" className={styles.secondaryButton}>
            Sign out
          </button>
        </form>
      </Panel>
    </div>
  );
}
