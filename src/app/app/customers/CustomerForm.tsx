'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { SelectField, TextAreaField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { ButtonLink } from '@/components/app/ui/Button';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { CONTACT_PREFERENCES, LEAD_SOURCES } from '@/domain/customer';
import { idle } from '@/domain/forms';
import type { CustomerFormState } from './actions';
import styles from './customers.module.css';

type Values = Record<string, string>;

export function CustomerForm({
  action,
  initial = {},
  submitLabel,
  cancelHref,
}: {
  action: (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
  initial?: Values;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, idle as CustomerFormState);
  const v = state.values ?? initial;
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.status === 'error' && !state.duplicates ? <Notice tone="critical">{state.message}</Notice> : null}
      {state.duplicates ? (
        <Notice tone="attention">
          <p>{state.message}</p>
          <ul className={styles.duplicates} role="list">
            {state.duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/app/customers/${d.id}`}>{d.name}</Link> · {d.contact}
                {d.archived ? ' · archived' : ''}
              </li>
            ))}
          </ul>
          <p>Open the existing customer, or create a new one anyway.</p>
        </Notice>
      ) : null}

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Name</legend>
        <div className={styles.pair}>
          <TextField name="firstName" label="First name" autoComplete="off" required defaultValue={v.firstName} error={e.firstName} />
          <TextField name="lastName" label="Last name" autoComplete="off" defaultValue={v.lastName} error={e.lastName} />
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Contact</legend>
        <p className={styles.groupHint}>A phone number or an email is required.</p>
        <div className={styles.pair}>
          <TextField name="phone" label="Phone" type="tel" placeholder="(512) 555-0142" defaultValue={v.phone} error={e.phone} />
          <TextField name="email" label="Email" type="email" defaultValue={v.email} error={e.email} />
        </div>
        <div className={styles.pair}>
          <SelectField
            name="preferredContact"
            label="Prefers"
            defaultValue={v.preferredContact ?? ''}
            options={[{ value: '', label: 'No preference' }, ...CONTACT_PREFERENCES]}
            error={e.preferredContact}
          />
          <SelectField
            name="source"
            label="How they found you"
            defaultValue={v.source ?? ''}
            options={[{ value: '', label: 'Not recorded' }, ...LEAD_SOURCES]}
            error={e.source}
          />
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Address (optional)</legend>
        <TextField name="addressLine1" label="Street address" autoComplete="off" defaultValue={v.addressLine1} error={e.addressLine1} />
        <div className={styles.triple}>
          <TextField name="city" label="City" autoComplete="off" defaultValue={v.city} error={e.city} />
          <TextField name="state" label="State" maxLength={2} placeholder="TX" defaultValue={v.state} error={e.state} />
          <TextField name="postalCode" label="ZIP" inputMode="numeric" defaultValue={v.postalCode} error={e.postalCode} />
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Notes</legend>
        <TextAreaField name="notes" label="Notes" hint="Gate codes, parking, preferences — anything you want next time." maxLength={2000} defaultValue={v.notes} error={e.notes} />
      </fieldset>

      <div className={styles.actions}>
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        {state.duplicates ? (
          <button type="submit" name="confirmDuplicate" value="1" className={styles.textButton}>
            Create anyway
          </button>
        ) : null}
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
