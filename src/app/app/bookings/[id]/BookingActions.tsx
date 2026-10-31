'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/app/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { HOLD_HOURS } from '@/domain/bookings';
import { idle, type FormState } from '@/domain/forms';
import {
  approveBooking,
  bookingSlots,
  cancelBooking,
  closeDuplicate,
  completeBooking,
  declineBooking,
  holdRequest,
  noShowBooking,
  proposeTime,
  releaseRequestHold,
  rescheduleBooking,
  retractProposal,
} from '../actions';
import styles from '../bookings.module.css';

type Match = { id: string; name: string; vehicles: { id: string; label: string }[] };
type Props = {
  bookingId: string;
  requestId: string | null;
  appointmentId: string | null;
  status: string;
  started: boolean;
  heldUntil: string | null;
  duplicateOf: { id: string; number: number } | null;
  matches: Match[];
  tz: string;
  today: string;
  vehicleLabel: string;
};

type Panel = null | 'approve' | 'propose' | 'decline' | 'hold' | 'cancel' | 'reschedule';

function Result({ state }: { state: FormState }) {
  if (state.status === 'success') return <Notice tone="positive">{state.message}</Notice>;
  if (state.status === 'error') return <Notice tone="critical">{state.message}</Notice>;
  return null;
}

// Open start times for one date, from the server (same engine as the booking page).
function useSlots(bookingId: string, date: string) {
  const [state, setState] = useState<{ date: string; result: Awaited<ReturnType<typeof bookingSlots>> } | null>(null);
  useEffect(() => {
    if (!date) return;
    let live = true;
    bookingSlots(bookingId, date).then((result) => live && setState({ date, result }));
    return () => {
      live = false;
    };
  }, [bookingId, date]);
  return state?.date === date ? state.result : null;
}

function TimePicker({ bookingId, tz, today, allowCustom }: { bookingId: string; tz: string; today: string; allowCustom: boolean }) {
  const [date, setDate] = useState(today);
  const [custom, setCustom] = useState(false);
  const slots = useSlots(bookingId, date);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  return (
    <div className={styles.picker}>
      <TextField name="date" label="Date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      {!custom ? (
        slots === null ? (
          <p className={styles.meta} role="status">
            Finding open times…
          </p>
        ) : !slots.ok ? (
          <Notice tone="info">{slots.message}</Notice>
        ) : slots.slots.length === 0 ? (
          <p className={styles.meta}>No open times that day. Try another date.</p>
        ) : (
          <SelectField
            name="slot"
            label="Open start time"
            hint="Times that fit your hours, breaks, blocked time, buffer and capacity."
            options={slots.slots.map((s) => ({ value: s, label: fmt.format(new Date(s)) }))}
          />
        )
      ) : (
        <TextField name="time" label="Start time" type="time" step={900} required hint="Your local time. Capacity is still checked." />
      )}
      {/* A button, not a checkbox: React resets form inputs after an action runs, which would
          desync a controlled checkbox from this state. */}
      {allowCustom ? (
        <button type="button" className={styles.linkButton} onClick={() => setCustom((c) => !c)}>
          {custom ? 'Choose from open times' : 'Enter a time that isn’t listed'}
        </button>
      ) : null}
    </div>
  );
}

export function BookingActions(p: Props) {
  const [open, setOpen] = useState<Panel>(null);
  const req = p.requestId ?? '';
  const appt = p.appointmentId ?? '';
  const [approveState, approve] = useActionState(approveBooking.bind(null, req), idle);
  const [declineState, decline] = useActionState(declineBooking.bind(null, req), idle);
  const [proposeState, propose] = useActionState(proposeTime.bind(null, req), idle);
  const [holdState, hold] = useActionState(holdRequest.bind(null, req), idle);
  const [cancelState, cancel] = useActionState(cancelBooking.bind(null, appt), idle);
  const [rescheduleState, reschedule] = useActionState(rescheduleBooking.bind(null, appt), idle);
  const [simpleState, simple] = useActionState(async (_: FormState, formData: FormData) => {
    const what = formData.get('do');
    if (what === 'release') return releaseRequestHold(req);
    if (what === 'retract') return retractProposal(req);
    if (what === 'duplicate' && p.duplicateOf) return closeDuplicate(req, p.duplicateOf.id);
    if (what === 'complete') return completeBooking(appt);
    if (what === 'noshow') return noShowBooking(appt);
    return idle;
  }, idle);
  const [customer, setCustomer] = useState('new');
  const [share, setShare] = useState(false);
  const chosen = p.matches.find((m) => m.id === customer);

  const states = [approveState, declineState, proposeState, holdState, cancelState, rescheduleState, simpleState];
  const latest = states.filter((s) => s.status === 'success').sort((a, b) => Number(b.values?.at ?? 0) - Number(a.values?.at ?? 0))[0] ?? null;
  const toggle = (panel: Panel) => {
    setOpen((o) => (o === panel ? null : panel));
    setShare(false);
  };
  const quick = (what: string, label: string, variant: 'primary' | 'secondary' | 'danger' = 'secondary') => (
    <form action={simple}>
      <input type="hidden" name="do" value={what} />
      <SubmitButton variant={variant} pendingLabel="Saving…">
        {label}
      </SubmitButton>
    </form>
  );

  const pending = p.status === 'pending';
  const proposed = p.status === 'proposed';
  const confirmed = p.status === 'confirmed';
  const inProgress = p.status === 'in_progress';

  if (!pending && !proposed && !confirmed && !inProgress) {
    return latest ? <Result state={latest} /> : <p className={styles.meta}>No actions — this booking is closed.</p>;
  }

  return (
    <div className={styles.actions}>
      {latest ? <Result state={latest} /> : null}
      {simpleState.status === 'error' ? <Result state={simpleState} /> : null}

      <div className={styles.buttonRow}>
        {pending ? (
          <>
            <Button type="button" variant="primary" onClick={() => toggle('approve')} aria-expanded={open === 'approve'}>
              Confirm booking
            </Button>
            <Button type="button" onClick={() => toggle('propose')} aria-expanded={open === 'propose'}>
              Propose another time
            </Button>
            {p.heldUntil ? (
              quick('release', 'Release hold')
            ) : (
              <Button type="button" onClick={() => toggle('hold')} aria-expanded={open === 'hold'}>
                Hold this time
              </Button>
            )}
            <Button type="button" variant="danger" onClick={() => toggle('decline')} aria-expanded={open === 'decline'}>
              Decline
            </Button>
            {p.duplicateOf ? quick('duplicate', `Close as duplicate of #${p.duplicateOf.number}`) : null}
          </>
        ) : null}
        {proposed ? (
          <>
            {quick('retract', 'Withdraw proposal')}
            <Button type="button" variant="danger" onClick={() => toggle('decline')} aria-expanded={open === 'decline'}>
              Decline
            </Button>
          </>
        ) : null}
        {confirmed || inProgress ? (
          <>
            {p.started ? quick('complete', 'Mark completed', 'primary') : null}
            {confirmed ? (
              <Button type="button" onClick={() => toggle('reschedule')} aria-expanded={open === 'reschedule'}>
                Reschedule
              </Button>
            ) : null}
            {confirmed && p.started ? quick('noshow', 'Mark no-show') : null}
            <Button type="button" variant="danger" onClick={() => toggle('cancel')} aria-expanded={open === 'cancel'}>
              Cancel appointment
            </Button>
          </>
        ) : null}
      </div>
      {confirmed && !p.started ? <p className={styles.meta}>Mark completed or no-show becomes available once the start time has passed.</p> : null}

      {open === 'approve' ? (
        <form action={approve} className={styles.panelForm} aria-label="Confirm booking">
          <Result state={approveState.status === 'error' ? approveState : idle} />
          {p.matches.length ? (
            <fieldset className={styles.fieldset}>
              <legend>Who is this booking for?</legend>
              <label className={styles.check}>
                <input type="radio" name="customer" value="new" checked={customer === 'new'} onChange={() => setCustomer('new')} />
                <span>A new customer record from this request (default)</span>
              </label>
              {p.matches.map((m) => (
                <label key={m.id} className={styles.check}>
                  <input type="radio" name="customer" value={m.id} checked={customer === m.id} onChange={() => setCustomer(m.id)} />
                  <span>Existing customer: {m.name}</span>
                </label>
              ))}
              {chosen ? (
                <SelectField
                  name="vehicle"
                  label="Vehicle"
                  options={[{ value: 'new', label: `Add ${p.vehicleLabel} to ${chosen.name}` }, ...chosen.vehicles.map((v) => ({ value: v.id, label: v.label }))]}
                />
              ) : null}
            </fieldset>
          ) : (
            <input type="hidden" name="customer" value="new" />
          )}
          <p className={styles.meta}>Confirms the requested time. If it’s already fully booked, nothing changes.</p>
          <div className={styles.buttonRow}>
            <SubmitButton pendingLabel="Confirming…">Confirm booking</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
              Not now
            </Button>
          </div>
        </form>
      ) : null}

      {open === 'propose' ? (
        <form action={propose} className={styles.panelForm} aria-label="Propose another time">
          <Result state={proposeState.status === 'error' ? proposeState : idle} />
          <TimePicker bookingId={p.bookingId} tz={p.tz} today={p.today} allowCustom={false} />
          <TextAreaField name="message" label="Message to the customer (optional)" rows={2} maxLength={500} placeholder="e.g. I’m booked that morning — could you do the afternoon?" />
          <SelectField
            name="answerHours"
            label="Customer can answer for"
            defaultValue="48"
            options={[
              { value: '12', label: '12 hours' },
              { value: '24', label: '24 hours' },
              { value: '48', label: '48 hours' },
              { value: '72', label: '72 hours' },
            ]}
            hint="The time is held for them until then. It’s confirmed only if they accept."
          />
          <div className={styles.buttonRow}>
            <SubmitButton pendingLabel="Sending…">Propose this time</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
              Not now
            </Button>
          </div>
        </form>
      ) : null}

      {open === 'hold' ? (
        <form action={hold} className={styles.panelForm} aria-label="Hold this time">
          <Result state={holdState.status === 'error' ? holdState : idle} />
          <SelectField name="hours" label="Hold for" defaultValue="24" options={HOLD_HOURS} />
          <p className={styles.meta}>Keeps the requested time free while you decide. It isn’t a confirmation and ends on its own.</p>
          <div className={styles.buttonRow}>
            <SubmitButton pendingLabel="Holding…">Hold time</SubmitButton>
          </div>
        </form>
      ) : null}

      {open === 'decline' ? (
        <form action={decline} className={styles.panelForm} aria-label="Decline">
          <Result state={declineState.status === 'error' ? declineState : idle} />
          <TextAreaField name="reason" label="Reason (private)" rows={2} maxLength={500} hint="Only you see this." />
          <label className={styles.check}>
            <input type="checkbox" name="share" checked={share} onChange={(e) => setShare(e.target.checked)} />
            <span>Show a message to the customer on their booking link</span>
          </label>
          {share ? <TextAreaField name="message" label="Message to the customer" rows={2} maxLength={500} /> : null}
          <div className={styles.buttonRow}>
            <SubmitButton variant="danger" pendingLabel="Declining…">
              Decline request
            </SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
              Keep it
            </Button>
          </div>
        </form>
      ) : null}

      {open === 'reschedule' ? (
        <form action={reschedule} className={styles.panelForm} aria-label="Reschedule">
          <Result state={rescheduleState.status === 'error' ? rescheduleState : idle} />
          <TimePicker bookingId={p.bookingId} tz={p.tz} today={p.today} allowCustom />
          <p className={styles.meta}>The move happens in one step: if the new time is full, the appointment stays where it is.</p>
          <div className={styles.buttonRow}>
            <SubmitButton pendingLabel="Moving…">Reschedule</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
              Not now
            </Button>
          </div>
        </form>
      ) : null}

      {open === 'cancel' ? (
        <form action={cancel} className={styles.panelForm} aria-label="Cancel appointment">
          <Result state={cancelState.status === 'error' ? cancelState : idle} />
          <TextAreaField name="reason" label="Reason (private)" rows={2} maxLength={500} />
          <label className={styles.check}>
            <input type="checkbox" name="share" checked={share} onChange={(e) => setShare(e.target.checked)} />
            <span>Show a message to the customer on their booking link</span>
          </label>
          {share ? <TextAreaField name="message" label="Message to the customer" rows={2} maxLength={500} /> : null}
          <div className={styles.buttonRow}>
            <SubmitButton variant="danger" pendingLabel="Cancelling…">
              Cancel appointment
            </SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
              Keep it
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
