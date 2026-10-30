'use client';

import { useActionState } from 'react';
import { TextAreaField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { ButtonLink } from '@/components/app/ui/Button';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { idle, type FormState } from '@/domain/forms';
import styles from './customers.module.css';

export function VehicleForm({
  action,
  sizes,
  initial = {},
  submitLabel,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  sizes: { id: string; name: string; examples: string | null }[];
  initial?: Record<string, string>;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, idle);
  const v = state.values ?? initial;
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Vehicle</legend>
        <div className={styles.triple}>
          <TextField name="year" label="Year" inputMode="numeric" maxLength={4} placeholder="2021" defaultValue={v.year} error={e.year} />
          <TextField name="make" label="Make" required placeholder="e.g. Toyota" defaultValue={v.make} error={e.make} />
          <TextField name="model" label="Model" required placeholder="e.g. Tacoma" defaultValue={v.model} error={e.model} />
        </div>
        <div className={styles.triple}>
          <TextField name="trim" label="Trim" placeholder="e.g. TRD" defaultValue={v.trim} error={e.trim} />
          <TextField name="color" label="Color" defaultValue={v.color} error={e.color} />
          <TextField name="plate" label="Plate" maxLength={10} defaultValue={v.plate} error={e.plate} />
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Size</legend>
        <p className={styles.groupHint}>Used for size-based pricing once services are set up.</p>
        <div className={styles.sizes}>
          <label className={styles.size}>
            <input type="radio" name="sizeClassId" value="" defaultChecked={!v.sizeClassId} />
            <span className={styles.sizeName}>Not set</span>
          </label>
          {sizes.map((s) => (
            <label key={s.id} className={styles.size}>
              <input type="radio" name="sizeClassId" value={s.id} defaultChecked={v.sizeClassId === s.id} />
              <span className={styles.sizeName}>{s.name}</span>
              {s.examples ? <span className={styles.sizeExamples}>{s.examples}</span> : null}
            </label>
          ))}
        </div>
        {e.sizeClassId ? <p className={styles.fieldError}>{e.sizeClassId}</p> : null}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Notes</legend>
        <TextAreaField name="notes" label="Notes" hint="Paint condition, coatings, pet hair — anything to remember." maxLength={1000} defaultValue={v.notes} error={e.notes} />
      </fieldset>

      <div className={styles.actions}>
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
