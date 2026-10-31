'use client';

import { startTransition, useActionState, useState } from 'react';
import { Button } from '@/components/app/ui/Button';
import { SelectField, TextAreaField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { idle, type FormState } from '@/domain/forms';
import { CONTACT_CHANNELS, LEAD_STATUSES, LOST_REASONS } from '@/domain/leads';
import { convertLeadToCustomer, logLeadActivity, setLeadStatus } from '../actions';
import styles from '../leads.module.css';

const newest = (...states: FormState[]) =>
  states.filter((s) => s.status !== 'idle').sort((a, b) => Number(b.values?.at ?? 0) - Number(a.values?.at ?? 0))[0];

export function LeadStatusForm({ leadId, status, lostReason }: { leadId: string; status: string; lostReason: string | null }) {
  const [state, action, pending] = useActionState(setLeadStatus.bind(null, leadId), idle);
  const [value, setValue] = useState(status === 'follow_up_due' ? 'contacted' : status);
  // onSubmit, not the `action` prop: React's post-action form reset would desync the controlled select.
  return (
    <form
      className={styles.inline}
      aria-label="Lead status"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {state.status === 'success' ? <Notice tone="positive">{state.message}</Notice> : null}
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      <SelectField name="status" label="Status" value={value} onChange={(e) => setValue(e.target.value)} options={LEAD_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
      {value === 'lost' ? (
        <SelectField name="lostReason" label="Why was it lost?" defaultValue={lostReason ?? 'other'} options={LOST_REASONS.map((r) => ({ value: r.value, label: r.label }))} error={state.fieldErrors?.lostReason} />
      ) : null}
      <div className={styles.buttonRow}>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Update status'}
        </Button>
      </div>
    </form>
  );
}

export function LeadActivityForm({ leadId }: { leadId: string }) {
  const [contactState, contact] = useActionState(logLeadActivity.bind(null, leadId), idle);
  const [noteState, note] = useActionState(logLeadActivity.bind(null, leadId), idle);
  const result = newest(contactState, noteState);
  return (
    <div className={styles.stack}>
      {result?.status === 'success' ? <Notice tone="positive">{result.message}</Notice> : null}
      {result?.status === 'error' ? <Notice tone="critical">{result.message}</Notice> : null}
      <form action={contact} className={styles.inline} aria-label="Log contact" key={contactState.values?.at ?? 'c'}>
        <input type="hidden" name="kind" value="contacted" />
        <SelectField name="channel" label="Log contact" defaultValue="phone" options={CONTACT_CHANNELS.map((c) => ({ value: c.value, label: c.label }))} />
        <TextAreaField id="contact-note" name="note" label="What was said? (optional)" rows={2} maxLength={1000} />
        <div className={styles.buttonRow}>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Log contact
          </SubmitButton>
        </div>
      </form>
      <form action={note} className={styles.inline} aria-label="Add note" key={noteState.values?.at ?? 'n'}>
        <input type="hidden" name="kind" value="note" />
        <TextAreaField id="lead-note" name="note" label="Add a note" rows={2} maxLength={1000} />
        <div className={styles.buttonRow}>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Add note
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

export function ConvertToCustomer({ leadId, matches }: { leadId: string; matches: { id: string; name: string }[] }) {
  const [state, action] = useActionState(convertLeadToCustomer.bind(null, leadId), idle);
  return (
    <form action={action} className={styles.inline} aria-label="Make customer">
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      {matches.length ? (
        <SelectField
          name="customerId"
          label="Possible existing customer (same phone or email)"
          defaultValue=""
          options={[{ value: '', label: 'Create a new customer record' }, ...matches.map((m) => ({ value: m.id, label: `Use ${m.name}` }))]}
        />
      ) : (
        <p className={styles.muted}>Creates a customer record (and their vehicle, if known) from this lead. Nothing is merged automatically.</p>
      )}
      <div className={styles.buttonRow}>
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Make customer
        </SubmitButton>
      </div>
    </form>
  );
}
