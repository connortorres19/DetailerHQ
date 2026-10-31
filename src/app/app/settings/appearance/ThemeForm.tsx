'use client';

import { startTransition, useActionState, useState } from 'react';
import { Notice } from '@/components/app/ui/Notice';
import { idle } from '@/domain/forms';
import { THEMES, type Theme } from '@/domain/theme';
import { saveTheme } from './actions';
import styles from './appearance.module.css';

// Picking an option applies it straight away (the wrapper's data-theme) and saves it to the
// account, so the same theme comes back after signing out and in, on any device.
export function ThemeForm({ current }: { current: Theme }) {
  const [state, action, pending] = useActionState(saveTheme, idle);
  const [value, setValue] = useState<Theme>(current);

  function choose(theme: Theme) {
    setValue(theme);
    document.querySelector('.app-theme')?.setAttribute('data-theme', theme);
    const fd = new FormData();
    fd.set('theme', theme);
    startTransition(() => action(fd));
  }

  return (
    <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
      <fieldset className={styles.options}>
        <legend className="visually-hidden">Dashboard appearance</legend>
        {THEMES.map((t) => (
          <label key={t.value} className={styles.option} data-theme-option={t.value}>
            <input type="radio" name="theme" value={t.value} checked={value === t.value} disabled={pending} onChange={() => choose(t.value)} />
            <span className={styles.sample} aria-hidden="true">
              <span className={styles.sampleBar} />
              <span className={styles.sampleLine} />
              <span className={styles.sampleLineShort} />
            </span>
            <span className={styles.text}>
              <span className={styles.label}>{t.label}</span>
              <span className={styles.hint}>{t.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div aria-live="polite">
        {state.status === 'success' ? <Notice tone="positive">{state.message}</Notice> : null}
        {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      </div>
    </form>
  );
}
