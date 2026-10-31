'use client';

import { useActionState, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, Check, Clock } from 'lucide-react';
import { Notice } from '@/components/app/ui/Notice';
import { TextAreaField, TextField } from '@/components/app/ui/Field';
import {
  aboutDuration,
  contactSchema,
  cutoffPhrase,
  estimate,
  estimateLabel,
  linePrice,
  priceFor,
  priceRange,
  type BookingPage,
  type Slots,
} from '@/domain/booking';
import { mediaUrl } from '@/domain/branding';
import { formatPhone } from '@/domain/business';
import { idle, type FormState } from '@/domain/forms';
import { US_TIMEZONES } from '@/domain/business';
import styles from './booking.module.css';

type SlotsResult = { ok: true; slots: Slots } | { ok: false; message: string };
type LoadSlots = (q: { slug: string; serviceIds: string[]; sizeId: string; from: string }) => Promise<SlotsResult>;

const STEPS = ['Service', 'Time', 'Details', 'Review'] as const;
const DETAIL_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'vehicleYear', 'vehicleMake', 'vehicleModel', 'vehicleNotes', 'notes', 'location', 'addressLine1', 'city', 'state', 'postalCode'];

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// The visitor's own time zone, read after hydration (the server renders the business zone).
const subscribeNever = () => () => {};
function useVisitorZone(fallback: string) {
  return useSyncExternalStore(subscribeNever, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => fallback);
}

export function BookingFlow({
  page,
  today,
  loadSlots,
  submit,
  preview = false,
}: {
  page: BookingPage;
  today: string;
  loadSlots: LoadSlots;
  submit?: (state: FormState, formData: FormData) => Promise<FormState>;
  preview?: boolean;
}) {
  const tz = page.timezone;
  const zoneName = US_TIMEZONES.find((z) => z.value === tz)?.label ?? tz;
  const visitorZone = useVisitorZone(tz);
  const fmt = useMemo(
    () => ({
      day: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }),
      dayNum: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric' }),
      month: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }),
      longDay: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }),
      time: new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }),
      full: new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
    }),
    [tz],
  );
  const dateOf = (iso: string) => new Date(`${iso}T12:00:00Z`);

  const [step, setStep] = useState(0);
  const [sizeId, setSizeId] = useState<string | null>(page.size_classes.length === 1 ? page.size_classes[0]!.id : null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [from, setFrom] = useState(today);
  const [slots, setSlots] = useState<{ key: string; result: SlotsResult } | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({
    location: page.service_mode === 'shop' ? 'shop' : 'mobile',
    state: '',
  });
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(submit ?? (async () => idle), idle);

  const mains = page.services.filter((s) => !s.is_addon);
  const addons = page.services.filter((s) => s.is_addon && s.price_type !== 'quote_required');
  const size = page.size_classes.find((s) => s.id === sizeId) ?? null;
  const main = mains.find((s) => s.id === serviceId) ?? null;
  const lines = [main, ...addons.filter((a) => addonIds.includes(a.id))].filter((s) => s !== null).map((s) => priceFor(s, sizeId));
  const est = estimate(lines);
  const serviceIds = main ? [main.id, ...addonIds] : [];
  const slotKey = `${serviceIds.join(',')}|${sizeId}|${from}`;
  const current = slots?.key === slotKey ? slots.result : null;
  const instant = page.booking_mode === 'instant';
  const sizeIds = page.size_classes.map((s) => s.id);

  // Fetch open times when the Time step is showing for a new choice (server-side availability).
  useEffect(() => {
    if (step !== 1 || !main || !sizeId || current) return;
    let live = true;
    loadSlots({ slug: page.slug, serviceIds, sizeId, from }).then((result) => {
      if (live) setSlots({ key: slotKey, result });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slotKey captures the inputs
  }, [step, slotKey, current]);

  // A failed submit because the time was taken sends the customer back to pick another.
  const timeTaken = state.status === 'error' && state.values?.reason === 'time';
  const serverFieldErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const detailsNeedFixing = Object.keys(serverFieldErrors).some((k) => DETAIL_FIELDS.includes(k));

  const go = (n: number) => {
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const chooseService = (id: string) => {
    setServiceId(id);
    setStart(null);
  };
  const toggleAddon = (id: string) => {
    setAddonIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    setStart(null);
  };
  const chooseSize = (id: string) => {
    setSizeId(id);
    setStart(null);
  };
  const reloadTimes = () => {
    setSlots(null);
    setStart(null);
    go(1);
  };

  const validateDetails = () => {
    // Same shape the server receives: every field present as a string (hidden inputs).
    const parsed = contactSchema.safeParse({ ...Object.fromEntries(DETAIL_FIELDS.map((k) => [k, details[k] ?? ''])), consent: 'on' });
    if (parsed.success) {
      setDetailErrors({});
      go(3);
      return;
    }
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    setDetailErrors(errors);
  };

  const days = current?.ok ? current.slots.days : [];
  const selectedDate = date && days.some((d) => d.date === date) ? date : (days.find((d) => d.slots.length)?.date ?? null);
  const daySlots = days.find((d) => d.date === selectedDate)?.slots ?? [];
  const lastBookable = current?.ok ? current.slots.last_bookable_date : null;

  const canContinue = [Boolean(main && sizeId), Boolean(start), true, true][step];
  const field = (name: string) => ({
    name,
    value: details[name] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDetails((d) => ({ ...d, [name]: e.target.value })),
    error: detailErrors[name] ?? serverFieldErrors[name],
  });

  if (!page.accepting_requests) {
    return (
      <section className={styles.flow}>
        <Notice tone="info">{page.name} isn’t taking online bookings right now. Please call or text to book.</Notice>
        <Menu page={page} sizeIds={sizeIds} readOnly />
      </section>
    );
  }

  const summary = (
    <div className={styles.summaryInner}>
      <p className={styles.summaryLabel}>{main ? 'Your booking' : 'Choose a service to see an estimate'}</p>
      {main ? (
        <>
          <p className={styles.summaryMain}>
            {main.name}
            {size ? ` · ${size.name}` : ''}
          </p>
          {addonIds.length ? <p className={styles.summaryMeta}>+ {lines.filter((l) => l.isAddon).map((l) => l.name).join(', ')}</p> : null}
          <p className={styles.summaryMeta}>
            {sizeId ? (
              <>
                <strong>{estimateLabel(est)}</strong> · {aboutDuration(est.durationMin)}
              </>
            ) : (
              'Choose your vehicle size for the price'
            )}
          </p>
          {start ? <p className={styles.summaryMeta}>{fmt.full.format(new Date(start))}</p> : null}
        </>
      ) : null}
    </div>
  );

  const primary =
    step < 3 ? (
      // Distinct keys: React must create a new element for the submit button. Re-using the
      // "Review" button would flip its type mid-click and submit the form unintentionally.
      <button
        key="next"
        type="button"
        className={styles.primary}
        disabled={!canContinue}
        onClick={() => (step === 2 ? validateDetails() : go(step + 1))}
      >
        {step === 0 ? 'Choose a time' : step === 1 ? 'Continue' : 'Review'}
      </button>
    ) : (
      <button key="submit" type="submit" form="booking-form" className={styles.primary} disabled={pending || preview}>
        {pending ? (instant ? 'Booking…' : 'Sending…') : instant ? 'Book now' : 'Send request'}
      </button>
    );

  return (
    <section className={styles.flow} aria-label="Book an appointment">
      <div className={styles.flowGrid}>
        <div className={styles.flowMain}>
          <nav className={styles.progress} aria-label="Booking progress">
            <p className={styles.progressText}>
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </p>
            <ol className={styles.progressBar} role="list">
              {STEPS.map((label, i) => (
                <li key={label} className={i <= step ? styles.progressDone : undefined} aria-current={i === step ? 'step' : undefined}>
                  <span className={styles.visuallyHidden}>{label}</span>
                </li>
              ))}
            </ol>
          </nav>

          {step > 0 ? (
            <button type="button" className={styles.back} onClick={() => go(step - 1)}>
              <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" /> Back
            </button>
          ) : (
            <p className={styles.noAccount}>No account needed — you’ll get a link to check your booking.</p>
          )}

          {step === 0 ? (
            <div className={styles.step}>
              {page.size_classes.length > 1 ? (
                <fieldset className={styles.group}>
                  <legend className={styles.stepTitle}>What are we detailing?</legend>
                  <p className={styles.hint}>Prices and times depend on the vehicle’s size.</p>
                  <div className={styles.sizes}>
                    {page.size_classes.map((s) => (
                      <label key={s.id} className={styles.sizeOption}>
                        <input type="radio" name="size" value={s.id} checked={sizeId === s.id} onChange={() => chooseSize(s.id)} />
                        <span className={styles.sizeName}>{s.name}</span>
                        {s.examples ? <span className={styles.sizeExamples}>{s.examples}</span> : null}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <Menu page={page} sizeIds={sizeIds} sizeId={sizeId} serviceId={serviceId} onChoose={chooseService} />
              {main && addons.length ? (
                <fieldset className={styles.group}>
                  <legend className={styles.groupTitle}>Add-ons (optional)</legend>
                  <ul className={styles.rows} role="list">
                    {addons.map((a) => {
                      const l = priceFor(a, sizeId);
                      return (
                        <li key={a.id}>
                          <label className={styles.row}>
                            <input type="checkbox" checked={addonIds.includes(a.id)} onChange={() => toggleAddon(a.id)} />
                            <span className={styles.rowText}>
                              <span className={styles.rowName}>{a.name}</span>
                              {a.description ? <span className={styles.rowDesc}>{a.description}</span> : null}
                            </span>
                            <span className={styles.rowPrice}>
                              {sizeId ? `+${linePrice(l)}` : priceRange(a, sizeIds)}
                              <span className={styles.rowTime}>+{aboutDuration(l.durationMin).replace('about ', '')}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              ) : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div className={styles.step}>
              <h2 className={styles.stepTitle}>When works for you?</h2>
              <p className={styles.hint}>
                <Clock size={14} strokeWidth={1.5} aria-hidden="true" /> Times are in {zoneName} · {aboutDuration(est.durationMin)}
              </p>
              {visitorZone !== tz ? (
                <Notice tone="info">Your device is set to a different time zone. Times below are local to {page.name} ({zoneName}).</Notice>
              ) : null}
              {timeTaken ? <Notice tone="attention">That time was just taken. Please choose another.</Notice> : null}
              {!current ? (
                <p className={styles.loading} role="status">
                  Finding open times…
                </p>
              ) : !current.ok ? (
                <Notice tone="critical">{current.message}</Notice>
              ) : (
                <>
                  <div className={styles.dates} role="listbox" aria-label="Dates">
                    {days.map((d) => {
                      const open = d.slots.length > 0;
                      const label = `${fmt.longDay.format(dateOf(d.date))}${open ? '' : ' — no open times'}`;
                      return (
                        <button
                          key={d.date}
                          type="button"
                          role="option"
                          aria-selected={d.date === selectedDate}
                          aria-label={label}
                          disabled={!open}
                          className={styles.date}
                          onClick={() => {
                            setDate(d.date);
                            setStart(null);
                          }}
                        >
                          <span className={styles.dateDay}>{fmt.day.format(dateOf(d.date))}</span>
                          <span className={styles.dateNum}>{fmt.dayNum.format(dateOf(d.date))}</span>
                          <span className={styles.dateMonth}>{fmt.month.format(dateOf(d.date))}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedDate ? (
                    <>
                      <h3 className={styles.groupTitle}>{fmt.longDay.format(dateOf(selectedDate))}</h3>
                      <div className={styles.times} role="radiogroup" aria-label="Start times">
                        {daySlots.map((s) => (
                          <button
                            key={s}
                            type="button"
                            role="radio"
                            aria-checked={start === s}
                            className={styles.time}
                            onClick={() => setStart(s)}
                          >
                            {fmt.time.format(new Date(s))}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className={styles.empty}>No open times in these two weeks.</p>
                  )}
                  <div className={styles.pager}>
                    {from > today ? (
                      <button type="button" className={styles.textButton} onClick={() => setFrom(addDays(from, -14))}>
                        Earlier dates
                      </button>
                    ) : (
                      <span />
                    )}
                    {lastBookable && addDays(from, 14) <= lastBookable ? (
                      <button type="button" className={styles.textButton} onClick={() => setFrom(addDays(from, 14))}>
                        Later dates
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className={styles.step}>
              <h2 className={styles.stepTitle}>Your details</h2>
              <div className={styles.pair}>
                <TextField label="First name" autoComplete="given-name" maxLength={60} {...field('firstName')} />
                <TextField label="Last name" autoComplete="family-name" maxLength={60} {...field('lastName')} />
                <TextField label="Mobile phone" type="tel" autoComplete="tel" inputMode="tel" {...field('phone')} />
                <TextField label="Email" type="email" autoComplete="email" {...field('email')} />
              </div>
              <h3 className={styles.groupTitle}>Which vehicle is this for?</h3>
              <div className={styles.triple}>
                <TextField label="Year" inputMode="numeric" maxLength={4} {...field('vehicleYear')} />
                <TextField label="Make" placeholder="e.g. Toyota" maxLength={40} {...field('vehicleMake')} />
                <TextField label="Model" placeholder="e.g. Tacoma" maxLength={40} {...field('vehicleModel')} />
              </div>
              <p className={styles.hint}>Booking for more than one vehicle? Send a separate booking for each.</p>
              <TextAreaField label="Vehicle notes (optional)" rows={2} maxLength={500} hint="Pet hair, stains, oversized tires — anything that affects the job." {...field('vehicleNotes')} />

              {page.service_mode === 'both' ? (
                <fieldset className={styles.group}>
                  <legend className={styles.groupTitle}>Where should the job happen?</legend>
                  <div className={styles.sizes}>
                    {(['mobile', 'shop'] as const).map((loc) => (
                      <label key={loc} className={styles.sizeOption}>
                        <input type="radio" name="locationChoice" checked={details.location === loc} onChange={() => setDetails((d) => ({ ...d, location: loc }))} />
                        <span className={styles.sizeName}>{loc === 'mobile' ? 'At my place' : 'At the shop'}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              {details.location === 'mobile' ? (
                <>
                  <h3 className={styles.groupTitle}>Where is the vehicle?</h3>
                  <TextField label="Street address" autoComplete="address-line1" maxLength={120} {...field('addressLine1')} />
                  <div className={styles.triple}>
                    <TextField label="City" autoComplete="address-level2" maxLength={60} {...field('city')} />
                    <TextField label="State" autoComplete="address-level1" maxLength={2} placeholder="TX" {...field('state')} />
                    <TextField label="ZIP code" autoComplete="postal-code" inputMode="numeric" maxLength={5} {...field('postalCode')} />
                  </div>
                </>
              ) : null}
              <TextAreaField label="Anything else? (optional)" rows={3} maxLength={1000} {...field('notes')} />
            </div>
          ) : null}

          {step === 3 ? (
            <form id="booking-form" action={action} className={styles.step} noValidate>
              <h2 className={styles.stepTitle}>Review and {instant ? 'book' : 'send'}</h2>
              {state.status === 'error' ? (
                <Notice
                  tone="critical"
                  action={
                    timeTaken ? (
                      <button type="button" className={styles.textButton} onClick={reloadTimes}>
                        Choose another time
                      </button>
                    ) : detailsNeedFixing ? (
                      <button type="button" className={styles.textButton} onClick={() => go(2)}>
                        Edit details
                      </button>
                    ) : null
                  }
                >
                  {state.message}
                </Notice>
              ) : null}
              <dl className={styles.review}>
                <dt>When</dt>
                <dd>{start ? fmt.full.format(new Date(start)) : ''}</dd>
                <dt>Vehicle</dt>
                <dd>
                  {details.vehicleYear} {details.vehicleMake} {details.vehicleModel} · {size?.name}
                </dd>
                <dt>Where</dt>
                <dd>
                  {details.location === 'mobile'
                    ? `${details.addressLine1}, ${details.city}, ${details.state?.toUpperCase()} ${details.postalCode}`
                    : page.shop_address?.city
                      ? `At the shop · ${[page.shop_address.line1, page.shop_address.city].filter(Boolean).join(', ')}`
                      : 'At the shop'}
                </dd>
                <dt>Contact</dt>
                <dd>
                  {details.firstName} {details.lastName} · {formatPhone(`+1${(details.phone ?? '').replace(/\D/g, '').slice(-10)}`)} · {details.email}
                </dd>
              </dl>

              <table className={styles.breakdown}>
                <caption className={styles.groupTitle}>Price estimate</caption>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <th scope="row">
                        {l.name}
                        <span className={styles.rowTime}>{aboutDuration(l.durationMin)}</span>
                      </th>
                      <td>{linePrice(l)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">
                      Estimated total
                      <span className={styles.rowTime}>{aboutDuration(est.durationMin)}</span>
                    </th>
                    <td>{estimateLabel(est)}</td>
                  </tr>
                </tfoot>
              </table>
              <p className={styles.hint}>
                {est.isMinimum
                  ? `“From” prices are starting prices: ${page.name} confirms the final price after seeing the vehicle.`
                  : `This is an estimate for a ${size?.name.toLowerCase()} in typical condition. ${page.name} confirms the final price.`}{' '}
                No payment is taken online.
              </p>
              <p className={styles.hint}>
                {instant
                  ? 'Your appointment is confirmed as soon as you book. You’ll get a link to check or cancel it.'
                  : `This is a request, not a confirmed appointment. ${page.name} will confirm it, decline it, or suggest another time — check your link for updates.`}
              </p>
              {page.policies.online_cancellation ? (
                <p className={styles.hint}>Cancel online with your link {cutoffPhrase(page.policies.cancel_cutoff_hours)}.</p>
              ) : null}

              <input type="hidden" name="selection" value={JSON.stringify({ serviceId, addonIds, sizeId, start, idempotencyKey })} />
              {DETAIL_FIELDS.map((k) => (
                <input key={k} type="hidden" name={k} value={details[k] ?? ''} />
              ))}
              <label className={styles.consent}>
                <input type="checkbox" name="consent" defaultChecked={state.values?.consent === 'on'} />
                <span>
                  {page.name} may contact me by phone, text or email about this booking.
                  {serverFieldErrors.consent ? <span className={styles.consentError}>{serverFieldErrors.consent}</span> : null}
                </span>
              </label>
              {preview ? <Notice tone="info">Preview: booking is turned off here. Customers use the button on your live page.</Notice> : null}
            </form>
          ) : null}
        </div>

        <aside className={styles.rail} aria-label="Booking summary">
          {summary}
          {primary}
        </aside>
      </div>
      <p className={styles.visuallyHidden} aria-live="polite">
        {main && sizeId ? `Estimate ${estimateLabel(est)}, ${aboutDuration(est.durationMin)}` : ''}
      </p>
    </section>
  );
}

// Service menu grouped by category (rows, not cards). Quote-only services are listed so customers
// know they exist, but can't be selected for online booking.
function Menu({
  page,
  sizeIds,
  sizeId = null,
  serviceId = null,
  onChoose,
  readOnly = false,
}: {
  page: BookingPage;
  sizeIds: string[];
  sizeId?: string | null;
  serviceId?: string | null;
  onChoose?: (id: string) => void;
  readOnly?: boolean;
}) {
  const mains = page.services.filter((s) => !s.is_addon);
  const groups = [
    ...page.categories.map((c) => ({ id: c.id, name: c.name, items: mains.filter((s) => s.category_id === c.id) })),
    { id: 'none', name: page.categories.length ? 'Other services' : 'Services', items: mains.filter((s) => !s.category_id || !page.categories.some((c) => c.id === s.category_id)) },
  ].filter((g) => g.items.length);

  if (!mains.length) return <p className={styles.empty}>No services are listed yet.</p>;
  return (
    <fieldset className={styles.group}>
      <legend className={readOnly ? styles.groupTitle : styles.stepTitle}>{readOnly ? 'Services' : 'Choose a service'}</legend>
      {groups.map((g) => (
        <div key={g.id} className={styles.category}>
          {groups.length > 1 || page.categories.length ? <h3 className={styles.categoryName}>{g.name}</h3> : null}
          <ul className={styles.rows} role="list">
            {g.items.map((s) => {
              const quote = s.price_type === 'quote_required';
              const l = priceFor(s, sizeId);
              const price = quote ? 'Quote required' : sizeId ? linePrice(l) : priceRange(s, sizeIds);
              const photo = page.branding.service_photos[s.id];
              const content = (
                <>
                  {photo ? (
                    // Decorative: the service name sits right beside it.
                    // eslint-disable-next-line @next/next/no-img-element -- same-origin, already sized WebP
                    <img className={styles.rowPhoto} src={mediaUrl(photo.id)} alt="" width={photo.width} height={photo.height} loading="lazy" decoding="async" />
                  ) : null}
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>{s.name}</span>
                    {s.description ? <span className={styles.rowDesc}>{s.description}</span> : null}
                    {quote ? (
                      <span className={styles.rowDesc}>
                        Custom quote — not bookable online.{' '}
                        {page.phone ? (
                          <>
                            Call or text <a href={`tel:${page.phone}`}>{formatPhone(page.phone)}</a>.
                          </>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.rowPrice}>
                    {price}
                    {!quote ? <span className={styles.rowTime}>{aboutDuration(l.durationMin)}</span> : null}
                  </span>
                </>
              );
              return (
                <li key={s.id}>
                  {readOnly || quote ? (
                    <div className={`${styles.row} ${quote && !readOnly ? styles.rowDisabled : ''}`}>{content}</div>
                  ) : (
                    <label className={styles.row}>
                      <input type="radio" name="service" value={s.id} checked={serviceId === s.id} onChange={() => onChoose?.(s.id)} />
                      {content}
                      {serviceId === s.id ? <Check className={styles.rowCheck} size={18} strokeWidth={2} aria-hidden="true" /> : null}
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </fieldset>
  );
}
