'use client';

import { useActionState, useEffect, useState } from 'react';
import { SelectField, TextAreaField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { SubmitButton } from '@/components/app/ui/SubmitButton';
import { formatPhone } from '@/domain/business';
import { idle } from '@/domain/forms';
import { LEAD_SOURCES } from '@/domain/leads';
import type { CustomerChoice } from '@/data/appointments';
import { findCustomers } from '../appointments/actions';
import { saveLead } from './actions';
import styles from './leads.module.css';

type Option = { value: string; label: string };

// Create or edit a lead: who (an existing customer, or contact details), the vehicle if known,
// what they want, how they reached you, and private notes.
export function LeadForm({
  leadId,
  initial,
  initialCustomer,
  services,
  sizes,
}: {
  leadId: string | null;
  initial: Record<string, string>;
  initialCustomer: CustomerChoice | null;
  services: Option[];
  sizes: Option[];
}) {
  const [state, action] = useActionState(saveLead.bind(null, leadId), idle);
  const v = state.status === 'error' ? (state.values ?? initial) : initial;
  const e = state.fieldErrors ?? {};
  const [customer, setCustomer] = useState<CustomerChoice | null>(initialCustomer);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ q: string; list: CustomerChoice[] } | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let live = true;
    const t = setTimeout(() => findCustomers(q).then((list) => live && setResults({ q, list })), 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  const [first, ...rest] = (customer?.name ?? '').split(' ');
  return (
    <form action={action} className={styles.form} noValidate key={customer?.id ?? 'none'}>
      {state.status === 'error' ? <Notice tone="critical">{state.message}</Notice> : null}

      <section className={styles.section} aria-labelledby="l-source">
        <h2 id="l-source" className={styles.heading}>How did they reach you?</h2>
        <div className={styles.chips} role="radiogroup" aria-label="Source">
          {LEAD_SOURCES.map((s) => (
            <label key={s.value} className={styles.chip}>
              <input type="radio" name="source" value={s.value} defaultChecked={(v.source ?? 'phone') === s.value} />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
        {e.source ? <p className={styles.error}>{e.source}</p> : null}
      </section>

      <section className={styles.section} aria-labelledby="l-who">
        <h2 id="l-who" className={styles.heading}>Who</h2>
        {customer ? (
          <div className={styles.picked}>
            <input type="hidden" name="customerId" value={customer.id} />
            <div>
              <p className={styles.strong}>{customer.name} · existing customer</p>
              <p className={styles.muted}>{[formatPhone(customer.phone), customer.email].filter(Boolean).join(' · ')}</p>
            </div>
            <button type="button" className={styles.linkButton} onClick={() => setCustomer(null)}>
              Not this customer
            </button>
          </div>
        ) : (
          <>
            <TextField
              name="customerSearch"
              label="Existing customer? (optional)"
              hint="Search by name, phone or email — or just fill in their details below."
              autoComplete="off"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
            />
            {results && results.q === query.trim() && results.list.length ? (
              <ul className={styles.results} role="list" aria-label="Matching customers">
                {results.list.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setCustomer(c)}>
                      <span className={styles.strong}>{c.name}</span>
                      <span className={styles.muted}>{[formatPhone(c.phone), c.email].filter(Boolean).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
        <div className={styles.grid2}>
          <TextField name="firstName" label="First name" maxLength={60} defaultValue={customer ? first : v.firstName} error={e.firstName} />
          <TextField name="lastName" label="Last name (optional)" maxLength={60} defaultValue={customer ? rest.join(' ') : v.lastName} error={e.lastName} />
          <TextField name="phone" label="Phone" type="tel" defaultValue={customer ? formatPhone(customer.phone) : v.phone} error={e.phone} />
          <TextField name="email" label="Email (optional)" type="email" defaultValue={customer ? (customer.email ?? '') : v.email} error={e.email} />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="l-vehicle">
        <h2 id="l-vehicle" className={styles.heading}>Vehicle (if known)</h2>
        {customer && customer.vehicles.length ? (
          <SelectField
            name="vehicleId"
            label="Their vehicle"
            defaultValue={v.vehicleId ?? ''}
            options={[{ value: '', label: 'Not one of these / unknown' }, ...customer.vehicles.map((x) => ({ value: x.id, label: x.label }))]}
          />
        ) : null}
        <div className={styles.grid3}>
          <TextField name="year" label="Year" inputMode="numeric" maxLength={4} defaultValue={v.year} error={e.year} />
          <TextField name="make" label="Make" placeholder="e.g. Toyota" maxLength={40} defaultValue={v.make} error={e.make} />
          <TextField name="model" label="Model" placeholder="e.g. Tacoma" maxLength={40} defaultValue={v.model} error={e.model} />
        </div>
        <SelectField name="sizeId" label="Size" defaultValue={v.sizeId ?? ''} options={[{ value: '', label: 'Not sure yet' }, ...sizes]} />
      </section>

      <section className={styles.section} aria-labelledby="l-what">
        <h2 id="l-what" className={styles.heading}>What they want</h2>
        <SelectField name="serviceId" label="Service" defaultValue={v.serviceId ?? ''} options={[{ value: '', label: 'Custom job / not sure' }, ...services]} />
        <TextAreaField name="request" label="Request" hint="In their words — or describe the custom job." rows={3} maxLength={2000} defaultValue={v.request} error={e.request} />
        <TextAreaField name="notes" label="Internal notes" hint="Only you see these." rows={2} maxLength={2000} defaultValue={v.notes} error={e.notes} />
      </section>

      <div className={styles.actions}>
        <SubmitButton pendingLabel="Saving…">{leadId ? 'Save lead' : 'Add lead'}</SubmitButton>
      </div>
    </form>
  );
}
