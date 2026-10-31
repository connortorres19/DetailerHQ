'use client';

import { useActionState } from 'react';
import { SelectField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { TIME_OPTIONS } from '@/domain/availability';
import { HOLD_HOURS } from '@/domain/bookings';
import { idle, type FormState } from '@/domain/forms';
import { placeCalendarHold, releaseCalendarHold } from '../bookings/actions';
import styles from './calendar.module.css';

// A calendar hold: one unit of capacity for the chosen time until it expires (or is released).
export function HoldForm({ today, defaultDate, zone }: { today: string; defaultDate: string; zone: string }) {
  const [state, action] = useActionState(placeCalendarHold, idle);
  const v = state.status === 'error' ? (state.values ?? {}) : {};
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className={styles.form} key={state.status === 'success' ? state.values?.at : 'form'} noValidate>
      {state.status === 'success' ? <Notice tone="positive">{state.message}</Notice> : null}
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      <TextField name="date" label="Date" type="date" min={today} defaultValue={v.date ?? defaultDate} error={e.date} />
      <div className={styles.pair}>
        <SelectField name="start" label="From" defaultValue={v.start ?? '09:00'} options={TIME_OPTIONS.filter((o) => o.value !== '24:00')} error={e.start} />
        <SelectField name="end" label="To" defaultValue={v.end ?? '11:00'} options={TIME_OPTIONS.filter((o) => o.value !== '00:00')} error={e.end} />
      </div>
      <SelectField
        name="hours"
        label="Keep it for"
        defaultValue={v.hours ?? '24'}
        options={HOLD_HOURS}
        hint="It ends on its own after this, or at its start time if that’s sooner."
        error={e.hours}
      />
      <TextField name="note" label="Note (optional, private)" maxLength={200} placeholder="e.g. Fleet van — waiting on PO" defaultValue={v.note} error={e.note} />
      <p className={styles.muted}>Times are in {zone}. A hold can’t replace a confirmed appointment.</p>
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Holding…">Hold time</SubmitButton>
      </div>
    </form>
  );
}

export function ReleaseHold({ holdId }: { holdId: string }) {
  const [state, action] = useActionState(async (): Promise<FormState> => releaseCalendarHold(holdId), idle);
  return (
    <form action={action} className={styles.release}>
      {state.status === 'error' ? <span className={styles.error}>{state.message}</span> : null}
      <SubmitButton variant="secondary" pendingLabel="Releasing…">
        Release
      </SubmitButton>
    </form>
  );
}
