'use client';

import { useState } from 'react';
import { Button } from './Button';
import { SubmitButton } from './SubmitButton';
import styles from './ConfirmAction.module.css';

// Two-step action: the first click explains the consequence, the second submits the form
// (DESIGN_SYSTEM §13.1: actions that change records ask first).
export function ConfirmAction({
  action,
  label,
  confirmLabel,
  message,
  variant = 'secondary',
}: {
  action: () => Promise<void>;
  label: string;
  confirmLabel: string;
  message: string;
  variant?: 'secondary' | 'danger';
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant={variant} size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <form action={action} className={styles.confirm} role="group" aria-label={label}>
      <p className={styles.message}>{message}</p>
      <div className={styles.buttons}>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <SubmitButton variant={variant === 'danger' ? 'danger' : 'primary'} pendingLabel="Saving…">
          {confirmLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
