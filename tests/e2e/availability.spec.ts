import { expect, test, type Browser, type Page } from '@playwright/test';
import { cleanup, db } from './support';
import { ownerWithBusiness } from './support-app';

test.afterAll(cleanup);

// Owners onboard in America/Chicago (support-app).
async function hours(businessId: string) {
  const { rows } = await db.query(
    `select weekday, to_char(start_time, 'HH24:MI') as start, case when end_time = '24:00' then '24:00' else to_char(end_time, 'HH24:MI') end as end
       from public.availability_rules where business_id = $1 order by weekday, start_time`,
    [businessId],
  );
  return rows.map((r) => `${r.weekday} ${r.start}-${r.end}`);
}

async function blocks(businessId: string) {
  const { rows } = await db.query(
    `select label, all_day, extract(epoch from upper(during) - lower(during)) / 3600 as hours,
            to_char(lower(during) at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as start_utc
       from public.time_off where business_id = $1 order by lower(during)`,
    [businessId],
  );
  return rows.map((r) => ({ ...r, hours: Number(r.hours) }));
}

const day = (page: Page, name: string) => page.getByRole('listitem', { name, exact: true });

async function openAvailability(page: Page) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Availability' }).click();
  await expect(page).toHaveURL(/\/app\/availability$/);
  await expect(page.getByText('All times are in Central Time.')).toBeVisible();
}

test('weekly hours: several windows per day, lunch breaks, copy, and overlaps refused', async ({ page }) => {
  const { businessId } = await ownerWithBusiness(page, 'hours');
  await openAvailability(page);
  for (const name of ['Monday', 'Saturday', 'Sunday']) await expect(day(page, name)).toContainText('Closed');

  // Monday 8–12 and 1–5 (lunch break), copied to Tue–Fri; Saturday 9–2.
  const mon = day(page, 'Monday');
  await mon.getByRole('checkbox', { name: 'Monday' }).check();
  await page.getByLabel('Monday window 1 start').selectOption('08:00');
  await page.getByLabel('Monday window 1 end').selectOption('12:00');
  await mon.getByRole('button', { name: 'Add window' }).click();
  await page.getByLabel('Monday window 2 start').selectOption('13:00');
  await page.getByLabel('Monday window 2 end').selectOption('17:00');
  await mon.getByRole('button', { name: 'Copy to Tue–Fri' }).click();
  await expect(page.getByLabel('Friday window 2 start')).toHaveValue('13:00');
  await day(page, 'Saturday').getByRole('checkbox', { name: 'Saturday' }).check();
  await page.getByLabel('Saturday window 1 start').selectOption('09:00');
  await page.getByLabel('Saturday window 1 end').selectOption('14:00');
  await page.getByRole('button', { name: 'Save hours' }).click();
  await expect(page.getByText('Working hours saved.')).toBeVisible();

  const week = [1, 2, 3, 4, 5].flatMap((d) => [`${d} 08:00-12:00`, `${d} 13:00-17:00`]).concat('6 09:00-14:00');
  expect(await hours(businessId)).toEqual(week);

  // Overlapping windows on Wednesday: refused, nothing saved.
  await page.getByLabel('Wednesday window 2 start').selectOption('11:00');
  await page.getByRole('button', { name: 'Save hours' }).click();
  await expect(day(page, 'Wednesday')).toContainText('Wednesday: windows overlap.');
  expect(await hours(businessId)).toEqual(week);

  // Ending before starting: refused.
  await page.getByLabel('Wednesday window 2 start').selectOption('13:00');
  await page.getByRole('checkbox', { name: 'Sunday' }).check();
  await page.getByLabel('Sunday window 1 start').selectOption('18:00');
  await page.getByLabel('Sunday window 1 end').selectOption('10:00');
  await page.getByRole('button', { name: 'Save hours' }).click();
  await expect(day(page, 'Sunday')).toContainText('Sunday: each window must end after it starts.');
  expect(await hours(businessId)).toEqual(week);

  // Until midnight is allowed; removing a window and closing a day save too. Reload shows the saved week.
  await page.getByLabel('Sunday window 1 end').selectOption('24:00');
  await page.getByRole('button', { name: 'Remove Saturday window 1' }).click();
  await expect(day(page, 'Saturday')).toContainText('Closed');
  await page.getByRole('button', { name: 'Save hours' }).click();
  await expect(page.getByText('Working hours saved.')).toBeVisible();
  const saved = [1, 2, 3, 4, 5].flatMap((d) => [`${d} 08:00-12:00`, `${d} 13:00-17:00`]);
  expect(await hours(businessId)).toEqual(['0 18:00-24:00', ...saved]);
  await page.reload();
  await expect(page.getByLabel('Sunday window 1 end')).toHaveValue('24:00');
  await expect(page.getByLabel('Thursday window 2 end')).toHaveValue('17:00');
  await expect(day(page, 'Saturday')).toContainText('Closed');

  // Today checklist picks it up.
  await page.goto('/app');
  await expect(page.getByRole('region', { name: 'Setup checklist' }).getByRole('listitem').filter({ hasText: 'Set your working hours' })).toContainText('(done)');
});

test('blocked dates and times are stored in the business time zone, across DST', async ({ page }) => {
  const { businessId } = await ownerWithBusiness(page, 'blocked');
  await openAvailability(page);
  const panel = page.getByRole('region', { name: 'Blocked dates and times' });
  const items = panel.getByRole('listitem');
  await expect(panel.getByText('Nothing blocked')).toBeVisible();
  // Each submit adds a row; waiting on the count (not the notice, which stays up) avoids racing the form reset.
  let count = 0;
  const submit = async () => {
    await page.getByRole('button', { name: 'Block time' }).click();
    await expect(items).toHaveCount(++count);
    await expect(page.getByText('Time blocked.')).toBeVisible();
  };

  // All day Sun Nov 1 2026: clocks fall back, so the local day is 25 hours.
  await page.getByLabel('From', { exact: true }).fill('2026-11-01');
  await page.getByLabel('Note (optional)').fill('Fall back');
  await submit();
  await expect(page.getByLabel('Note (optional)')).toHaveValue(''); // form cleared for the next block

  // Sun Mar 14 2027: spring forward, a 23-hour day.
  await page.getByLabel('From', { exact: true }).fill('2027-03-14');
  await submit();

  // Dec 24–26: three local days.
  await page.getByLabel('From', { exact: true }).fill('2026-12-24');
  await page.getByLabel('To', { exact: true }).fill('2026-12-26');
  await page.getByLabel('Note (optional)').fill('Holidays');
  await submit();

  // Timed: Tue Nov 10 12:00–1:30 PM (CST after the change → 18:00 UTC). Validation first.
  await page.getByLabel('From', { exact: true }).fill('2026-11-10');
  await page.getByLabel('All day', { exact: true }).uncheck();
  await page.getByLabel('Start time', { exact: true }).selectOption('14:00');
  await page.getByLabel('End time', { exact: true }).selectOption('13:00');
  await page.getByRole('button', { name: 'Block time' }).click();
  await expect(page.getByText('The end time must be after the start time.')).toBeVisible();
  await page.getByLabel('Start time', { exact: true }).selectOption('12:00');
  await page.getByLabel('End time', { exact: true }).selectOption('13:30');
  await page.getByLabel('Note (optional)').fill('Dentist');
  await submit();

  // Mon Nov 2 9–11 AM.
  await page.getByLabel('From', { exact: true }).fill('2026-11-02');
  await page.getByLabel('All day', { exact: true }).uncheck();
  await page.getByLabel('Start time', { exact: true }).selectOption('09:00');
  await page.getByLabel('End time', { exact: true }).selectOption('11:00');
  await submit();

  expect(await blocks(businessId)).toEqual([
    { label: 'Fall back', all_day: true, hours: 25, start_utc: '2026-11-01 05:00' },
    { label: null, all_day: false, hours: 2, start_utc: '2026-11-02 15:00' },
    { label: 'Dentist', all_day: false, hours: 1.5, start_utc: '2026-11-10 18:00' },
    { label: 'Holidays', all_day: true, hours: 72, start_utc: '2026-12-24 06:00' },
    { label: null, all_day: true, hours: 23, start_utc: '2027-03-14 06:00' },
  ]);

  // Listed in local time, soonest first.
  await expect(items).toHaveText([
    /Sun, Nov 1, 2026 · all day\s*Fall back/,
    /Mon, Nov 2, 2026 · 9:00 AM – 11:00 AM/,
    /Tue, Nov 10, 2026 · 12:00 PM – 1:30 PM\s*Dentist/,
    /Thu, Dec 24, 2026 – Sat, Dec 26, 2026 · all day\s*Holidays/,
    /Sun, Mar 14, 2027 · all day/,
  ].map((r) => new RegExp(`^${r.source}`)));

  // The booking check honours blocked time. The fixed dates above are in the past once they pass
  // (the booking check refuses past times as "too soon"), so this uses the next Monday at least two
  // days away — always bookable under the default 24-hour notice and 60-day horizon. 9–11 is blocked
  // through the same form, then the check runs with 9–5 hours that day.
  const { rows: [next] } = await db.query(
    `select to_char(d, 'YYYY-MM-DD') as day, to_char((d + time '09:00') at time zone 'America/Chicago' at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as start_utc
       from (select (now() at time zone 'America/Chicago')::date + n as d from generate_series(2, 8) n) x
      where extract(dow from d) = 1 order by d limit 1`,
  );
  await page.getByLabel('From', { exact: true }).fill(next.day);
  await page.getByLabel('All day', { exact: true }).uncheck();
  await page.getByLabel('Start time', { exact: true }).selectOption('09:00');
  await page.getByLabel('End time', { exact: true }).selectOption('11:00');
  await page.getByLabel('Note (optional)').fill('Booking check');
  await submit();
  expect((await blocks(businessId)).find((b) => b.label === 'Booking check')).toEqual({ label: 'Booking check', all_day: false, hours: 2, start_utc: next.start_utc });
  await db.query(`insert into public.availability_rules (business_id, weekday, start_time, end_time) values ($1, 1, '09:00', '17:00')`, [businessId]);
  const check = (start: string) =>
    db
      .query(`select app.check_public_time(b, $2::timestamptz, $2::timestamptz + interval '1 hour') from public.businesses b where id = $1`, [businessId, start])
      .then(() => 'ok', (e: { detail?: string }) => e.detail);
  expect(await check(`${next.day} 10:00 America/Chicago`)).toBe('time off');
  expect(await check(`${next.day} 11:00 America/Chicago`)).toBe('ok');

  // Remove one.
  const dentist = items.filter({ hasText: 'Dentist' });
  await dentist.getByRole('button', { name: 'Remove' }).click();
  await dentist.getByRole('button', { name: 'Remove blocked time' }).click();
  await expect(page.getByText('Blocked time removed.')).toBeVisible();
  await expect(items).toHaveCount(5);
  expect((await blocks(businessId)).map((b) => b.label)).not.toContain('Dentist');
});

test('booking rules are saved and validated', async ({ page }) => {
  const { businessId } = await ownerWithBusiness(page, 'rules');
  await openAvailability(page);
  await page.getByLabel('Minimum notice').selectOption('1440');
  await page.getByLabel('Booking window (days ahead)').fill('400');
  await page.getByLabel('Buffer between jobs (minutes)').fill('45');
  await page.getByLabel('Start times offered').selectOption('30');
  await page.getByLabel('Most jobs per day (optional)').fill('0');
  await page.getByLabel('Customers can cancel until (hours before)').fill('48');
  await page.getByRole('button', { name: 'Save booking rules' }).click();
  await expect(page.getByText('Enter a number of days from 1 to 365.')).toBeVisible();
  await expect(page.getByText('Enter a number from 1 to 50, or leave blank for no limit.')).toBeVisible();
  await expect(page.getByLabel('Buffer between jobs (minutes)')).toHaveValue('45'); // kept what was typed
  await expect(page.getByLabel('Start times offered')).toHaveValue('30'); // selects too

  await page.getByLabel('Booking window (days ahead)').fill('90');
  await page.getByLabel('Most jobs per day (optional)').fill('3');
  await page.getByRole('button', { name: 'Save booking rules' }).click();
  await expect(page.getByText('Booking rules saved.')).toBeVisible();
  const { rows } = await db.query(
    'select min_notice_min, horizon_days, buffer_min, slot_interval_min, max_jobs_per_day, cancel_cutoff_hours from public.booking_settings where business_id = $1',
    [businessId],
  );
  expect(rows[0]).toEqual({ min_notice_min: 1440, horizon_days: 90, buffer_min: 45, slot_interval_min: 30, max_jobs_per_day: 3, cancel_cutoff_hours: 48 });

  await page.reload();
  await expect(page.getByLabel('Minimum notice')).toHaveValue('1440');
  await expect(page.getByLabel('Most jobs per day (optional)')).toHaveValue('3');
  await page.getByLabel('Most jobs per day (optional)').fill('');
  await page.getByRole('button', { name: 'Save booking rules' }).click();
  await expect(page.getByText('Booking rules saved.')).toBeVisible();
  expect((await db.query('select max_jobs_per_day from public.booking_settings where business_id = $1', [businessId])).rows[0].max_jobs_per_day).toBeNull();
});

test('instant booking needs services and working hours first', async ({ page }) => {
  const { businessId } = await ownerWithBusiness(page, 'mode');
  await page.goto('/app/settings');
  const instant = page.getByRole('radio', { name: /Instant booking/ });
  await expect(page.getByRole('radio', { name: /Approval required/ })).toBeChecked();

  await instant.check();
  await page.getByRole('button', { name: 'Save booking mode' }).click();
  await expect(page.getByText('Instant booking needs at least one service customers can book online')).toBeVisible();

  // A quote-only service doesn't count; a bookable fixed-price one does.
  await db.query(
    `insert into public.services (business_id, name, price_type, base_duration_min, is_bookable) values ($1, 'Ceramic coating', 'quote_required', 480, false)`,
    [businessId],
  );
  await instant.check();
  await page.getByRole('button', { name: 'Save booking mode' }).click();
  await expect(page.getByText('Instant booking needs at least one service customers can book online')).toBeVisible();
  await db.query(
    `insert into public.services (business_id, name, price_type, base_price_cents, base_duration_min, is_bookable) values ($1, 'Full detail', 'fixed', 26000, 240, true)`,
    [businessId],
  );
  await instant.check();
  await page.getByRole('button', { name: 'Save booking mode' }).click();
  await expect(page.getByText('Instant booking needs your working hours.')).toBeVisible();

  await page.goto('/app/availability');
  await page.getByRole('checkbox', { name: 'Monday' }).check();
  await page.getByRole('button', { name: 'Save hours' }).click();
  await expect(page.getByText('Working hours saved.')).toBeVisible();

  await page.goto('/app/settings');
  await page.getByRole('radio', { name: /Instant booking/ }).check();
  await page.getByRole('button', { name: 'Save booking mode' }).click();
  await expect(page.getByText('Instant booking is on.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: /Instant booking/ })).toBeChecked();
  expect((await db.query('select booking_mode from public.booking_settings where business_id = $1', [businessId])).rows[0].booking_mode).toBe('instant');

  await page.getByRole('radio', { name: /Approval required/ }).check();
  await page.getByRole('button', { name: 'Save booking mode' }).click();
  await expect(page.getByText('Approval required is on.')).toBeVisible();
  expect((await db.query('select booking_mode from public.booking_settings where business_id = $1', [businessId])).rows[0].booking_mode).toBe('approval');
});

test.describe('cross-business isolation', () => {
  test.describe.configure({ mode: 'serial' });
  let pageA: Page;
  let pageB: Page;
  const a = { businessId: '', timeOffId: '' };
  const b = { businessId: '', timeOffId: '' };

  async function owner(browser: Browser, tag: string, into: typeof a) {
    const page = await (await browser.newContext()).newPage();
    const { businessId } = await ownerWithBusiness(page, tag);
    into.businessId = businessId;
    await db.query(`insert into public.availability_rules (business_id, weekday, start_time, end_time) values ($1, 1, '09:00', '17:00')`, [businessId]);
    const { rows } = await db.query(
      `insert into public.time_off (business_id, during, label) values ($1, tstzrange('2026-12-01 15:00+00', '2026-12-01 17:00+00'), $2) returning id`,
      [businessId, `${tag} block`],
    );
    into.timeOffId = rows[0].id;
    return page;
  }

  test.beforeAll(async ({ browser }) => {
    pageA = await owner(browser, 'isoA', a);
    pageB = await owner(browser, 'isoB', b);
  });

  test('B sees only its own hours and blocks', async () => {
    await pageB.goto('/app/availability');
    await expect(pageB.getByText('isoB block')).toBeVisible();
    await expect(pageB.getByText('isoA block')).toHaveCount(0);
  });

  test('B removing A’s block (tampered id) is refused; A unchanged', async () => {
    await pageB.goto('/app/availability');
    let done = false;
    await pageB.route('**/app/availability**', async (route) => {
      const req = route.request();
      if (done || req.method() !== 'POST' || !req.headers()['next-action']) return route.continue();
      done = true;
      const body = (req.postData() ?? '').replaceAll(b.timeOffId, a.timeOffId);
      expect(body).toContain(a.timeOffId);
      return route.continue({ postData: body });
    });
    const item = pageB.getByRole('listitem').filter({ hasText: 'isoB block' });
    await item.getByRole('button', { name: 'Remove' }).click();
    await item.getByRole('button', { name: 'Remove blocked time' }).click();
    await expect(pageB.getByText('We couldn’t find that blocked time.')).toBeVisible();
    const { rows } = await db.query('select count(*)::int as n from public.time_off where id = any($1)', [[a.timeOffId, b.timeOffId]]);
    expect(rows[0].n).toBe(2);
  });

  test('B saving hours or rules never touches A', async () => {
    await pageB.goto('/app/availability');
    await pageB.getByRole('checkbox', { name: 'Tuesday' }).check();
    await pageB.getByRole('button', { name: 'Save hours' }).click();
    await expect(pageB.getByText('Working hours saved.')).toBeVisible();
    await pageB.getByLabel('Buffer between jobs (minutes)').fill('90');
    await pageB.getByRole('button', { name: 'Save booking rules' }).click();
    await expect(pageB.getByText('Booking rules saved.')).toBeVisible();

    expect(await hours(a.businessId)).toEqual(['1 09:00-17:00']);
    expect(await hours(b.businessId)).toEqual(['1 09:00-17:00', '2 09:00-17:00']);
    const { rows } = await db.query('select business_id, buffer_min from public.booking_settings where business_id = any($1) order by buffer_min', [[a.businessId, b.businessId]]);
    expect(rows).toEqual([{ business_id: a.businessId, buffer_min: 30 }, { business_id: b.businessId, buffer_min: 90 }]);
  });

  test('A sees its own data after all that', async () => {
    await pageA.goto('/app/availability');
    await expect(pageA.getByText('isoA block')).toBeVisible();
    await expect(pageA.getByText('isoB block')).toHaveCount(0);
    await expect(pageA.getByLabel('Monday window 1 start')).toHaveValue('09:00');
  });
});

for (const [width, height] of [[1280, 800], [390, 844]] as const) {
  test(`availability page at ${width}px has no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await ownerWithBusiness(page, `avail${width}`);
    await page.goto('/app/availability');
    await page.getByRole('checkbox', { name: 'Monday' }).check();
    await page.getByRole('button', { name: 'Add window' }).first().click();
    await expect(page.getByLabel('Monday window 2 start')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    await page.screenshot({ path: `test-results/availability-${width}.png`, fullPage: true });
  });
}
