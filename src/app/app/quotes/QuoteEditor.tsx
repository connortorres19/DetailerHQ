'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/app/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { priceFor, type PublicService } from '@/domain/booking';
import { formatPhone } from '@/domain/business';
import { idle } from '@/domain/forms';
import { quoteTotals } from '@/domain/leads';
import { centsToInput, formatCents, parseMoney } from '@/domain/service';
import type { CustomerChoice } from '@/data/appointments';
import { findCustomers } from '../appointments/actions';
import { saveQuote } from './actions';
import styles from './styles';

type Line = { key: string; serviceId: string; name: string; description: string; quantity: string; price: string; durationMin: string };
export type QuoteEditorInitial = {
  leadId: string | null;
  customer: CustomerChoice | null;
  newCustomer: { firstName: string; lastName: string; phone: string; email: string };
  vehicleId: string | null;
  newVehicle: { year: string; make: string; model: string };
  sizeId: string;
  lines: Omit<Line, 'key'>[];
  discount: string;
  validUntil: string;
  proposedDate: string;
  proposedTime: string;
  notes: string;
  terms: string;
  internalNotes: string;
};

let seq = 0;
const key = () => `l${(seq += 1)}`;

// Create or edit a draft quote. Prices start from the catalog for the vehicle's size and can be
// changed per line; the saved quote keeps its own prices whatever happens to the catalog later.
export function QuoteEditor({
  quoteId,
  initial,
  services,
  sizes,
  today,
}: {
  quoteId: string | null;
  initial: QuoteEditorInitial;
  services: PublicService[];
  sizes: { id: string; name: string }[];
  today: string;
}) {
  const [state, action, pending] = useActionState(saveQuote.bind(null, quoteId), idle);
  const e = state.fieldErrors ?? {};
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>(initial.customer ? 'existing' : 'new');
  const [customer, setCustomer] = useState<CustomerChoice | null>(initial.customer);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ q: string; list: CustomerChoice[] } | null>(null);
  const [vehicleId, setVehicleId] = useState<string>(initial.vehicleId ?? (initial.customer?.vehicles[0]?.id ?? 'new'));
  const [sizeId, setSizeId] = useState(initial.sizeId);
  const [lines, setLines] = useState<Line[]>(() => initial.lines.map((l) => ({ ...l, key: key() })));
  const [discount, setDiscount] = useState(initial.discount);
  const [pick, setPick] = useState('');

  useEffect(() => {
    const q = query.trim();
    if (customerMode !== 'existing' || q.length < 2) return;
    let live = true;
    const t = setTimeout(() => findCustomers(q).then((list) => live && setResults({ q, list })), 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, customerMode]);

  const parsedLines = lines.map((l) => ({ quantity: Number(l.quantity) || 0, priceCents: parseMoney(l.price) ?? 0 }));
  const totals = quoteTotals(parsedLines, parseMoney(discount || '0') ?? 0);
  const update = (k: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const addService = (id: string) => {
    const s = services.find((x) => x.id === id);
    if (!s) return;
    const p = priceFor(s, sizeId || null);
    setLines((ls) => [...ls, { key: key(), serviceId: s.id, name: s.name, description: s.description ?? '', quantity: '1', price: centsToInput(p.priceCents), durationMin: String(p.durationMin) }]);
    setPick('');
  };
  const pickVehicle = (id: string) => {
    setVehicleId(id);
    const size = customer?.vehicles.find((v) => v.id === id)?.sizeId;
    if (size) setSizeId(size);
  };
  const vehicleMode = customerMode === 'new' || vehicleId === 'new' ? 'new' : 'existing';
  const mains = services.filter((s) => !s.is_addon);
  const addons = services.filter((s) => s.is_addon);

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        const data = new FormData(ev.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}
      {initial.leadId ? <input type="hidden" name="leadId" value={initial.leadId} /> : null}

      <section className={styles.section} aria-labelledby="q-customer">
        <h2 id="q-customer" className={styles.heading}>Customer</h2>
        <input type="hidden" name="customerMode" value={customerMode} />
        <div className={styles.segmented} role="tablist" aria-label="Customer">
          <button type="button" role="tab" aria-selected={customerMode === 'existing'} onClick={() => setCustomerMode('existing')}>
            Existing customer
          </button>
          <button type="button" role="tab" aria-selected={customerMode === 'new'} onClick={() => setCustomerMode('new')}>
            New customer
          </button>
        </div>
        {customerMode === 'existing' ? (
          customer ? (
            <div className={styles.picked}>
              <input type="hidden" name="customerId" value={customer.id} />
              <div>
                <p className={styles.strong}>{customer.name}</p>
                <p className={styles.muted}>{[formatPhone(customer.phone), customer.email].filter(Boolean).join(' · ')}</p>
              </div>
              <button type="button" className={styles.linkButton} onClick={() => setCustomer(null)}>
                Change
              </button>
            </div>
          ) : (
            <>
              <TextField name="customerSearch" label="Find a customer" hint="Name, phone or email." autoComplete="off" value={query} onChange={(ev) => setQuery(ev.target.value)} error={e.customerId} />
              {results && results.q === query.trim() ? (
                results.list.length ? (
                  <ul className={styles.results} role="list" aria-label="Matching customers">
                    {results.list.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => { setCustomer(c); setVehicleId(c.vehicles[0]?.id ?? 'new'); if (c.vehicles[0]?.sizeId) setSizeId(c.vehicles[0].sizeId); }}>
                          <span className={styles.strong}>{c.name}</span>
                          <span className={styles.muted}>{[formatPhone(c.phone), c.email].filter(Boolean).join(' · ')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.muted}>No customers match.</p>
                )
              ) : null}
            </>
          )
        ) : (
          <div className={styles.grid2}>
            <TextField name="firstName" label="First name" maxLength={60} defaultValue={initial.newCustomer.firstName} error={e.firstName} />
            <TextField name="lastName" label="Last name (optional)" maxLength={60} defaultValue={initial.newCustomer.lastName} />
            <TextField name="phone" label="Phone" type="tel" defaultValue={initial.newCustomer.phone} error={e.phone} hint="A phone number or an email is needed." />
            <TextField name="email" label="Email (optional)" type="email" defaultValue={initial.newCustomer.email} error={e.email} />
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="q-vehicle">
        <h2 id="q-vehicle" className={styles.heading}>Vehicle</h2>
        <input type="hidden" name="vehicleMode" value={vehicleMode} />
        {customerMode === 'existing' && customer ? (
          <div className={styles.options}>
            {customer.vehicles.map((v) => (
              <label key={v.id} className={styles.option}>
                <input type="radio" name="vehicleId" value={v.id} checked={vehicleId === v.id} onChange={() => pickVehicle(v.id)} />
                <span>{v.label}</span>
              </label>
            ))}
            <label className={styles.option}>
              <input type="radio" name="vehicleChoice" checked={vehicleId === 'new'} onChange={() => setVehicleId('new')} />
              <span>Add a vehicle</span>
            </label>
          </div>
        ) : null}
        {e.vehicleId ? <p className={styles.error}>{e.vehicleId}</p> : null}
        {vehicleMode === 'new' ? (
          <div className={styles.grid3}>
            <TextField name="year" label="Year (optional)" inputMode="numeric" maxLength={4} defaultValue={initial.newVehicle.year} error={e.year} />
            <TextField name="make" label="Make" maxLength={40} defaultValue={initial.newVehicle.make} error={e.make} />
            <TextField name="model" label="Model" maxLength={40} defaultValue={initial.newVehicle.model} error={e.model} />
          </div>
        ) : null}
        <SelectField
          name="sizeId"
          label="Size (for catalog prices)"
          value={sizeId}
          onChange={(ev) => setSizeId(ev.target.value)}
          options={[{ value: '', label: 'Standard prices' }, ...sizes.map((s) => ({ value: s.id, label: s.name }))]}
        />
      </section>

      <section className={styles.section} aria-labelledby="q-lines">
        <h2 id="q-lines" className={styles.heading}>Line items</h2>
        <input type="hidden" name="lines" value={JSON.stringify(lines.map((l) => ({ ...l, key: undefined, durationMin: l.durationMin === '' ? null : l.durationMin })))} />
        {lines.length === 0 ? <p className={styles.muted}>Add services from your catalog or a custom line.</p> : null}
        <ol className={styles.lines} role="list" aria-label="Line items">
          {lines.map((l, i) => (
            <li key={l.key} className={styles.line} aria-label={`Line ${i + 1}`}>
              <div className={styles.lineTop}>
                <TextField name={`line-${l.key}-name`} label={`Line ${i + 1} name`} value={l.name} maxLength={80} onChange={(ev) => update(l.key, { name: ev.target.value })} />
                <button type="button" className={styles.iconButton} aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
              <TextField name={`line-${l.key}-description`} label={`Line ${i + 1} description (optional)`} value={l.description} maxLength={500} onChange={(ev) => update(l.key, { description: ev.target.value })} />
              <div className={styles.lineNums}>
                <TextField name={`line-${l.key}-qty`} label="Qty" inputMode="numeric" value={l.quantity} onChange={(ev) => update(l.key, { quantity: ev.target.value })} />
                <TextField name={`line-${l.key}-price`} label="Price ($)" inputMode="decimal" value={l.price} onChange={(ev) => update(l.key, { price: ev.target.value })} />
                <TextField name={`line-${l.key}-duration`} label="Time (min)" inputMode="numeric" value={l.durationMin} onChange={(ev) => update(l.key, { durationMin: ev.target.value })} />
                <p className={styles.lineAmount}>{formatCents((parseMoney(l.price) ?? 0) * (Number(l.quantity) || 0))}</p>
              </div>
            </li>
          ))}
        </ol>
        {e.lines ? <p className={styles.error}>{e.lines}</p> : null}
        <div className={styles.addRow}>
          <SelectField
            name="addService"
            label="Add from your services"
            value={pick}
            onChange={(ev) => addService(ev.target.value)}
            options={[
              { value: '', label: 'Choose a service…' },
              ...mains.map((s) => ({ value: s.id, label: s.name })),
              ...addons.map((s) => ({ value: s.id, label: `${s.name} (add-on)` })),
            ]}
          />
          <Button
            type="button"
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => setLines((ls) => [...ls, { key: key(), serviceId: '', name: '', description: '', quantity: '1', price: '', durationMin: '' }])}
          >
            Add custom line
          </Button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="q-terms">
        <h2 id="q-terms" className={styles.heading}>Terms</h2>
        <div className={styles.grid2}>
          <TextField name="discount" label="Discount ($, optional)" inputMode="decimal" value={discount} onChange={(ev) => setDiscount(ev.target.value)} error={e.discount} />
          <TextField name="validUntil" label="Valid until" type="date" min={today} defaultValue={initial.validUntil} error={e.validUntil} />
          <TextField name="proposedDate" label="Proposed date (optional)" type="date" min={today} defaultValue={initial.proposedDate} error={e.proposedDate} />
          <TextField name="proposedTime" label="Proposed time (optional)" type="time" step={900} defaultValue={initial.proposedTime} />
        </div>
        <TextAreaField name="notes" label="Job description and notes for the customer" rows={3} maxLength={2000} defaultValue={initial.notes} error={e.notes} />
        <TextAreaField name="terms" label="Terms (optional)" hint="Shown on the quote, e.g. what’s included or excluded." rows={2} maxLength={2000} defaultValue={initial.terms} error={e.terms} />
        <TextAreaField name="internalNotes" label="Internal notes" hint="Only you see these — never shown to the customer." rows={2} maxLength={2000} defaultValue={initial.internalNotes} error={e.internalNotes} />
      </section>

      <section className={styles.summary} aria-label="Quote total">
        <dl className={styles.totals}>
          <dt>Subtotal</dt>
          <dd>{formatCents(totals.subtotal)}</dd>
          {totals.discount ? (
            <>
              <dt>Discount</dt>
              <dd>−{formatCents(totals.discount)}</dd>
            </>
          ) : null}
          <dt className={styles.strong}>Total</dt>
          <dd className={styles.strong}>{formatCents(Math.max(totals.total, 0))}</dd>
        </dl>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save draft'}
        </Button>
      </section>
    </form>
  );
}
