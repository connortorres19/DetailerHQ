'use client';

import { useActionState, useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/app/ui/Button';
import { TextAreaField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { idle } from '@/domain/forms';
import { saveBookingPageText, setLive } from './actions';
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

export function TextForm({ initial }: { initial: Record<string, string> }) {
  const [state, action] = useActionState(saveBookingPageText, idle);
  const v = state.status === 'error' ? (state.values ?? initial) : initial;
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className={styles.form} noValidate key={state.status === 'error' ? 'error' : JSON.stringify(initial)}>
      {state.status === 'success' ? <Notice tone="positive">{state.message}</Notice> : null}
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      <TextAreaField
        name="intro"
        label="About your business"
        hint="One or two sentences at the top of your page. 300 characters."
        rows={3}
        maxLength={300}
        defaultValue={v.intro}
        error={e.intro}
      />
      <label className={styles.check}>
        <input type="checkbox" name="onlineCancellation" defaultChecked={v.onlineCancellation === 'on'} />
        <span>
          Customers can cancel online with their booking link
          <span className={styles.hint}>Up to the cutoff set in Availability → Booking rules.</span>
        </span>
      </label>
      <TextAreaField name="cancellation" label="Cancellation policy (optional)" rows={3} maxLength={1000} defaultValue={v.cancellation} error={e.cancellation} />
      <TextAreaField name="rescheduling" label="Rescheduling policy (optional)" rows={3} maxLength={1000} defaultValue={v.rescheduling} error={e.rescheduling} />
      <TextAreaField
        name="prep"
        label="Before the appointment (optional)"
        hint="Shown to customers once a booking is confirmed, e.g. “Please remove personal items and have water access.”"
        rows={3}
        maxLength={1000}
        defaultValue={v.prep}
        error={e.prep}
      />
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Saving…">Save booking page details</SubmitButton>
      </div>
    </form>
  );
}
