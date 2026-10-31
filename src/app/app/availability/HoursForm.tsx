'use client';

import { useActionState, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { TIME_OPTIONS, WEEKDAYS, type Window } from '@/domain/availability';
import { idle } from '@/domain/forms';
import { saveHours } from './actions';
import styles from './availability.module.css';

type Week = Record<number, { start: string; end: string }[]>;

const toWeek = (windows: Window[]): Week =>
  Object.fromEntries(WEEKDAYS.map((d) => [d.value, windows.filter((w) => w.weekday === d.value).map(({ start, end }) => ({ start, end }))]));

const shift = (hhmm: string, minutes: number) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const total = Math.min(24 * 60, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

// Weekly hours: several windows per day; a lunch break is the gap between two windows.
export function HoursForm({ initial }: { initial: Window[] }) {
  const [state, action] = useActionState(saveHours, idle);
  const [week, setWeek] = useState<Week>(() => toWeek(initial));
  const e = state.fieldErrors ?? {};

  const update = (day: number, fn: (list: { start: string; end: string }[]) => { start: string; end: string }[]) =>
    setWeek((w) => ({ ...w, [day]: fn(w[day] ?? []) }));

  const windows: Window[] = WEEKDAYS.flatMap((d) => (week[d.value] ?? []).map((w) => ({ weekday: d.value, ...w })));

  return (
    <form action={action} className={styles.form}>
      {state.status === 'success' ? <Notice tone="positive">{state.message}</Notice> : null}
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      <input type="hidden" name="windows" value={JSON.stringify(windows)} />
      <ul className={styles.days} role="list">
        {WEEKDAYS.map((day) => {
          const list = week[day.value] ?? [];
          const open = list.length > 0;
          return (
            <li key={day.value} className={styles.day} aria-label={day.label}>
              <label className={styles.dayToggle}>
                <input
                  type="checkbox"
                  checked={open}
                  onChange={(ev) => update(day.value, () => (ev.target.checked ? [{ start: '09:00', end: '17:00' }] : []))}
                />
                <span className={styles.dayName}>{day.label}</span>
              </label>
              <div className={styles.windows}>
                {open ? (
                  list.map((w, i) => (
                    <div key={i} className={styles.window}>
                      <select
                        aria-label={`${day.label} window ${i + 1} start`}
                        value={w.start}
                        onChange={(ev) => update(day.value, (l) => l.map((x, j) => (j === i ? { ...x, start: ev.target.value } : x)))}
                      >
                        {TIME_OPTIONS.filter((o) => o.value !== '24:00').map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <span className={styles.to}>to</span>
                      <select
                        aria-label={`${day.label} window ${i + 1} end`}
                        value={w.end}
                        onChange={(ev) => update(day.value, (l) => l.map((x, j) => (j === i ? { ...x, end: ev.target.value } : x)))}
                      >
                        {TIME_OPTIONS.filter((o) => o.value !== '00:00').map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Remove ${day.label} window ${i + 1}`}
                        onClick={() => update(day.value, (l) => l.filter((_, j) => j !== i))}
                      >
                        <X size={14} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    </div>
                  ))
                ) : (
                  <span className={styles.closed}>Closed</span>
                )}
                {open ? (
                  <div className={styles.dayActions}>
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() =>
                        update(day.value, (l) => {
                          const last = l[l.length - 1]!;
                          const start = shift(last.end, 60);
                          return start >= '24:00' ? l : [...l, { start, end: shift(start, 180) }];
                        })
                      }
                    >
                      <Plus size={14} strokeWidth={1.5} aria-hidden="true" /> Add window
                    </button>
                    {day.value === 1 ? (
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={() => setWeek((w) => ({ ...w, 2: [...list], 3: [...list], 4: [...list], 5: [...list] }))}
                      >
                        Copy to Tue–Fri
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {e[`day.${day.value}`] ? <p className={styles.error}>{e[`day.${day.value}`]}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className={styles.hint}>For a lunch break, add two windows — for example 8:00 AM to 12:00 PM and 1:00 PM to 5:00 PM.</p>
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Saving…">Save hours</SubmitButton>
      </div>
    </form>
  );
}
