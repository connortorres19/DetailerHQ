import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import pg from 'pg';
import { US_TIMEZONES, formatPhone, onboardingSchema, slugify, slugSchema, toE164 } from '../../src/domain/business.ts';
import { safeNext } from '../../src/domain/auth.ts';

test('phone numbers normalise to E.164 and back', () => {
  assert.equal(toE164('(512) 555-0142'), '+15125550142');
  assert.equal(toE164('1-512-555-0142'), '+15125550142');
  assert.equal(toE164('+1 512 555 0142'), '+15125550142');
  assert.equal(toE164('555-0142'), null);
  assert.equal(toE164('(012) 555-0142'), null); // area codes can't start with 0/1
  assert.equal(formatPhone('+15125550142'), '(512) 555-0142');
});

test('slugs follow the database rules', () => {
  assert.equal(slugify('Northside Detail Co.'), 'northside-detail-co');
  assert.equal(slugify('Ridgeway & Sons — Mobile Détailing'), 'ridgeway-and-sons-mobile-detailing');
  assert.ok(slugSchema.safeParse('clearcoat-studio').success);
  for (const bad of ['ab', '-start', 'end-', 'Has Space', 'admin', 'sign-in', 'x'.repeat(41)]) {
    assert.ok(!slugSchema.safeParse(bad).success, bad);
  }
});

test('onboarding: mobile is always capacity 1; shops need 1–20', () => {
  const base = { name: 'A', slug: 'abc', timezone: 'America/Chicago', phone: '', email: '' };
  const mobile = onboardingSchema.safeParse({ ...base, serviceMode: 'mobile', capacity: '9' });
  assert.ok(mobile.success && mobile.data.capacity === 1);
  assert.ok(!onboardingSchema.safeParse({ ...base, serviceMode: 'shop' }).success);
  assert.ok(!onboardingSchema.safeParse({ ...base, serviceMode: 'shop', capacity: '21' }).success);
  const shop = onboardingSchema.safeParse({ ...base, serviceMode: 'both', capacity: '3' });
  assert.ok(shop.success && shop.data.capacity === 3);
});

test('only same-site paths are followed after sign-in', () => {
  assert.equal(safeNext('/app/customers'), '/app/customers');
  for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example', '', null, 42]) {
    assert.equal(safeNext(bad), '/app');
  }
});

test('the time zone list matches app.is_us_timezone() exactly', async () => {
  const { DB_URL } = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    for (const { value } of US_TIMEZONES) {
      const { rows } = await client.query('select app.is_us_timezone($1) as ok', [value]);
      assert.equal(rows[0].ok, true, value);
    }
    const { rows } = await client.query(
      `select count(*)::int as n from unnest(array[${US_TIMEZONES.map((_, i) => `$${i + 1}`).join(',')}]) tz`,
      US_TIMEZONES.map((t) => t.value),
    );
    assert.equal(rows[0].n, 29); // the database list has 29 zones
    assert.equal(new Set(US_TIMEZONES.map((t) => t.value)).size, 29);
  } finally {
    await client.end();
  }
});

test('local days and weeks follow the business time zone, including DST changes', async () => {
  const { dayRange, weekRange, localMidnight } = await import('../../src/domain/time.ts');
  // 2026-11-01 is the fall-back Sunday in the US: that local day is 25 hours long in Chicago.
  const fallBack = dayRange('America/Chicago', new Date('2026-11-01T18:00:00Z'));
  assert.equal(fallBack.start.toISOString(), '2026-11-01T05:00:00.000Z');
  assert.equal(fallBack.end.toISOString(), '2026-11-02T06:00:00.000Z');
  // Late evening locally is still "today" there even though it's tomorrow in UTC.
  const evening = dayRange('America/Los_Angeles', new Date('2026-10-31T06:30:00Z')); // Oct 30, 23:30 PDT
  assert.equal(evening.start.toISOString(), '2026-10-30T07:00:00.000Z');
  // Phoenix has no DST.
  assert.equal(localMidnight('America/Phoenix', 2026, 7, 1).toISOString(), '2026-07-01T07:00:00.000Z');
  // Weeks start on Sunday: Thu Nov 5 2026 → Sun Nov 1 .. Sun Nov 8 (Chicago).
  const week = weekRange('America/Chicago', new Date('2026-11-05T15:00:00Z'));
  assert.equal(week.start.toISOString(), '2026-11-01T05:00:00.000Z');
  assert.equal(week.end.toISOString(), '2026-11-08T06:00:00.000Z');
});
