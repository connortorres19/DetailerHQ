'use client';

import { useActionState } from 'react';
import { SelectField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { INTERVAL_OPTIONS, NOTICE_OPTIONS } from '@/domain/availability';
import { idle } from '@/domain/forms';
import { saveBookingRules } from './actions';
import styles from './availability.module.css';

export function RulesForm({ initial }: { initial: Record<string, string> }) {
  const [state, action] = useActionState(saveBookingRules, idle);
  const v = state.status === 'error' ? (state.values ?? initial) : initial;
  const e = state.fieldErrors ?? {};
  const withCurrent = (options: { value: string; label: string }[], value: string, label: (v: string) => string) =>
    options.some((o) => o.value === value) ? options : [...options, { value, label: label(value) }];
  return (
    <form action={action} className={styles.form} noValidate>
      {state.status === 'success' ? <Notice tone="positive">{state.message}</Notice> : null}
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      <div className={styles.pair}>
        <SelectField
          name="minNoticeMin"
          label="Minimum notice"
          hint="How soon a customer can book before the job starts."
          defaultValue={v.minNoticeMin}
          options={withCurrent(NOTICE_OPTIONS, v.minNoticeMin ?? '', (m) => `${m} minutes`)}
          error={e.minNoticeMin}
        />
        <TextField
          name="horizonDays"
          label="Booking window (days ahead)"
          hint="How far ahead customers can book. 1 to 365."
          inputMode="numeric"
          defaultValue={v.horizonDays}
          error={e.horizonDays}
        />
        <TextField
          name="bufferMin"
          label="Buffer between jobs (minutes)"
          hint="Kept free around each job for travel and set-up."
          inputMode="numeric"
          defaultValue={v.bufferMin}
          error={e.bufferMin}
        />
        <SelectField
          name="slotIntervalMin"
          label="Start times offered"
          hint="How often customers can choose a start time."
          defaultValue={v.slotIntervalMin}
          options={withCurrent(INTERVAL_OPTIONS, v.slotIntervalMin ?? '', (m) => `Every ${m} min`)}
          error={e.slotIntervalMin}
        />
        <TextField
          name="maxJobsPerDay"
          label="Most jobs per day (optional)"
          hint="Leave blank for no daily limit."
          inputMode="numeric"
          defaultValue={v.maxJobsPerDay}
          error={e.maxJobsPerDay}
        />
        <TextField
          name="cancelCutoffHours"
          label="Customers can cancel until (hours before)"
          hint="After this, they need to contact you. 0 to 168."
          inputMode="numeric"
          defaultValue={v.cancelCutoffHours}
          error={e.cancelCutoffHours}
        />
      </div>
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Saving…">Save booking rules</SubmitButton>
      </div>
    </form>
  );
}
