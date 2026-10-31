'use client';

import { useActionState, useEffect, useState } from 'react';
import { SelectField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { SERVICE_MODES, US_TIMEZONES, slugify } from '@/domain/business';
import { idle } from '@/domain/forms';
import { createBusiness } from './actions';
import styles from './onboarding.module.css';

export function OnboardingForm({ defaultEmail, siteHost }: { defaultEmail: string; siteHost: string }) {
  const [state, action] = useActionState(createBusiness, idle);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  const [name, setName] = useState(v.name ?? '');
  const [slug, setSlug] = useState(v.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(Boolean(v.slug));
  const [mode, setMode] = useState(v.serviceMode ?? 'mobile');
  const [timezone, setTimezone] = useState(v.timezone ?? '');

  // Preselect the browser's time zone when it's one of the US zones the database accepts.
  useEffect(() => {
    if (timezone) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time default from the browser
    if (US_TIMEZONES.some((t) => t.value === tz)) setTimezone(tz);
  }, [timezone]);

  return (
    <form action={action} className={styles.form} noValidate>
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Your business</legend>
        <TextField
          name="name"
          label="Business name"
          autoComplete="organization"
          required
          value={name}
          onChange={(ev) => {
            setName(ev.target.value);
            if (!slugEdited) setSlug(slugify(ev.target.value));
          }}
          error={e.name}
        />
        <TextField
          name="slug"
          label="Booking link"
          hint={
            <>
              Your booking page will be <span className={styles.mono}>{siteHost}/book/{slug || 'your-business'}</span>. It can’t be changed
              from the app after setup.
            </>
          }
          required
          autoCapitalize="none"
          spellCheck={false}
          value={slug}
          onChange={(ev) => {
            setSlugEdited(true);
            setSlug(ev.target.value.toLowerCase());
          }}
          error={e.slug}
        />
        <SelectField
          name="timezone"
          label="Time zone"
          hint="Used for your schedule and every time customers see."
          required
          value={timezone}
          onChange={(ev) => setTimezone(ev.target.value)}
          options={[{ value: '', label: 'Choose a time zone' }, ...US_TIMEZONES]}
          error={e.timezone}
        />
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Where you work</legend>
        <div className={styles.modes} role="radiogroup" aria-label="Where you work">
          {SERVICE_MODES.map((m) => (
            <label key={m.value} className={styles.mode} data-checked={mode === m.value}>
              <input type="radio" name="serviceMode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} />
              <span className={styles.modeLabel}>{m.label}</span>
              <span className={styles.modeText}>{m.description}</span>
            </label>
          ))}
        </div>
        {e.serviceMode ? <p className={styles.error}>{e.serviceMode}</p> : null}
        {mode === 'mobile' ? (
          <p className={styles.note}>Mobile businesses take one job at a time.</p>
        ) : (
          <TextField
            name="capacity"
            label="Jobs you can work on at the same time"
            hint="For example, the number of bays you staff. You can change this later."
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            required
            defaultValue={v.capacity ?? '1'}
            className={styles.narrow}
            error={e.capacity}
          />
        )}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Contact details (optional)</legend>
        <div className={styles.pair}>
          <TextField name="phone" label="Business phone" type="tel" autoComplete="tel" placeholder="(512) 555-0142" defaultValue={v.phone} error={e.phone} />
          <TextField name="email" label="Business email" type="email" autoComplete="email" defaultValue={v.email ?? defaultEmail} error={e.email} />
        </div>
      </fieldset>

      <div className={styles.actions}>
        <SubmitButton pendingLabel="Creating workspace…">Create workspace</SubmitButton>
      </div>
    </form>
  );
}
