'use client';

import { useActionState, useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/app/ui/Button';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { idle } from '@/domain/forms';
import { saveOnlineCancellation, setLive } from './actions';
import styles from './booking-page.module.css';

export function LiveForm({ live }: { live: boolean }) {
  const [state, action] = useActionState(setLive.bind(null, !live), idle);
  return (
    <form action={action} className={styles.liveForm}>
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      {state.status === 'success' ? <Notice tone="positive">{state.message}</Notice> : null}
      <SubmitButton variant={live ? 'secondary' : 'primary'} pendingLabel="Saving…">
        {live ? 'Take offline' : 'Put booking page live'}
      </SubmitButton>
    </form>
  );
}

export function CopyBookingLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      icon={<Copy size={14} strokeWidth={1.5} aria-hidden="true" />}
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }}
    >
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}

export function CancellationForm({ online }: { online: boolean }) {
  const [state, action] = useActionState(saveOnlineCancellation, idle);
  return (
    <form action={action} className={styles.form} noValidate>
      {state.status === 'success' ? <Notice tone="positive">{state.message}</Notice> : null}
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      <label className={styles.check}>
        <input type="checkbox" name="onlineCancellation" defaultChecked={online} />
        <span>
          Customers can cancel online with their booking link
          <span className={styles.hint}>Up to the cutoff set in Availability → Booking rules.</span>
        </span>
      </label>
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}
