import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayStatus, FILTERS, historyLine, isClock, isIsoDate, localTimestamp, parseFilter, sortRank } from '../../src/domain/bookings.ts';

const now = new Date('2026-11-01T12:00:00Z');
const future = '2026-11-05T15:00:00Z';
const past = '2026-10-30T15:00:00Z';

test('an appointment’s status wins over its request’s', () => {
  const req = { status: 'approved' as const, requested_start: future, proposal_expires_at: null };
  assert.equal(displayStatus(req, { status: 'scheduled' }, now), 'confirmed');
  assert.equal(displayStatus(req, { status: 'cancelled' }, now), 'cancelled');
  assert.equal(displayStatus(null, { status: 'no_show' }, now), 'no_show');
  assert.equal(displayStatus(null, { status: 'completed' }, now), 'completed');
});

test('requests read like app.effective_request_status: past pending and lapsed proposals are expired', () => {
  assert.equal(displayStatus({ status: 'pending', requested_start: future, proposal_expires_at: null }, null, now), 'pending');
  assert.equal(displayStatus({ status: 'pending', requested_start: past, proposal_expires_at: null }, null, now), 'expired');
  assert.equal(displayStatus({ status: 'time_proposed', requested_start: future, proposal_expires_at: future }, null, now), 'proposed');
  assert.equal(displayStatus({ status: 'time_proposed', requested_start: future, proposal_expires_at: past }, null, now), 'expired');
  assert.equal(displayStatus({ status: 'closed_duplicate', requested_start: future, proposal_expires_at: null }, null, now), 'duplicate');
});

test('every status belongs to exactly one filter besides All', () => {
  const all = ['pending', 'proposed', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'declined', 'withdrawn', 'expired', 'proposal_declined', 'duplicate'];
  for (const s of all) assert.equal(FILTERS.filter((f) => f.statuses && (f.statuses as readonly string[]).includes(s)).length, 1, s);
  assert.equal(parseFilter('pending'), 'pending');
  assert.equal(parseFilter('nonsense'), 'all');
  assert.equal(parseFilter(undefined), 'all');
});

test('sorting: waiting requests (soonest first), then upcoming jobs (soonest first), then the rest (newest first)', () => {
  const rows = [
    { s: 'completed', d: '2026-10-29T15:00:00Z' },
    { s: 'confirmed', d: '2026-11-09T15:00:00Z' },
    { s: 'pending', d: '2026-11-08T15:00:00Z' },
    { s: 'proposed', d: '2026-11-03T15:00:00Z' },
    { s: 'confirmed', d: '2026-11-02T15:00:00Z' },
    { s: 'declined', d: '2026-10-31T15:00:00Z' },
  ] as const;
  const sorted = [...rows].sort((x, y) => {
    const [a1, a2] = sortRank(x.s, new Date(x.d), now);
    const [b1, b2] = sortRank(y.s, new Date(y.d), now);
    return a1 - b1 || a2 - b2;
  });
  assert.deepEqual(sorted.map((r) => `${r.s} ${r.d.slice(5, 10)}`), [
    'proposed 11-03', 'pending 11-08', 'confirmed 11-02', 'confirmed 11-09', 'declined 10-31', 'completed 10-29',
  ]);
});

test('history wording', () => {
  assert.equal(historyLine({ kind: 'request_submitted', to_status: 'pending', actor_type: 'customer', metadata: {} }), 'Request received from the booking page');
  assert.equal(historyLine({ kind: 'request_status_changed', to_status: 'approved', actor_type: 'owner', metadata: {} }), 'You confirmed the booking');
  assert.equal(historyLine({ kind: 'request_status_changed', to_status: 'approved', actor_type: 'customer', metadata: {} }), 'Customer confirmed the booking');
  assert.equal(historyLine({ kind: 'request_status_changed', to_status: 'proposal_declined', actor_type: 'customer', metadata: {} }), 'Customer declined the proposed time');
  assert.equal(historyLine({ kind: 'appointment_status_changed', to_status: 'no_show', actor_type: 'owner', metadata: {} }), 'You marked it a no-show');
  assert.equal(historyLine({ kind: 'request_status_changed', to_status: 'expired', actor_type: 'system', metadata: {} }), 'Request expired');
});

test('date and time inputs; local timestamps are read by PostgreSQL in the business zone', () => {
  assert.ok(isIsoDate('2026-11-09'));
  for (const bad of ['2026-13-01', '11/09/2026', '', '2026-11-9']) assert.ok(!isIsoDate(bad), bad);
  assert.ok(isClock('09:30') && isClock('23:45'));
  for (const bad of ['24:00', '9:30', '12:60', '']) assert.ok(!isClock(bad), bad);
  assert.equal(localTimestamp('2026-11-09', '13:00', 'America/Chicago'), '2026-11-09 13:00 America/Chicago');
});
