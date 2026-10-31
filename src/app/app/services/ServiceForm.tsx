'use client';

import { useActionState, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { SelectField, TextAreaField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { ButtonLink } from '@/components/app/ui/Button';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { idle, type FormState } from '@/domain/forms';
import { PRICE_TYPES, formatDuration, type PriceType } from '@/domain/service';
import styles from './services.module.css';

type Size = { id: string; name: string; examples: string | null };
type Values = Record<string, string>;

const HOURS = Array.from({ length: 73 }, (_, h) => String(h));
const MINUTES = ['0', '15', '30', '45'];

function Duration({
  hoursName,
  minutesName,
  label,
  values,
  error,
  optional,
}: {
  hoursName: string;
  minutesName: string;
  label: string;
  values: Values;
  error?: string;
  optional?: boolean;
}) {
  return (
    <div className={styles.duration} role="group" aria-label={label}>
      <select name={hoursName} defaultValue={values[hoursName] ?? ''} aria-label={`${label} hours`} aria-invalid={error ? true : undefined}>
        {optional ? <option value="">—</option> : null}
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h} h
          </option>
        ))}
      </select>
      <select name={minutesName} defaultValue={values[minutesName] ?? ''} aria-label={`${label} minutes`} aria-invalid={error ? true : undefined}>
        {optional ? <option value="">—</option> : null}
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m} min
          </option>
        ))}
      </select>
    </div>
  );
}

export function ServiceForm({
  action,
  sizes,
  categories,
  initial = {},
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  sizes: Size[];
  categories: { id: string; name: string }[];
  initial?: Values;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, idle);
  const v = state.values ?? initial;
  const e = state.fieldErrors ?? {};
  const [priceType, setPriceType] = useState<PriceType>((v.priceType as PriceType) || 'fixed');
  const quote = priceType === 'quote_required';
  const baseHint = v.baseHours || v.baseMinutes ? formatDuration(Number(v.baseHours || 0) * 60 + Number(v.baseMinutes || 0)) : 'base';

  return (
    <form action={formAction} className={styles.form} noValidate>
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Service</legend>
        <TextField name="name" label="Name" hint="Packages are services too, e.g. “Full detail package”." required maxLength={80} defaultValue={v.name} error={e.name} />
        <TextAreaField name="description" label="Description (optional)" hint="What’s included. Customers will see this." maxLength={500} rows={3} defaultValue={v.description} error={e.description} />
        <SelectField
          name="categoryId"
          label="Category"
          defaultValue={v.categoryId ?? ''}
          options={[{ value: '', label: 'No category' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          error={e.categoryId}
          className={styles.half}
        />
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Price and time</legend>
        <div className={styles.cards} role="radiogroup" aria-label="Pricing">
          {PRICE_TYPES.map((p) => (
            <label key={p.value} className={styles.card}>
              <input type="radio" name="priceType" value={p.value} checked={priceType === p.value} onChange={() => setPriceType(p.value)} />
              <span className={styles.cardTitle}>{p.label}</span>
              <span className={styles.cardHint}>{p.hint}</span>
            </label>
          ))}
        </div>
        {e.priceType ? <p className={styles.error}>{e.priceType}</p> : null}

        <div className={styles.pair}>
          {quote ? (
            <p className={styles.note}>No price is shown for quote-required services. You’ll price each job yourself.</p>
          ) : (
            <div className={styles.money}>
              <TextField
                name="basePrice"
                label={priceType === 'starting_at' ? 'Starting price' : 'Price'}
                inputMode="decimal"
                placeholder="180"
                defaultValue={v.basePrice}
                error={e.basePrice}
              />
              <span className={styles.dollar} aria-hidden="true">
                $
              </span>
            </div>
          )}
          <div className={styles.field}>
            <span className={styles.label} id="base-duration-label">
              {quote ? 'Typical time' : 'Time'}
            </span>
            <span className={styles.hint}>How long the job takes you, used to fill your schedule.</span>
            <Duration hoursName="baseHours" minutesName="baseMinutes" label="Time" values={v} error={e.baseDuration} />
            {e.baseDuration ? (
              <p className={styles.error}>
                <CircleAlert size={14} strokeWidth={1.75} aria-hidden="true" /> {e.baseDuration}
              </p>
            ) : null}
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>By vehicle size (optional)</legend>
        <p className={styles.groupHint}>
          Leave a cell blank to use the {quote ? 'typical time' : 'price and time'} above. Fill it in when a size costs more or takes longer.
        </p>
        {e.sizes ? <p className={styles.error}>{e.sizes}</p> : null}
        <table className={styles.grid}>
          <thead>
            <tr>
              <th scope="col">Size</th>
              {quote ? null : <th scope="col">Price</th>}
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {sizes.map((s) => (
              <tr key={s.id}>
                <th scope="row">
                  <span className={styles.sizeName}>{s.name}</span>
                  {s.examples ? <span className={styles.sizeExamples}>{s.examples}</span> : null}
                </th>
                {quote ? null : (
                  <td>
                    <div className={styles.cellMoney}>
                      <span aria-hidden="true">$</span>
                      <input
                        name={`size.${s.id}.price`}
                        inputMode="decimal"
                        aria-label={`${s.name} price`}
                        placeholder={v.basePrice || 'base'}
                        defaultValue={v[`size.${s.id}.price`] ?? ''}
                        aria-invalid={e[`size.${s.id}.price`] ? true : undefined}
                      />
                    </div>
                    {e[`size.${s.id}.price`] ? <p className={styles.error}>{e[`size.${s.id}.price`]}</p> : null}
                  </td>
                )}
                <td>
                  <Duration hoursName={`size.${s.id}.hours`} minutesName={`size.${s.id}.minutes`} label={`${s.name} time`} values={v} optional error={e[`size.${s.id}.duration`]} />
                  {e[`size.${s.id}.duration`] ? <p className={styles.error}>{e[`size.${s.id}.duration`]}</p> : null}
                  <span className="visually-hidden">Blank uses {baseHint}.</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>How it’s offered</legend>
        <label className={styles.check}>
          <input type="checkbox" name="isAddon" defaultChecked={v.isAddon === 'on'} />
          <span>
            <span className={styles.checkTitle}>Add-on</span>
            <span className={styles.cardHint}>Only added to a main service or package, e.g. pet hair removal.</span>
          </span>
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="isBookable" defaultChecked={v.isBookable === 'on'} disabled={quote} />
          <span>
            <span className={styles.checkTitle}>Customers can book this online</span>
            <span className={styles.cardHint}>
              {quote ? 'Not available for quote-required services.' : 'Shown on your booking page once it’s published.'}
            </span>
          </span>
        </label>
        {e.isBookable ? <p className={styles.error}>{e.isBookable}</p> : null}
      </fieldset>

      <div className={styles.actions}>
        <ButtonLink href="/app/services" variant="ghost">
          Cancel
        </ButtonLink>
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
