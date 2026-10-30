'use client';

import { useActionState } from 'react';
import { TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { idle } from '@/domain/forms';
import { changeEmail, changePassword, updateBusinessProfile, updateCapacity } from './actions';
import styles from './settings.module.css';

function Status({ status, message }: { status: string; message?: string }) {
  if (status === 'success') return <Notice tone="positive">{message}</Notice>;
  if (status === 'error') return <Notice tone="critical">{message}</Notice>;
  return null;
}

export function BusinessProfileForm({ initial, mode }: { initial: Record<string, string>; mode: 'mobile' | 'shop' | 'both' }) {
  const [state, action] = useActionState(updateBusinessProfile, idle);
  const v = state.status === 'error' ? (state.values ?? initial) : initial;
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className={styles.form} noValidate>
      <Status {...state} />
      <TextField name="name" label="Business name" required defaultValue={v.name} error={e.name} />
      <div className={styles.pair}>
        <TextField name="phone" label="Business phone" type="tel" placeholder="(512) 555-0142" defaultValue={v.phone} error={e.phone} />
        <TextField name="email" label="Business email" type="email" defaultValue={v.email} error={e.email} />
      </div>
      {mode !== 'shop' ? (
        <TextField
          name="serviceAreaText"
          label="Service area"
          hint="Where you travel for mobile jobs, e.g. North Austin & Round Rock."
          maxLength={300}
          defaultValue={v.serviceAreaText}
          error={e.serviceAreaText}
        />
      ) : (
        <input type="hidden" name="serviceAreaText" value={v.serviceAreaText ?? ''} />
      )}
      {mode !== 'mobile' ? (
        <>
          <TextField name="shopAddressLine1" label="Shop address" defaultValue={v.shopAddressLine1} error={e.shopAddressLine1} />
          <div className={styles.triple}>
            <TextField name="shopCity" label="City" defaultValue={v.shopCity} error={e.shopCity} />
            <TextField name="shopState" label="State" maxLength={2} placeholder="TX" defaultValue={v.shopState} error={e.shopState} />
            <TextField name="shopPostalCode" label="ZIP" inputMode="numeric" defaultValue={v.shopPostalCode} error={e.shopPostalCode} />
          </div>
        </>
      ) : (
        ['shopAddressLine1', 'shopCity', 'shopState', 'shopPostalCode'].map((n) => <input key={n} type="hidden" name={n} value={v[n] ?? ''} />)
      )}
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Saving…">Save business details</SubmitButton>
      </div>
    </form>
  );
}

export function CapacityForm({ current }: { current: number }) {
  const [state, action] = useActionState(updateCapacity, idle);
  return (
    <form action={action} className={styles.form} noValidate>
      <Status {...state} />
      <TextField
        name="capacity"
        label="Jobs you can work on at the same time"
        hint="Requests and appointments are checked against this. Between 1 and 20."
        type="number"
        inputMode="numeric"
        min={1}
        max={20}
        defaultValue={state.status === 'error' ? state.values?.capacity : String(current)}
        className={styles.narrowField}
        error={state.fieldErrors?.capacity}
      />
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Saving…">Save capacity</SubmitButton>
      </div>
    </form>
  );
}

export function ChangeEmailForm() {
  const [state, action] = useActionState(changeEmail, idle);
  return (
    <form action={action} className={styles.form} noValidate>
      <Status {...state} />
      <TextField name="email" label="New email" type="email" autoComplete="email" defaultValue={state.status === 'error' ? state.values?.email : ''} error={state.fieldErrors?.email} />
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Sending…">Change email</SubmitButton>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePassword, idle);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className={styles.form} noValidate key={state.status === 'success' ? state.message : 'form'}>
      <Status {...state} />
      <TextField name="currentPassword" label="Current password" type="password" autoComplete="current-password" error={e.currentPassword} />
      <div className={styles.pair}>
        <TextField name="password" label="New password" hint="At least 10 characters." type="password" autoComplete="new-password" error={e.password} />
        <TextField name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" error={e.confirmPassword} />
      </div>
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Saving…">Change password</SubmitButton>
      </div>
    </form>
  );
}
