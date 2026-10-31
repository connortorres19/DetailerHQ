'use client';

import { useActionState, useState } from 'react';
import { SelectField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { TIME_OPTIONS } from '@/domain/availability';
import { idle } from '@/domain/forms';
import { addTimeOff } from './actions';
import styles from './availability.module.css';

export function TimeOffForm({ today, zoneLabel }: { today: string; zoneLabel: string }) {
  const [state, action] = useActionState(addTimeOff, idle);
  const v = state.status === 'error' ? (state.values ?? {}) : {};
  const e = state.fieldErrors ?? {};
  const [allDay, setAllDay] = useState(state.status === 'error' ? v.allDay === 'on' : true);
  return (
    <form action={action} className={styles.form} key={state.status === 'success' ? state.values?.nonce : 'form'} noValidate>
      {state.status === 'success' ? <Notice tone="positive">{state.message}</Notice> : null}
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      <div className={styles.pair}>
        <TextField name="startDate" label="From" type="date" min={today} hint="First day blocked." defaultValue={v.startDate ?? today} error={e.startDate} />
        <TextField name="endDate" label="To" type="date" min={today} hint="Same day if left blank." defaultValue={v.endDate} error={e.endDate} />
      </div>
      <label className={styles.check}>
        <input type="checkbox" name="allDay" checked={allDay} onChange={(ev) => setAllDay(ev.target.checked)} />
        <span>All day</span>
      </label>
      {allDay ? null : (
        <div className={styles.pair}>
          <SelectField name="startTime" label="Start time" defaultValue={v.startTime ?? '12:00'} options={TIME_OPTIONS.filter((o) => o.value !== '24:00')} error={e.startTime} />
          <SelectField name="endTime" label="End time" defaultValue={v.endTime ?? '13:00'} options={TIME_OPTIONS.filter((o) => o.value !== '00:00')} error={e.endTime} />
        </div>
      )}
      <TextField name="label" label="Note (optional)" placeholder="e.g. Vacation, supplier visit" maxLength={80} defaultValue={v.label} error={e.label} />
      <p className={styles.hint}>Dates and times are in {zoneLabel}.</p>
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Saving…">Block time</SubmitButton>
      </div>
    </form>
  );
}
