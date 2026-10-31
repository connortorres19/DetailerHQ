'use client';

import { startTransition, useActionState, useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { Button, ButtonLink } from '@/components/app/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { idle, type FormState } from '@/domain/forms';
import { convertQuote, deleteQuote, quoteSlots, saveQuoteNotes, sendQuote, withdrawQuote } from '../actions';
import styles from '../styles';

// Draft: preview, send, delete. Sent: copy the link, withdraw. Any time: internal notes.
export function QuoteActions({ quoteId, status, link, internalNotes }: { quoteId: string; status: string; link: string | null; internalNotes: string | null }) {
  const [sendState, send] = useActionState(async (): Promise<FormState> => sendQuote(quoteId), idle);
  const [withdrawState, withdraw] = useActionState(async (): Promise<FormState> => withdrawQuote(quoteId), idle);
  const [deleteState, del] = useActionState(async (): Promise<FormState> => deleteQuote(quoteId), idle);
  const [notesState, notes] = useActionState(saveQuoteNotes.bind(null, quoteId), idle);
  const [confirm, setConfirm] = useState<null | 'withdraw' | 'delete'>(null);
  const [copied, setCopied] = useState(false);
  const result = [sendState, withdrawState, deleteState].find((s) => s.status !== 'idle');

  return (
    <div className={styles.stack}>
      {result?.status === 'error' ? <Notice tone="critical">{result.message}</Notice> : null}
      {result?.status === 'success' ? <Notice tone="positive">{result.message}</Notice> : null}

      {link ? (
        <div className={styles.inline}>
          <p className={styles.strong}>Customer link</p>
          <div className={styles.link}>
            <span className={styles.linkText} aria-label="Quote link">
              {link}
            </span>
            <Button
              type="button"
              size="sm"
              icon={<Copy size={14} aria-hidden="true" />}
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <p className={styles.muted}>Send it by text or email yourself — DetailerHQ doesn’t send messages. Anyone with the link can see this quote.</p>
        </div>
      ) : null}

      <div className={styles.buttonRow}>
        <ButtonLink href={`/app/quotes/${quoteId}/preview`}>Preview</ButtonLink>
        {status === 'draft' ? (
          <form action={send}>
            <SubmitButton pendingLabel="Sending…">Send quote</SubmitButton>
          </form>
        ) : null}
        {status === 'sent' ? (
          <Button type="button" onClick={() => setConfirm('withdraw')}>
            Withdraw
          </Button>
        ) : null}
        {status === 'draft' ? (
          <Button type="button" variant="danger" onClick={() => setConfirm('delete')}>
            Delete draft
          </Button>
        ) : null}
      </div>

      {confirm === 'withdraw' ? (
        <form action={withdraw} className={styles.inline} role="group" aria-label="Withdraw quote">
          <p>Withdraw this quote? The link stops working and it becomes a draft you can edit and send again.</p>
          <div className={styles.buttonRow}>
            <SubmitButton pendingLabel="Withdrawing…">Withdraw quote</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
          </div>
        </form>
      ) : null}
      {confirm === 'delete' ? (
        <form action={del} className={styles.inline} role="group" aria-label="Delete draft">
          <p>Delete this draft? This can’t be undone.</p>
          <div className={styles.buttonRow}>
            <SubmitButton variant="danger" pendingLabel="Deleting…">
              Delete draft
            </SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
          </div>
        </form>
      ) : null}

      {status !== 'draft' ? (
        <form action={notes} className={styles.inline} aria-label="Internal notes">
          {notesState.status === 'success' ? <Notice tone="positive">{notesState.message}</Notice> : null}
          {notesState.status === 'error' ? <Notice tone="critical">{notesState.message}</Notice> : null}
          <TextAreaField name="internalNotes" label="Internal notes" hint="Only you see these." rows={3} maxLength={2000} defaultValue={notesState.values?.internalNotes ?? internalNotes ?? ''} />
          <div className={styles.buttonRow}>
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              Save notes
            </SubmitButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}

// Book an accepted quote: the quoted work and prices carry over; the time comes from your open times
// (the same engine as every booking) and is checked again when you book.
export function ConvertQuote({
  quoteId,
  durationMin,
  proposedStart,
  tz,
  today,
  serviceMode,
  address,
}: {
  quoteId: string;
  durationMin: number;
  proposedStart: string | null;
  tz: string;
  today: string;
  serviceMode: 'mobile' | 'shop' | 'both';
  address: { line1: string; city: string; state: string; postalCode: string };
}) {
  const [state, action, pending] = useActionState(convertQuote.bind(null, quoteId), idle);
  const proposedDay = proposedStart ? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(proposedStart)) : null;
  const [date, setDate] = useState(proposedDay && proposedDay >= today ? proposedDay : today);
  const [hours, setHours] = useState(String(Math.floor(durationMin / 60)));
  const [minutes, setMinutes] = useState(String(durationMin % 60));
  const [custom, setCustom] = useState(false);
  const [slots, setSlots] = useState<{ key: string; result: Awaited<ReturnType<typeof quoteSlots>> } | null>(null);
  const [location, setLocation] = useState<'mobile' | 'shop'>(serviceMode === 'shop' ? 'shop' : 'mobile');
  const total = Number(hours || 0) * 60 + Number(minutes || 0);
  const slotKey = `${total}|${date}`;
  const fmt = useMemo(() => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }), [tz]);

  useEffect(() => {
    if (total < 15 || !date) return;
    let live = true;
    quoteSlots(total, date).then((result) => live && setSlots({ key: slotKey, result }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slotKey captures the inputs
  }, [slotKey]);
  const current = slots?.key === slotKey ? slots.result : null;
  const proposedOpen = Boolean(proposedStart && current?.ok && current.slots.some((s) => new Date(s).getTime() === new Date(proposedStart).getTime()));

  return (
    <form
      className={styles.inline}
      aria-label="Book this quote"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      {proposedStart ? (
        <Notice tone={current && !proposedOpen && proposedDay === date ? 'attention' : 'info'}>
          The quote proposed {new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(proposedStart))}
          {current && proposedDay === date ? (proposedOpen ? ' — still open.' : ' — no longer open. Choose another time.') : '.'}
        </Notice>
      ) : null}
      <div className={styles.grid3}>
        <TextField name="hours" label="Job length: hours" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
        <TextField name="minutes" label="Minutes" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        <TextField id="convert-date" name="date" label="Date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {total < 15 ? (
        <p className={styles.error}>Set how long the job takes (at least 15 minutes).</p>
      ) : custom ? (
        <TextField id="convert-time" name="time" label="Start time" type="time" step={900} hint="Your hours, blocked time, buffer and capacity are still checked." />
      ) : current === null ? (
        <p className={styles.muted} role="status">
          Finding open times…
        </p>
      ) : !current.ok ? (
        <Notice tone="critical">{current.message}</Notice>
      ) : current.slots.length === 0 ? (
        <p className={styles.muted}>No open times that day for a job this long. Try another date.</p>
      ) : (
        <SelectField
          name="slot"
          label="Start time"
          defaultValue={proposedOpen ? current.slots.find((s) => new Date(s).getTime() === new Date(proposedStart!).getTime()) : undefined}
          options={current.slots.map((s) => ({ value: s, label: fmt.format(new Date(s)) }))}
        />
      )}
      <button type="button" className={styles.linkButton} style={{ justifySelf: 'start' }} onClick={() => setCustom((c) => !c)}>
        {custom ? 'Choose from open times' : 'Enter a time that isn’t listed'}
      </button>
      {serviceMode === 'both' ? (
        <SelectField name="locationChoice" label="Where" value={location} onChange={(e) => setLocation(e.target.value as 'mobile' | 'shop')} options={[{ value: 'mobile', label: 'At their address' }, { value: 'shop', label: 'At the shop' }]} />
      ) : null}
      <input type="hidden" name="location" value={location} />
      {location === 'mobile' ? (
        <>
          <TextField name="addressLine1" label="Street address" defaultValue={address.line1} maxLength={120} />
          <div className={styles.grid3}>
            <TextField name="city" label="City" defaultValue={address.city} maxLength={60} />
            <TextField name="state" label="State" defaultValue={address.state} maxLength={2} />
            <TextField name="postalCode" label="ZIP" defaultValue={address.postalCode} maxLength={5} />
          </div>
        </>
      ) : null}
      <div className={styles.buttonRow}>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Booking…' : 'Book this quote'}
        </Button>
      </div>
    </form>
  );
}
