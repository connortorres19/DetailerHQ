import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingErrorMessage,
  bookingPageTextSchema,
  contactSchema,
  cutoffPhrase,
  estimate,
  estimateLabel,
  priceFor,
  priceRange,
  selectionSchema,
  sentence,
  statusCopy,
  toRequestPayload,
  type PublicService,
  type RequestStatus,
} from '../../src/domain/booking.ts';

const LARGE = '22222222-2222-4222-8222-222222222222';
const VAN = '33333333-3333-4333-8333-333333333333';
const service = (over: Partial<PublicService> = {}): PublicService => ({
  id: '11111111-1111-4111-8111-111111111111', name: 'Full detail', description: null, category_id: null,
  price_type: 'fixed', price_cents: 18000, duration_min: 180, is_addon: false,
  by_size: [{ size_class_id: LARGE, price_cents: 24000, duration_min: 240 }, { size_class_id: VAN, price_cents: null, duration_min: 270 }],
  ...over,
});

test('size pricing mirrors app.priced_services: overrides replace the base, blanks fall back', () => {
  assert.deepEqual([priceFor(service(), null).priceCents, priceFor(service(), null).durationMin], [18000, 180]);
  assert.deepEqual([priceFor(service(), LARGE).priceCents, priceFor(service(), LARGE).durationMin], [24000, 240]);
  assert.deepEqual([priceFor(service(), VAN).priceCents, priceFor(service(), VAN).durationMin], [18000, 270], 'blank price → base');
});

test('estimates add services and add-ons; any "from" price makes the total a minimum', () => {
  const addon = service({ id: 'a', name: 'Pet hair removal', price_cents: 4000, duration_min: 30, is_addon: true, by_size: [] });
  const e = estimate([priceFor(service(), LARGE), priceFor(addon, LARGE)]);
  assert.deepEqual(e, { totalCents: 28000, durationMin: 270, isMinimum: false });
  assert.equal(estimateLabel(e), '$280');
  const from = estimate([priceFor(service({ price_type: 'starting_at' }), null)]);
  assert.equal(estimateLabel(from), 'From $180');
});

test('menu prices before a size is chosen show the lowest price, and quotes say so', () => {
  assert.equal(priceRange(service(), [LARGE, VAN]), 'From $180');
  assert.equal(priceRange(service({ by_size: [] }), [LARGE]), '$180');
  assert.equal(priceRange(service({ price_type: 'quote_required', price_cents: null }), [LARGE]), 'Quote required');
});

const contact = {
  firstName: 'Jordan', lastName: 'Reyes', email: ' Jordan.Reyes@Example.com ', phone: '(512) 555-0142',
  vehicleYear: '2021', vehicleMake: 'Tesla', vehicleModel: 'Model Y', vehicleNotes: '', notes: '',
  location: 'mobile', addressLine1: '1234 Oak St', city: 'Austin', state: 'tx', postalCode: '78701', consent: 'on',
};

test('customer details are normalised: E.164 phone, lower-case email, upper-case state', () => {
  const r = contactSchema.parse(contact);
  assert.equal(r.phone, '+15125550142');
  assert.equal(r.email, 'jordan.reyes@example.com');
  assert.equal(r.state, 'TX');
  assert.equal(r.vehicleYear, 2021);
  assert.equal(r.vehicleNotes, null);
});

test('invalid customer input is rejected field by field', () => {
  const r = contactSchema.safeParse({ ...contact, phone: '555-0142', email: 'nope', vehicleYear: '21', vehicleMake: '', postalCode: '7870', consent: '' });
  assert.ok(!r.success);
  const fields = new Set(r.error.issues.map((i) => String(i.path[0])));
  for (const f of ['phone', 'email', 'vehicleYear', 'vehicleMake', 'postalCode', 'consent']) assert.ok(fields.has(f), f);
});

test('mobile jobs need an address; shop visits do not', () => {
  const missing = contactSchema.safeParse({ ...contact, addressLine1: '', city: '', state: '', postalCode: '' });
  assert.ok(!missing.success);
  assert.deepEqual(new Set(missing.error.issues.map((i) => String(i.path[0]))), new Set(['addressLine1', 'city', 'state', 'postalCode']));
  assert.ok(contactSchema.safeParse({ ...contact, location: 'shop', addressLine1: '', city: '', state: '', postalCode: '' }).success);
});

test('the payload sent to the database holds ids, a time and contact details only — never prices or a business id', () => {
  const selection = selectionSchema.parse({
    serviceId: '11111111-1111-4111-8111-111111111111', addonIds: [], sizeId: LARGE,
    start: '2026-11-09T15:00:00+00:00', idempotencyKey: '44444444-4444-4444-8444-444444444444',
  });
  const payload = toRequestPayload(selection, contactSchema.parse(contact));
  const allowed = ['service_ids', 'vehicle_size_class_id', 'requested_start', 'location_type', 'service_address_line1', 'service_city',
    'service_state', 'service_postal_code', 'contact_first_name', 'contact_last_name', 'contact_phone_e164', 'contact_email',
    'vehicle_year', 'vehicle_make', 'vehicle_model', 'vehicle_notes', 'customer_notes', 'consent'];
  for (const k of Object.keys(payload)) assert.ok(allowed.includes(k), `unexpected key ${k}`);
  assert.ok(!JSON.stringify(payload).match(/price|cents|duration|business/));
  assert.equal(toRequestPayload(selection, contactSchema.parse({ ...contact, location: 'shop' })).service_city, null);
});

test('selections must be well-formed ids and an ISO time', () => {
  const base = { serviceId: '11111111-1111-4111-8111-111111111111', addonIds: [], sizeId: LARGE, start: '2026-11-09T15:00:00+00:00', idempotencyKey: '44444444-4444-4444-8444-444444444444' };
  assert.ok(selectionSchema.safeParse(base).success);
  for (const bad of [{ serviceId: 'x' }, { start: 'tomorrow' }, { addonIds: Array(10).fill(LARGE) }, { idempotencyKey: '1' }])
    assert.ok(!selectionSchema.safeParse({ ...base, ...bad }).success, JSON.stringify(bad));
});

test('database reasons become plain messages', () => {
  assert.match(bookingErrorMessage({ code: 'DH004', message: 'time_unavailable', detail: 'fully booked' }), /just taken/);
  assert.match(bookingErrorMessage({ code: 'DH004', message: 'time_unavailable', detail: 'too soon' }), /booking window/);
  assert.match(bookingErrorMessage({ code: 'DH005', message: 'too many requests', detail: null }), /Too many attempts/);
  assert.match(bookingErrorMessage({ code: 'DH004', message: 'unknown or unavailable service', detail: null }), /no longer available/);
});

test('policy wording', () => {
  assert.equal(cutoffPhrase(24), 'until 1 day before the appointment');
  assert.equal(cutoffPhrase(48), 'until 2 days before the appointment');
  assert.equal(cutoffPhrase(5), 'until 5 hours before the appointment');
  assert.equal(cutoffPhrase(0), 'up to the start time');
  assert.equal(sentence('Northside Detail Co.'), 'Northside Detail Co.');
  assert.equal(sentence('Alpha Auto Spa'), 'Alpha Auto Spa.');
});

test('status copy never calls a pending request confirmed', () => {
  const s = { status: 'pending', time_held: false, business: { name: 'Northside Detail Co.' }, appointment: null } as unknown as RequestStatus;
  assert.equal(statusCopy(s).headline, 'Request received — not confirmed yet');
  assert.equal(statusCopy({ ...s, time_held: true }).headline, 'Request received — your time is being held (not a confirmation)');
  const booked = { ...s, status: 'approved', appointment: { status: 'scheduled' } } as unknown as RequestStatus;
  assert.equal(statusCopy(booked).headline, 'Appointment confirmed');
  const cancelled = { ...s, status: 'approved', appointment: { status: 'cancelled', cancelled_by: 'customer' } } as unknown as RequestStatus;
  assert.equal(statusCopy(cancelled).next, 'You cancelled this appointment.');
});

test('owner booking-page text: limits match the database, blanks become null', () => {
  const ok = bookingPageTextSchema.parse({ intro: '  Hand-washed, never rushed. ', cancellation: '', rescheduling: '', prep: '', onlineCancellation: 'on' });
  assert.deepEqual(ok, { intro: 'Hand-washed, never rushed.', cancellation: null, rescheduling: null, prep: null, onlineCancellation: true });
  assert.equal(bookingPageTextSchema.parse({ intro: '', cancellation: '', rescheduling: '', prep: '' }).onlineCancellation, false);
  assert.ok(!bookingPageTextSchema.safeParse({ intro: 'x'.repeat(301), cancellation: '', rescheduling: '', prep: '' }).success);
  assert.ok(!bookingPageTextSchema.safeParse({ intro: '', cancellation: 'x'.repeat(1001), rescheduling: '', prep: '' }).success);
});
