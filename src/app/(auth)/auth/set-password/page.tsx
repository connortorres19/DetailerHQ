import type { Metadata } from 'next';
import { requireUser } from '@/data/session';
import { AuthCard } from '../../AuthCard';
import { NewPasswordForm } from '../../forms';

export const metadata: Metadata = { title: 'Set your password · DetailerHQ' };

// Reached from an invitation email: /auth/confirm has already verified the invite and signed the owner in.
export default async function SetPasswordPage() {
  const user = await requireUser('/auth/set-password');
  return (
    <AuthCard title="Set your password" intro={`You’re setting up DetailerHQ for ${user.email}.`}>
      <NewPasswordForm next="/onboarding" submitLabel="Save password and continue" />
    </AuthCard>
  );
}
