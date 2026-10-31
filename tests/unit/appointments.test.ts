import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appointmentSchema, SOURCE_LABEL, toCreateArgs } from '../../src/domain/appointments.ts';

const ID = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
const base = {
  source: 'phone', customerMode: 'existing', customerId: ID(1), vehicleMode: 'existing', vehicleId: ID(2), sizeId: ID(3), serviceId: ID(4),
  addonIds: [ID(5)], date: '2026-11-09', slot: '2026-11-09T15:00:00.000Z', location: 'mobile', addressLine1: '1 Main St', state: 'tx', postalCode: '78701',
};

test('a complete existing-customer booking parses; the database gets ids, a size and a time — no price or business', () => {
  const v = appointmentSchema.parse(base);
  const args = toCreateArgs(v);
  assert.deepEqual(args.p_service_ids, [ID(4), ID(5)]);
  assert.equal(args.p_customer, null);
  assert.equal(args.p_vehicle, null);
  assert.equal(args.p_starts_at, base.slot);
  assert.deepEqual(args.p_address, { line1: '1 Main St', city: '', state: 'TX', postal_code: '78701' });
  assert.ok(!JSON.stringify(args).match(/price|cents|duration|business/));
});

test('a new customer and vehicle: phone normalised; phone or email required; make and model required', () => {
  const v = appointmentSchema.parse({ ...base, customerMode: 'new', customerId: '', firstName: 'Jordan', phone: '(512) 555-0142', vehicleMode: 'new', vehicleId: '', make: 'Tesla', model: 'Model Y', year: '2021' });
  const args = toCreateArgs(v);
  assert.deepEqual(args.p_customer, { first_name: 'Jordan', last_name: '', phone_e164: '+15125550142', email: '' });
  assert.deepEqual(args.p_vehicle, { year: 2021, make: 'Tesla', model: 'Model Y', color: '' });
  assert.equal(args.p_customer_id, null);
});

test('every missing detail is reported in one go', () => {
  const r = appointmentSchema.safeParse({ source: 'phone', customerMode: 'new', vehicleMode: 'new', location: 'mobile' });
  assert.ok(!r.success);
  const fields = new Set(r.error.issues.map((i) => String(i.path[0])));
  for (const f of ['firstName', 'phone', 'make', 'model', 'sizeId', 'serviceId', 'slot', 'addressLine1']) assert.ok(fields.has(f), f);
});

test('rules: valid source, US phone, mobile address, ZIP, no time needed when booking a hold', () => {
  assert.ok(!appointmentSchema.safeParse({ ...base, source: 'booking_page' }).success, 'booking page is not an owner source');
  assert.ok(!appointmentSchema.safeParse({ ...base, customerMode: 'new', customerId: '', firstName: 'X', phone: '555-01' }).success);
  assert.ok(!appointmentSchema.safeParse({ ...base, addressLine1: '' }).success, 'mobile jobs need a street address');
  assert.ok(appointmentSchema.safeParse({ ...base, location: 'shop', addressLine1: '' }).success, 'shop jobs do not');
  assert.ok(!appointmentSchema.safeParse({ ...base, postalCode: '7870' }).success);
  const hold = appointmentSchema.parse({ ...base, slot: '', holdId: ID(6) });
  assert.equal(toCreateArgs(hold).p_starts_at, null);
  assert.equal(toCreateArgs(hold).p_hold_id, ID(6));
  assert.equal(SOURCE_LABEL.walk_in, 'Walk-in');
  assert.equal(SOURCE_LABEL.booking_page, 'Booking page');
});
