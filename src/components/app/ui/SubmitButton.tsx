'use client';

import { useFormStatus } from 'react-dom';
import { Button } from './Button';

// Submit button for server-action forms: disabled while the action runs; label stays put.
export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} aria-disabled={pending} className={className}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
