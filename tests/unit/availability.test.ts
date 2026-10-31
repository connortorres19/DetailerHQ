import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingRulesSchema, formatClock, parseWeek, TIME_OPTIONS, timeOffSchema } from '../../src/domain/availability.ts';

const week = (w: unknown) => parseWeek(JSON.stringify(w));

test('a lunch break is two windows on the same day', () => {
  const r = week([
    { weekday: 1, start: '08:00', end: '12:00' },
    { weekday: 1, start: '13:00', end: '17:00' },
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.windows, [
    { weekday: 1, start: '08:00', end: '12:00' },
    { weekday: 1, start: '13:00', end: '17:00' },
  ]);
});

test('overlapping windows on a day are rejected, keyed by that day', () => {
  const r = week([
    { weekday: 2, start: '09:00', end: '13:00' },
    { weekday: 2, start: '12:00', end: '17:00' },
    { weekday: 3, start: '09:00', end: '17:00' },
  ]);
  assert.ok(!r.ok);
  assert.deepEqual(Object.keys(r.errors), ['day.2']);
  assert.match(r.errors['day.2']!, /Tuesday: windows overlap/);
});

test('the same hours on different days do not overlap', () => {
  const r = week([
    { weekday: 1, start: '09:00', end: '17:00' },
    { weekday: 2, start: '09:00', end: '17:00' },
  ]);
  assert.ok(r.ok);
});

test('touching windows merge into one; order sent does not matter', () => {
  const r = week([
    { weekday: 6, start: '12:00', end: '14:00' },
    { weekday: 6, start: '09:00', end: '12:00' },
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.windows, [{ weekday: 6, start: '09:00', end: '14:00' }]);
});

test('windows must end after they start; 24:00 is a valid end only', () => {
  for (const w of [{ start: '10:00', end: '10:00' }, { start: '17:00', end: '09:00' }, { start: '24:00', end: '24:00' }]) {
    const r = week([{ weekday: 4, ...w }]);
    assert.ok(!r.ok, JSON.stringify(w));
    assert.match(r.errors['day.4']!, /must end after it starts/);
  }
  assert.ok(week([{ weekday: 0, start: '18:00', end: '24:00' }]).ok);
});

test('malformed week payloads are refused', () => {
  for (const bad of ['nope', '{}', JSON.stringify([{ weekday: 7, start: '09:00', end: '10:00' }]), JSON.stringify([{ weekday: 1, start: '9am', end: '10:00' }])]) {
    const r = parseWeek(bad);
    assert.ok(!r.ok, bad);
    assert.ok(r.errors.form);
  }
  const tooMany = Array.from({ length: 43 }, (_, i) => ({ weekday: i % 7, start: '00:00', end: '00:15' }));
  assert.ok(!week(tooMany).ok);
  assert.ok(week([]).ok, 'an empty week (closed every day) is allowed');
});

test('clock labels and 15-minute options', () => {
  assert.equal(TIME_OPTIONS.length, 97);
  assert.equal(TIME_OPTIONS[0]!.value, '00:00');
  assert.equal(TIME_OPTIONS.at(-1)!.value, '24:00');
  assert.equal(formatClock('00:00'), '12:00 AM');
  assert.equal(formatClock('12:30'), '12:30 PM');
  assert.equal(formatClock('17:45:00'), '5:45 PM');
  assert.equal(formatClock('24:00'), 'Midnight');
});

const off = (f: Record<string, string>) => timeOffSchema.safeParse(f);

test('blocked time: all day, single or multi-day', () => {
  const one = off({ startDate: '2026-11-26', endDate: '', allDay: 'on' });
  assert.ok(one.success);
  assert.deepEqual(one.data, { startDate: '2026-11-26', endDate: '2026-11-26', startTime: null, endTime: null, label: null });
  const multi = off({ startDate: '2026-12-24', endDate: '2026-12-26', allDay: 'on', label: ' Holidays ' });
  assert.ok(multi.success);
  assert.equal(multi.data.endDate, '2026-12-26');
  assert.equal(multi.data.label, 'Holidays');
});

test('blocked time: timed periods need both times and must end after they start', () => {
  const ok = off({ startDate: '2026-11-10', endDate: '', startTime: '12:00', endTime: '13:30' });
  assert.ok(ok.success);
  assert.deepEqual([ok.data.startTime, ok.data.endTime], ['12:00', '13:30']);
  assert.ok(off({ startDate: '2026-11-10', endDate: '', startTime: '18:00', endTime: '24:00' }).success, 'until midnight');
  assert.ok(off({ startDate: '2026-11-10', endDate: '2026-11-11', startTime: '18:00', endTime: '08:00' }).success, 'overnight across two dates');

  const backwards = off({ startDate: '2026-11-10', endDate: '', startTime: '14:00', endTime: '13:00' });
  assert.ok(!backwards.success);
  assert.equal(backwards.error.issues[0]!.path[0], 'endTime');
  const missing = off({ startDate: '2026-11-10', endDate: '', startTime: '14:00', endTime: '' });
  assert.ok(!missing.success);
  assert.equal(missing.error.issues[0]!.path[0], 'endTime');
});

test('blocked time: dates are validated', () => {
  assert.ok(!off({ startDate: '', endDate: '', allDay: 'on' }).success);
  const before = off({ startDate: '2026-11-10', endDate: '2026-11-09', allDay: 'on' });
  assert.ok(!before.success);
  assert.equal(before.error.issues[0]!.path[0], 'endDate');
  assert.ok(!off({ startDate: '2026-11-10', endDate: '', allDay: 'on', label: 'x'.repeat(81) }).success);
});

const rules = { minNoticeMin: '120', horizonDays: '60', bufferMin: '30', slotIntervalMin: '30', maxJobsPerDay: '', cancelCutoffHours: '24' };

test('booking rules parse to integers, blank daily cap = no limit', () => {
  const r = bookingRulesSchema.safeParse(rules);
  assert.ok(r.success);
  assert.deepEqual(r.data, { minNoticeMin: 120, horizonDays: 60, bufferMin: 30, slotIntervalMin: 30, maxJobsPerDay: null, cancelCutoffHours: 24 });
  assert.equal(bookingRulesSchema.parse({ ...rules, maxJobsPerDay: '3' }).maxJobsPerDay, 3);
});

test('booking rules outside the database limits are rejected', () => {
  const bad: [keyof typeof rules, string][] = [
    ['horizonDays', '0'], ['horizonDays', '366'], ['bufferMin', '-5'], ['bufferMin', '241'],
    ['slotIntervalMin', '10'], ['maxJobsPerDay', '0'], ['maxJobsPerDay', '51'], ['cancelCutoffHours', '169'],
    ['minNoticeMin', '20161'], ['bufferMin', '1.5'], ['horizonDays', 'abc'],
  ];
  for (const [k, v] of bad) assert.ok(!bookingRulesSchema.safeParse({ ...rules, [k]: v }).success, `${k}=${v}`);
});
