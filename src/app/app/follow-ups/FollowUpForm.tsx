'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/app/ui/Button';
import { TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { idle } from '@/domain/forms';
import { completeFollowUp, setFollowUp } from '../leads/actions';
import styles from '../leads/leads.module.css';

// A lead's or quote's follow-up: set a date (and note), or mark it done.
export function FollowUpForm({ kind, id, current, note, today, label }: { kind: 'lead' | 'quote'; id: string; current: string | null; note: string | null; today: string; label: string | null }) {
  const [setState, set] = useActionState(setFollowUp.bind(null, kind, id), idle);
  const [doneState, done] = useActionState(completeFollowUp.bind(null, kind, id), idle);
  const [editing, setEditing] = useState(false);
  const result = [setState, doneState].filter((s) => s.status !== 'idle').sort((a, b) => Number(b.values?.at ?? 0) - Number(a.values?.at ?? 0))[0];
  return (
    <div className={styles.stack}>
      {result?.status === 'success' ? <Notice tone="positive">{result.message}</Notice> : null}
      {result?.status === 'error' ? <Notice tone="critical">{result.message}</Notice> : null}
      {current && !editing ? (
        <>
          <p>
            <span className={styles.strong}>{label}</span>
            {note ? <span className={styles.muted}> · {note}</span> : null}
          </p>
          <form action={done} className={styles.inline} aria-label="Complete follow-up">
            <TextField id="followup-done-note" name="note" label="What happened? (optional)" maxLength={300} />
            <div className={styles.buttonRow}>
              <SubmitButton pendingLabel="Saving…">Mark done</SubmitButton>
              <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
                Change date
              </Button>
            </div>
          </form>
        </>
      ) : (
        <form action={set} className={styles.inline} aria-label="Set follow-up">
          <div className={styles.grid2}>
            <TextField id="followup-date" name="date" label="Follow up on" type="date" min={today} defaultValue={setState.values?.date} />
            <TextField id="followup-time" name="time" label="Time (optional)" type="time" step={900} />
          </div>
          <TextField id="followup-note" name="note" label="Note (optional)" maxLength={300} placeholder="e.g. Ask if the quote works" />
          <div className={styles.buttonRow}>
            <SubmitButton pendingLabel="Saving…">Set follow-up</SubmitButton>
            {editing ? (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
