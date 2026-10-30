import type { Metadata } from 'next';
import { requireUser } from '@/data/session';
import { AuthCard } from '../../AuthCard';
import { NewPasswordForm } from '../../forms';

export const metadata: Metadata = { title: 'Choose a new password · DetailerHQ' };

// Reached from a reset email: /auth/confirm has already verified the recovery link.
export default async function ResetPasswordPage() {
  const user = await requireUser('/auth/reset-password');
  return (
    <AuthCard title="Choose a new password" intro={`For ${user.email}.`}>
      <NewPasswordForm next="/app" submitLabel="Save new password" />
    </AuthCard>
  );
}
