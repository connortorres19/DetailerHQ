'use client';

import { startTransition, useActionState, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { SelectField, TextAreaField, TextField } from '@/components/app/ui/Field';
import { Notice } from '@/components/app/ui/Notice';
import { Button } from '@/components/app/ui/Button';
import { SOURCES } from '@/domain/appointments';
import { aboutDuration, estimate, estimateLabel, linePrice, priceFor, type PublicService } from '@/domain/booking';
import { formatPhone } from '@/domain/business';
import { idle } from '@/domain/forms';
import type { CustomerChoice } from '@/data/appointments';
import { createAppointment, findCustomers, ownerSlots } from '../actions';
import styles from './appointments.module.css';

type Props = {
  services: PublicService[];
  sizes: { id: string; name: string; examples: string | null }[];
  serviceMode: 'mobile' | 'shop' | 'both';
  tz: string;
  zone: string;
  today: string;
  initialDate: string;
  initialCustomer: CustomerChoice | null;
  hold: { id: string; start: string; end: string; note: string | null } | null;
};

export function AppointmentForm(p: Props) {
  const [state, action, pending] = useActionState(createAppointment, idle);
  const v = state.status === 'error' ? (state.values ?? {}) : {};
  const e = state.fieldErrors ?? {};

  const [source, setSource] = useState(v.source ?? 'phone');
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>((v.customerMode as 'existing' | 'new') ?? (p.initialCustomer ? 'existing' : 'existing'));
  const [customer, setCustomer] = useState<CustomerChoice | null>(p.initialCustomer);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ q: string; list: CustomerChoice[] } | null>(null);
  const [vehicleId, setVehicleId] = useState<string>(p.initialCustomer?.vehicles[0]?.id ?? 'new');
  const [sizeId, setSizeId] = useState<string>(p.initialCustomer?.vehicles[0]?.sizeId ?? '');
  const [serviceId, setServiceId] = useState('');
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [date, setDate] = useState(p.initialDate);
  const [slots, setSlots] = useState<{ key: string; result: Awaited<ReturnType<typeof ownerSlots>> } | null>(null);
  const [location, setLocation] = useState<'mobile' | 'shop'>(p.serviceMode === 'shop' ? 'shop' : 'mobile');

  const mains = p.services.filter((s) => !s.is_addon);
  const addons = p.services.filter((s) => s.is_addon);
  const chosen = [mains.find((s) => s.id === serviceId), ...addons.filter((a) => addonIds.includes(a.id))].filter((s): s is PublicService => Boolean(s));
  const lines = chosen.map((s) => priceFor(s, sizeId || null));
  const est = estimate(lines);
  const time = useMemo(() => new Intl.DateTimeFormat('en-US', { timeZone: p.tz, hour: 'numeric', minute: '2-digit' }), [p.tz]);
  const longTime = useMemo(
    () => new Intl.DateTimeFormat('en-US', { timeZone: p.tz, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    [p.tz],
  );

  // Customer search (server, RLS): name, phone or email.
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

  // Open times for the chosen services, size and date (server, same engine as the booking page).
  const slotKey = `${serviceId}|${addonIds.join(',')}|${sizeId}|${date}`;
  useEffect(() => {
    if (p.hold || !serviceId || !sizeId || !date) return;
    let live = true;
    ownerSlots({ serviceIds: [serviceId, ...addonIds], sizeId, date }).then((result) => live && setSlots({ key: slotKey, result }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slotKey captures the inputs
  }, [slotKey, p.hold]);
  const currentSlots = slots?.key === slotKey ? slots.result : null;

  const pickCustomer = (c: CustomerChoice) => {
    setCustomer(c);
    const first = c.vehicles[0];
    setVehicleId(first?.id ?? 'new');
    if (first?.sizeId) setSizeId(first.sizeId);
  };
  const pickVehicle = (id: string) => {
    setVehicleId(id);
    const size = customer?.vehicles.find((x) => x.id === id)?.sizeId;
    if (size) setSizeId(size);
  };
  const vehicleMode = customerMode === 'new' || vehicleId === 'new' ? 'new' : 'existing';
  const address = customerMode === 'existing' ? customer?.address : null;

  return (
    // Submitted via onSubmit (not the `action` prop) so React doesn't reset this form's many
    // controlled inputs after a refused save; the owner's choices stay as they were.
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

      <section className={styles.section} aria-labelledby="s-source">
        <h2 id="s-source" className={styles.heading}>How did they contact you?</h2>
        <div className={styles.chips} role="radiogroup" aria-label="Source">
          {SOURCES.map((s) => (
            <label key={s.value} className={styles.chip}>
              <input type="radio" name="source" value={s.value} checked={source === s.value} onChange={() => setSource(s.value)} />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
        {e.source ? <p className={styles.error}>{e.source}</p> : null}
      </section>

      <section className={styles.section} aria-labelledby="s-customer">
        <h2 id="s-customer" className={styles.heading}>Customer</h2>
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
            <div className={styles.search}>
              <TextField
                name="customerSearch"
                label="Find a customer"
                hint="Search by name, phone or email."
                autoComplete="off"
                value={query}
                onChange={(ev) => setQuery(ev.target.value)}
                error={e.customerId}
              />
              <Search className={styles.searchIcon} size={16} strokeWidth={1.5} aria-hidden="true" />
              {results && results.q === query.trim() ? (
                results.list.length ? (
                  <ul className={styles.results} role="list" aria-label="Matching customers">
                    {results.list.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => pickCustomer(c)}>
                          <span className={styles.strong}>{c.name}</span>
                          <span className={styles.muted}>
                            {[formatPhone(c.phone), c.email].filter(Boolean).join(' · ')}
                            {c.vehicles.length ? ` · ${c.vehicles.map((x) => x.label).join(', ')}` : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.muted}>
                    No customers match. <button type="button" className={styles.linkButton} onClick={() => setCustomerMode('new')}>Add a new customer</button>
                  </p>
                )
              ) : null}
            </div>
          )
        ) : (
          <div className={styles.grid2}>
            <TextField name="firstName" label="First name" maxLength={60} defaultValue={v.firstName} error={e.firstName} />
            <TextField name="lastName" label="Last name (optional)" maxLength={60} defaultValue={v.lastName} error={e.lastName} />
            <TextField name="phone" label="Phone" type="tel" defaultValue={v.phone} error={e.phone} hint="A phone number or an email is needed." />
            <TextField name="email" label="Email (optional)" type="email" defaultValue={v.email} error={e.email} />
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="s-vehicle">
        <h2 id="s-vehicle" className={styles.heading}>Vehicle</h2>
        <input type="hidden" name="vehicleMode" value={vehicleMode} />
        {customerMode === 'existing' && customer ? (
          <div className={styles.options}>
            {customer.vehicles.map((x) => (
              <label key={x.id} className={styles.option}>
                <input type="radio" name="vehicleId" value={x.id} checked={vehicleId === x.id} onChange={() => pickVehicle(x.id)} />
                <span>{x.label}</span>
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
            <TextField name="year" label="Year (optional)" inputMode="numeric" maxLength={4} defaultValue={v.year} error={e.year} />
            <TextField name="make" label="Make" placeholder="e.g. Toyota" maxLength={40} defaultValue={v.make} error={e.make} />
            <TextField name="model" label="Model" placeholder="e.g. Tacoma" maxLength={40} defaultValue={v.model} error={e.model} />
          </div>
        ) : null}
        <SelectField
          name="sizeId"
          label="Vehicle size"
          hint="Prices and times follow your saved prices for this size."
          value={sizeId}
          onChange={(ev) => setSizeId(ev.target.value)}
          options={[{ value: '', label: 'Choose a size' }, ...p.sizes.map((s) => ({ value: s.id, label: s.examples ? `${s.name} — ${s.examples}` : s.name }))]}
          error={e.sizeId}
        />
      </section>

      <section className={styles.section} aria-labelledby="s-service">
        <h2 id="s-service" className={styles.heading}>Service</h2>
        {mains.length === 0 ? (
          <Notice tone="info">Add a service with a set price in Services first.</Notice>
        ) : (
          <div className={styles.options} role="radiogroup" aria-label="Service">
            {mains.map((s) => {
              const l = priceFor(s, sizeId || null);
              return (
                <label key={s.id} className={styles.option}>
                  <input type="radio" name="serviceId" value={s.id} checked={serviceId === s.id} onChange={() => setServiceId(s.id)} />
                  <span className={styles.optionText}>{s.name}</span>
                  <span className={styles.optionMeta}>
                    {sizeId ? linePrice(l) : '—'} · {aboutDuration(l.durationMin).replace('about ', '')}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {e.serviceId ? <p className={styles.error}>{e.serviceId}</p> : null}
        {addons.length ? (
          <fieldset className={styles.fieldset}>
            <legend className={styles.subheading}>Add-ons (optional)</legend>
            <div className={styles.options}>
              {addons.map((a) => {
                const l = priceFor(a, sizeId || null);
                return (
                  <label key={a.id} className={styles.option}>
                    <input
                      type="checkbox"
                      name="addonIds"
                      value={a.id}
                      checked={addonIds.includes(a.id)}
                      onChange={() => setAddonIds((ids) => (ids.includes(a.id) ? ids.filter((x) => x !== a.id) : [...ids, a.id]))}
                    />
                    <span className={styles.optionText}>{a.name}</span>
                    <span className={styles.optionMeta}>
                      +{sizeId ? linePrice(l) : '—'} · +{aboutDuration(l.durationMin).replace('about ', '')}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="s-when">
        <h2 id="s-when" className={styles.heading}>When</h2>
        {p.hold ? (
          <>
            <input type="hidden" name="holdId" value={p.hold.id} />
            <Notice tone="info">
              Booking your hold: starts {longTime.format(new Date(p.hold.start))}
              {p.hold.note ? ` (“${p.hold.note}”)` : ''}. The hold becomes this appointment in one step — the time is never released in between.
            </Notice>
          </>
        ) : (
          <div className={styles.grid2}>
            <TextField name="date" label="Date" type="date" min={p.today} value={date} onChange={(ev) => setDate(ev.target.value)} error={e.date} />
            {!serviceId || !sizeId ? (
              <p className={styles.muted}>Choose a service and size to see open times.</p>
            ) : currentSlots === null ? (
              <p className={styles.muted} role="status">
                Finding open times…
              </p>
            ) : !currentSlots.ok ? (
              <Notice tone="critical">{currentSlots.message}</Notice>
            ) : currentSlots.slots.length === 0 ? (
              <p className={styles.muted}>No open times that day. Try another date.</p>
            ) : (
              <SelectField
                name="slot"
                label="Start time"
                hint={`Open times in ${p.zone}.`}
                defaultValue={v.slot}
                options={currentSlots.slots.map((s) => ({ value: s, label: time.format(new Date(s)) }))}
                error={e.slot}
              />
            )}
          </div>
        )}
        {e.slot && (!serviceId || !sizeId) ? <p className={styles.error}>{e.slot}</p> : null}
      </section>

      <section className={styles.section} aria-labelledby="s-where">
        <h2 id="s-where" className={styles.heading}>Where</h2>
        {p.serviceMode === 'both' ? (
          <div className={styles.chips} role="radiogroup" aria-label="Location">
            {(['mobile', 'shop'] as const).map((loc) => (
              <label key={loc} className={styles.chip}>
                <input type="radio" name="locationChoice" checked={location === loc} onChange={() => setLocation(loc)} />
                <span>{loc === 'mobile' ? 'At their address' : 'At the shop'}</span>
              </label>
            ))}
          </div>
        ) : null}
        <input type="hidden" name="location" value={location} />
        {location === 'mobile' ? (
          <div key={customer?.id ?? 'new'} className={styles.address}>
            <TextField name="addressLine1" label="Street address" maxLength={120} defaultValue={v.addressLine1 ?? address?.line1 ?? ''} error={e.addressLine1} />
            <div className={styles.grid3}>
              <TextField name="city" label="City" maxLength={60} defaultValue={v.city ?? address?.city ?? ''} error={e.city} />
              <TextField name="state" label="State" maxLength={2} placeholder="TX" defaultValue={v.state ?? address?.state ?? ''} error={e.state} />
              <TextField name="postalCode" label="ZIP" inputMode="numeric" maxLength={5} defaultValue={v.postalCode ?? address?.postalCode ?? ''} error={e.postalCode} />
            </div>
          </div>
        ) : (
          <p className={styles.muted}>At your shop.</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="s-notes">
        <h2 id="s-notes" className={styles.heading}>Internal notes</h2>
        <TextAreaField name="notes" label="Notes (only you see these)" rows={3} maxLength={2000} defaultValue={v.notes} error={e.notes} />
      </section>

      <section className={styles.summary} aria-label="Summary">
        <div>
          <p className={styles.strong}>{chosen.length && sizeId ? `${estimateLabel(est)} · ${aboutDuration(est.durationMin)}` : 'Choose a service and size'}</p>
          <p className={styles.muted}>Priced from your saved prices; checked again when you save. Confirmed straight away — no request step.</p>
        </div>
        <Button type="submit" variant="primary" disabled={pending} aria-disabled={pending}>
          {pending ? 'Saving…' : 'Create appointment'}
        </Button>
      </section>
    </form>
  );
}
