import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadSchema, leadStatus, parseLines, pipelineHistoryLine, quoteDuration, quoteStatus, quoteTotals, toItemsPayload, toLeadRow } from '../../src/domain/leads.ts';

const ID = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;

test('a new lead: phone normalised, vehicle parsed; no customer means no vehicle id', () => {
  const v = leadSchema.parse({ source: 'website', firstName: ' Jordan ', phone: '(512) 555-0142', year: '2021', make: 'Tesla', model: 'Model Y', vehicleId: ID(2) });
  const row = toLeadRow(v);
  assert.equal(row.contact_first_name, 'Jordan');
  assert.equal(row.contact_phone_e164, '+15125550142');
  assert.equal(row.vehicle_year, 2021);
  assert.equal(row.vehicle_id, null);
  assert.ok(!('business_id' in row) && !('status' in row));
});

test('lead validation reports every problem at once', () => {
  const r = leadSchema.safeParse({ source: 'phone', phone: '123', email: 'nope', year: '21' });
  assert.ok(!r.success);
  const paths = r.error.issues.map((i) => i.path.join('.')).sort();
  assert.deepEqual(paths, ['email', 'firstName', 'phone', 'year']);
  assert.ok(!leadSchema.safeParse({ source: 'phone', firstName: 'A' }).success, 'a phone or email is needed without a customer');
  assert.ok(leadSchema.safeParse({ source: 'phone', firstName: 'A', customerId: ID(1) }).success);
  assert.ok(!leadSchema.safeParse({ source: 'carrier_pigeon', firstName: 'A', phone: '5125550142' }).success);
});

test('legacy follow_up_due reads as Contacted; unknown statuses fall back to New', () => {
  assert.equal(leadStatus('follow_up_due').label, 'Contacted');
  assert.equal(leadStatus('booked').label, 'Converted');
  assert.equal(leadStatus('quote_sent').label, 'Quoted');
  assert.equal(leadStatus('weird').label, 'New');
});

test('quote lines: parsed to cents; totals and job length from quantities', () => {
  const r = parseLines(JSON.stringify([
    { serviceId: ID(4), name: 'Full detail', quantity: 1, price: '240', durationMin: 240 },
    { serviceId: '', name: 'Wheel coating', description: '', quantity: '4', price: '25.50', durationMin: 15 },
    { name: 'Custom', quantity: 2, price: '10' },
  ]));
  assert.ok(r.ok);
  assert.deepEqual(r.lines.map((l) => [l.serviceId, l.priceCents, l.quantity, l.durationMin, l.description]), [
    [ID(4), 24000, 1, 240, null],
    [null, 2550, 4, 15, null],
    [null, 1000, 2, null, null],
  ]);
  assert.deepEqual(quoteTotals(r.lines, 4000), { subtotal: 24000 + 10200 + 2000, discount: 4000, total: 32200 });
  assert.equal(quoteDuration(r.lines), 240 + 60);
});

test('bad quote lines are refused with one clear message', () => {
  const bad = (lines: unknown) => { const r = parseLines(JSON.stringify(lines)); assert.ok(!r.ok); return r.message; };
  assert.equal(bad([]), 'Add at least one line item.');
  assert.equal(bad([{ name: '', quantity: 1, price: '1' }]), 'Name every line.');
  assert.equal(bad([{ name: 'X', quantity: 0, price: '1' }]), 'Quantities are 1 to 99.');
  assert.equal(bad([{ name: 'X', quantity: 1.5, price: '1' }]), 'Quantities are whole numbers.');
  assert.equal(bad([{ name: 'X', quantity: 1, price: 'abc' }]), 'Enter prices like 180 or 180.00.');
  assert.equal(bad([{ name: 'X', quantity: 1, price: '1', serviceId: 'not-a-uuid' }]).length > 0, true);
  assert.equal(bad(Array.from({ length: 51 }, () => ({ name: 'X', quantity: 1, price: '1' }))), 'Up to 50 line items.');
  const r = parseLines('{not json');
  assert.ok(!r.ok && /couldn’t be read/.test(r.message));
});

test('the items payload carries lines only — never a business, status or total', () => {
  const r = parseLines(JSON.stringify([{ name: 'X', quantity: 2, price: '5' }]));
  assert.ok(r.ok);
  const payload = toItemsPayload(r.lines);
  assert.deepEqual(payload, [{ service_id: null, name: 'X', description: null, quantity: 2, price_cents: 500, duration_min: null }]);
  assert.ok(!JSON.stringify(payload).match(/business|status|total|subtotal/));
});

test('a sent quote past its date reads as expired; other statuses are unchanged', () => {
  assert.equal(quoteStatus('sent', '2026-10-30', '2026-10-31').value, 'expired');
  assert.equal(quoteStatus('sent', '2026-10-31', '2026-10-31').value, 'sent');
  assert.equal(quoteStatus('accepted', '2026-10-01', '2026-10-31').value, 'accepted');
  assert.equal(quoteStatus('converted', null, '2026-10-31').label, 'Booked');
});

test('history wording', () => {
  const e = (kind: string, extra: Partial<{ from_status: string; to_status: string; actor_type: string; metadata: Record<string, unknown> }> = {}) =>
    pipelineHistoryLine({ kind, from_status: null, to_status: null, actor_type: 'owner', metadata: {}, ...extra });
  assert.equal(e('lead_created'), 'Lead added');
  assert.equal(e('lead_contacted', { metadata: { channel: 'phone', note: 'Left a voicemail' } }), 'Called — “Left a voicemail”');
  assert.equal(e('lead_status_changed', { to_status: 'lost', metadata: { lost_reason: 'price' } }), 'You moved it to Lost (Price)');
  assert.equal(e('quote_status_changed', { to_status: 'accepted', actor_type: 'customer' }), 'Customer accepted the quote');
  assert.equal(e('quote_status_changed', { to_status: 'draft' }), 'Quote withdrawn (link disabled)');
  assert.equal(e('quote_status_changed', { to_status: 'converted', actor_type: 'system' }), 'Booked from the quote');
});
