import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centsToInput, durationSummary, formatDuration, parseMoney, parseServiceForm, priceSummary } from '../../src/domain/service.ts';

const SMALL = '11111111-1111-4111-8111-111111111111';
const LARGE = '22222222-2222-4222-8222-222222222222';

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
const base = { name: 'Full detail package', description: '', categoryId: '', priceType: 'fixed', basePrice: '180', baseHours: '2', baseMinutes: '30' };

test('money parses to integer cents and rejects anything ambiguous', () => {
  assert.equal(parseMoney('180'), 18000);
  assert.equal(parseMoney('$180.5'), 18050);
  assert.equal(parseMoney('1,250.00'), 125000);
  assert.equal(parseMoney('0'), 0);
  for (const bad of ['', '-5', '12.345', 'abc', '1e3', '100001', '18 0']) assert.equal(parseMoney(bad), null, bad);
  assert.equal(centsToInput(18050), '180.50');
  assert.equal(centsToInput(18000), '180');
});

test('durations format and validate in 15-minute steps within the database range', () => {
  assert.equal(formatDuration(150), '2h 30m');
  assert.equal(formatDuration(45), '45m');
  for (const [h, m] of [['0', '0'], ['0', '10'], ['73', '0'], ['72', '15']]) {
    const r = parseServiceForm(form({ ...base, baseHours: h, baseMinutes: m }), []);
    assert.ok(!r.ok && r.fieldErrors.baseDuration, `${h}h ${m}m`);
  }
  const r = parseServiceForm(form({ ...base, baseHours: '72', baseMinutes: '0' }), []);
  assert.ok(r.ok && r.data.baseDurationMin === 4320);
});

test('size grid: blank cells fall back to base; values become override rows; unknown sizes are rejected', () => {
  const r = parseServiceForm(
    form({ ...base, [`size.${SMALL}.price`]: '', [`size.${LARGE}.price`]: '260', [`size.${LARGE}.hours`]: '4', [`size.${LARGE}.minutes`]: '0' }),
    [SMALL, LARGE],
  );
  assert.ok(r.ok);
  assert.deepEqual(r.data.sizes, [{ sizeClassId: LARGE, priceCents: 26000, durationMin: 240 }]);
  assert.equal(r.data.basePriceCents, 18000);
  assert.equal(r.data.baseDurationMin, 150);

  const priceOnly = parseServiceForm(form({ ...base, [`size.${SMALL}.price`]: '150' }), [SMALL, LARGE]);
  assert.ok(priceOnly.ok && priceOnly.data.sizes[0]!.durationMin === null);

  const foreign = parseServiceForm(form({ ...base, 'size.33333333-3333-4333-8333-333333333333.price': '1' }), [SMALL]);
  assert.ok(!foreign.ok && foreign.fieldErrors.sizes === 'Unknown vehicle size.');

  const badCell = parseServiceForm(form({ ...base, [`size.${SMALL}.price`]: '-1', [`size.${LARGE}.hours`]: '0', [`size.${LARGE}.minutes`]: '5' }), [SMALL, LARGE]);
  assert.ok(!badCell.ok && badCell.fieldErrors[`size.${SMALL}.price`] && badCell.fieldErrors[`size.${LARGE}.duration`]);
});

test('price rules: fixed needs a price; quote-required stores none and can never be bookable', () => {
  const missing = parseServiceForm(form({ ...base, basePrice: '' }), []);
  assert.ok(!missing.ok && missing.fieldErrors.basePrice === 'Enter a price.');

  const quote = parseServiceForm(form({ ...base, priceType: 'quote_required', basePrice: '999', [`size.${SMALL}.price`]: '50', [`size.${SMALL}.hours`]: '6', [`size.${SMALL}.minutes`]: '0' }), [SMALL]);
  assert.ok(quote.ok);
  assert.equal(quote.data.basePriceCents, null);
  assert.deepEqual(quote.data.sizes, [{ sizeClassId: SMALL, priceCents: null, durationMin: 360 }]); // durations only

  const bookableQuote = parseServiceForm(form({ ...base, priceType: 'quote_required', isBookable: 'on' }), []);
  assert.ok(!bookableQuote.ok && /can’t be booked online/.test(bookableQuote.fieldErrors.isBookable!));

  const addon = parseServiceForm(form({ ...base, isAddon: 'on', isBookable: 'on', priceType: 'starting_at' }), []);
  assert.ok(addon.ok && addon.data.isAddon && addon.data.isBookable && addon.data.priceType === 'starting_at');

  const badType = parseServiceForm(form({ ...base, priceType: 'free' }), []);
  assert.ok(!badType.ok && badType.fieldErrors.priceType);
});

test('list summaries match how the database prices a booking', () => {
  assert.equal(priceSummary({ price_type: 'fixed', base_price_cents: 18000 }, []), '$180');
  assert.equal(priceSummary({ price_type: 'fixed', base_price_cents: 18000 }, [15000, 26000, null]), '$150–$260');
  assert.equal(priceSummary({ price_type: 'starting_at', base_price_cents: 45000 }, [52500]), 'From $450');
  assert.equal(priceSummary({ price_type: 'quote_required', base_price_cents: null }, []), 'Quote required');
  assert.equal(priceSummary({ price_type: 'fixed', base_price_cents: 6550 }, []), '$65.50');
  assert.equal(durationSummary(150, [null, 240]), '2h 30m–4h');
});
