import { expect, test, type Page } from '@playwright/test';
import { cleanup, db } from './support';
import { asVisitor, bookableBusiness, fillDetails, ipHash, pickFirstTime } from './support-booking';

test.afterAll(cleanup);

const requests = async (businessId: string) =>
  (
    await db.query(
      `select r.status, r.estimated_total_cents, r.estimated_duration_min, r.estimate_is_minimum, r.customer_id is not null as has_customer,
              r.contact_first_name, r.contact_phone_e164, r.vehicle_make, r.service_city,
              (select count(*)::int from public.appointments a where a.booking_request_id = r.id) as appointments,
              (select array_agg(i.name || ':' || i.price_cents order by i.is_addon, i.name) from public.booking_request_items i where i.booking_request_id = r.id) as items
         from public.booking_requests r where r.business_id = $1 order by r.created_at`,
      [businessId],
    )
  ).rows;

async function choose(page: Page, size: string, service: string, addons: string[] = []) {
  await page.getByRole('radio', { name: new RegExp(`^${size}`) }).check();
  await page.getByRole('radio', { name: new RegExp(`^${service}`) }).check();
  for (const a of addons) await page.getByRole('checkbox', { name: new RegExp(`^${a}`) }).check();
}

test('publishing: offline pages are unavailable, the owner previews and puts the page live', async ({ page, browser }) => {
  const biz = await bookableBusiness(page, 'publish', { published: false });
  const visitor = await (await browser.newContext()).newPage();
  const res = await visitor.goto(`/book/${biz.slug}`);
  expect(res?.status()).toBe(404);
  await expect(visitor.getByRole('heading', { name: 'This booking page isn’t available' })).toBeVisible();
  await expect(visitor.getByText('Northside Detail Co.')).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Booking page' }).click();
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
  await expect(page.getByText(`/book/${biz.slug}`)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Before going live' })).toContainText('Set your working hours(done)');
  await page.screenshot({ path: 'test-results/owner-booking-page.png', fullPage: true });

  // Preview works while offline and shows real times, but can't submit.
  await page.getByRole('link', { name: 'Preview' }).click();
  await expect(page).toHaveURL(`/book/${biz.slug}/preview`);
  await expect(page.getByText('your page is offline; customers can’t see it yet')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Northside Detail Co.' })).toBeVisible();
  await choose(page, 'Car', 'Full detail');
  await pickFirstTime(page);
  // Another visitor can't use the owner's preview URL.
  expect((await visitor.goto(`/book/${biz.slug}/preview`))?.status()).toBe(404);

  await page.goto('/app/booking-page');
  await page.getByRole('button', { name: 'Put booking page live' }).click();
  await expect(page.getByText('Your booking page is live.')).toBeVisible();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  expect((await visitor.goto(`/book/${biz.slug}`))?.status()).toBe(200);
  await expect(visitor.getByRole('heading', { name: 'Northside Detail Co.' })).toBeVisible();
  await expect(visitor.getByText('Hand-washed, never rushed.')).toBeVisible();

  // The owner's wording and the online-cancellation switch reach the public page.
  await page.getByLabel('About your business').fill('Family-run since 2015. We bring water and power.');
  await page.getByLabel('Customers can cancel online with their booking link').uncheck();
  await page.getByLabel('About your business').press('Tab');
  await page.getByRole('button', { name: 'Save booking page details' }).click();
  await expect(page.getByText('Booking page details saved.')).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByText('Family-run since 2015. We bring water and power.')).toBeVisible();
  await expect(visitor.getByText('To cancel, contact Northside Detail Co. directly.')).toBeVisible();
  await page.getByLabel('About your business').fill('x'.repeat(301));
  expect(await page.getByLabel('About your business').inputValue()).toHaveLength(300); // browser limit; server limit in unit tests

  await page.getByRole('button', { name: 'Take offline' }).click();
  await expect(page.getByText('Your booking page is offline.')).toBeVisible();
  expect((await visitor.goto(`/book/${biz.slug}`))?.status()).toBe(404);
});

test('approval required: a request with size pricing and an add-on is sent, pending, not confirmed', async ({ page, browser }) => {
  const biz = await bookableBusiness(page, 'approval');
  const visitor = await (await browser.newContext()).newPage();
  await asVisitor(visitor);
  await visitor.goto(`/book/${biz.slug}`);
  await expect(visitor.getByText('No account needed')).toBeVisible();
  await expect(visitor.getByText('Every booking is a request')).toBeVisible();

  // Menu: grouped by category, prices by size, quote-only service listed but not selectable.
  await expect(visitor.getByRole('heading', { name: 'Detailing packages' })).toBeVisible();
  const ceramic = visitor.getByRole('listitem').filter({ hasText: 'Ceramic coating' });
  await expect(ceramic).toContainText('Quote required');
  await expect(ceramic).toContainText('not bookable online');
  await expect(ceramic.getByRole('radio')).toHaveCount(0);
  await expect(visitor.getByRole('listitem').filter({ hasText: 'Full detail' })).toContainText('From $180'); // range before a size
  await expect(visitor.getByRole('button', { name: 'Choose a time' })).toBeDisabled();

  await choose(visitor, 'Car', 'Full detail');
  await expect(visitor.getByRole('listitem').filter({ hasText: 'Full detail' })).toContainText('$180');
  await visitor.getByRole('radio', { name: /^Large SUV/ }).check();
  await expect(visitor.getByRole('listitem').filter({ hasText: 'Full detail' })).toContainText('$240');
  await expect(visitor.getByRole('listitem').filter({ hasText: 'Full detail' })).toContainText('about 4h');
  await visitor.getByRole('checkbox', { name: /^Pet hair removal/ }).check();
  const rail = visitor.getByRole('complementary', { name: 'Booking summary' });
  await expect(rail).toContainText('$280 · about 4h 30m');
  await expect(rail).toContainText('Full detail · Large SUV / Truck');

  await expect(visitor.getByText('Step 1 of 4 · Service')).toBeVisible();
  const time = await pickFirstTime(visitor);
  await expect(visitor.getByText('Times are in Central Time')).toBeVisible();
  await visitor.getByRole('button', { name: 'Continue' }).click();

  // Invalid customer input is caught before review; nothing is sent.
  await fillDetails(visitor, { 'Mobile phone': '12345', Email: 'not-an-email', 'ZIP code': '7870', Make: '' });
  await visitor.getByRole('button', { name: 'Review' }).click();
  await expect(visitor.getByText('Enter a 10-digit US phone number.')).toBeVisible();
  await expect(visitor.getByText('Enter a valid email address.')).toBeVisible();
  await expect(visitor.getByText('Enter a 5-digit ZIP code.')).toBeVisible();
  await expect(visitor.getByText('Enter the make, e.g. Toyota.')).toBeVisible();
  await fillDetails(visitor);
  await visitor.getByLabel('Vehicle notes (optional)').fill('Golden retriever hair in the back seats.');
  await visitor.getByRole('button', { name: 'Review' }).click();

  // Review: breakdown, estimate wording, request not confirmation, policies.
  await expect(visitor.getByText('Step 4 of 4 · Review')).toBeVisible();
  const breakdown = visitor.getByRole('table', { name: 'Price estimate' });
  await expect(breakdown.getByRole('row', { name: /Full detail/ })).toContainText('$240');
  await expect(breakdown.getByRole('row', { name: /Pet hair removal/ })).toContainText('$40');
  await expect(breakdown.getByRole('row', { name: /Estimated total/ })).toContainText('$280');
  await expect(visitor.getByText('This is a request, not a confirmed appointment.')).toBeVisible();
  await expect(visitor.getByText('No payment is taken online.').first()).toBeVisible();
  await expect(visitor.getByText(time, { exact: false }).first()).toBeVisible();

  // Consent is required (server-side check).
  await visitor.getByRole('button', { name: 'Send request' }).click();
  await expect(visitor.getByText('Please agree so the business can contact you about this booking.')).toBeVisible();
  expect(await requests(biz.businessId)).toHaveLength(0);

  await visitor.getByLabel(/may contact me/).check();
  await visitor.getByRole('button', { name: 'Send request' }).click();
  await expect(visitor).toHaveURL(/\/r\/[A-Za-z0-9_-]{43}\?new=1$/);
  await expect(visitor.getByText('Request sent to Northside Detail Co. — not confirmed yet.')).toBeVisible();
  await expect(visitor.getByRole('heading', { name: 'Request received — not confirmed yet' })).toBeVisible();
  await expect(visitor.getByText('Pending', { exact: true })).toBeVisible();
  await expect(visitor.getByText('Confirmed', { exact: true })).toHaveCount(0); // no "Confirmed" badge
  await expect(visitor.getByText('Phone ending 0142')).toBeVisible();
  await expect(visitor.getByText('Reyes')).toHaveCount(0); // masked
  await expect(visitor.getByText('1234 Oak St')).toHaveCount(0);

  // Stored as a pending request with server-computed prices; no appointment, no customer yet.
  expect(await requests(biz.businessId)).toEqual([
    {
      status: 'pending', estimated_total_cents: 28000, estimated_duration_min: 270, estimate_is_minimum: false, has_customer: false,
      contact_first_name: 'Jordan', contact_phone_e164: '+15125550142', vehicle_make: 'Tesla', service_city: 'Austin',
      appointments: 0, items: ['Full detail:24000', 'Pet hair removal:4000'],
    },
  ]);

  // Withdraw through the link.
  await visitor.getByRole('button', { name: 'Withdraw request' }).click();
  await visitor.getByRole('group', { name: 'Withdraw request' }).getByRole('button', { name: 'Withdraw request' }).click();
  await expect(visitor.getByRole('heading', { name: 'Request withdrawn' })).toBeVisible();
  await expect(visitor.getByRole('button', { name: 'Withdraw request' })).toHaveCount(0);
  expect((await requests(biz.businessId))[0].status).toBe('withdrawn');
});

async function bookThrough(page: Page, opts: { size?: string; service?: string; detailOverrides?: Record<string, string> } = {}) {
  await choose(page, opts.size ?? 'Car', opts.service ?? 'Full detail');
  const time = await pickFirstTime(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await fillDetails(page, opts.detailOverrides);
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByLabel(/may contact me/).check();
  return time;
}

test('instant booking on a phone: confirmed in one step, new customer + vehicle, duplicates flagged not merged', async ({ page, browser }) => {
  const biz = await bookableBusiness(page, 'instant', { instant: true });
  await db.query(`insert into public.customers (business_id, first_name, last_name, phone_e164, email) values ($1, 'Jordan', 'Reyes', '+15125550142', 'jordan@example.com')`, [biz.businessId]);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const visitor = await context.newPage();
  await asVisitor(visitor);
  await visitor.goto(`/book/${biz.slug}`);
  await expect(visitor.getByText('Open times are booked straight away')).toBeVisible();

  await choose(visitor, 'Car', 'Exterior wash');
  // Sticky bottom bar on phones carries the running estimate and the action.
  const bar = visitor.getByRole('complementary', { name: 'Booking summary' });
  await expect(bar).toContainText('From $60 · about 1h');
  await expect(bar).toBeInViewport();
  await pickFirstTime(visitor);
  await visitor.getByRole('button', { name: 'Continue' }).click();
  await fillDetails(visitor);
  await visitor.getByRole('button', { name: 'Review' }).click();
  await expect(visitor.getByText('“From” prices are starting prices')).toBeVisible();
  await expect(visitor.getByText('Your appointment is confirmed as soon as you book.')).toBeVisible();
  // Regression: moving to Review must not submit the form on its own.
  await expect(visitor.getByText('Check the highlighted details.')).toHaveCount(0);
  expect(await requests(biz.businessId)).toHaveLength(0);
  await visitor.getByLabel(/may contact me/).check();
  expect(await visitor.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  await visitor.screenshot({ path: 'test-results/booking-review-390.png', fullPage: true });
  await visitor.getByRole('button', { name: 'Book now' }).click();

  await expect(visitor.getByText('You’re booked with Northside Detail Co.')).toBeVisible();
  await expect(visitor.getByRole('heading', { name: 'Appointment confirmed' })).toBeVisible();
  await expect(visitor.getByText('Confirmed', { exact: true })).toBeVisible();
  expect(await visitor.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  await visitor.screenshot({ path: 'test-results/booking-confirmed-390.png', fullPage: true });

  const [r] = await requests(biz.businessId);
  expect(r).toMatchObject({ status: 'approved', appointments: 1, has_customer: true, estimate_is_minimum: true, estimated_total_cents: 6000 });
  const { rows: customers } = await db.query(
    `select c.first_name, c.last_name, c.source, (select count(*)::int from public.vehicles v where v.customer_id = c.id) as vehicles
       from public.customers c where c.business_id = $1 order by c.created_at`,
    [biz.businessId],
  );
  expect(customers).toEqual([
    { first_name: 'Jordan', last_name: 'Reyes', source: null, vehicles: 0 },
    { first_name: 'Jordan', last_name: 'Reyes', source: 'booking_page', vehicles: 1 },
  ]);

  // The owner sees both, flagged as possible duplicates — nothing merged.
  await page.goto('/app/customers');
  await expect(page.getByText('Possible duplicate')).toHaveCount(2);
  await page.getByRole('row').filter({ hasText: 'Tesla Model Y' }).getByRole('link').click();
  await expect(page.getByText('Possible duplicate:')).toBeVisible();
  await expect(page.getByText('Records are never merged automatically')).toBeVisible();
});

test('capacity conflict: a time taken while another customer is choosing is refused at submit', async ({ page, browser }) => {
  const biz = await bookableBusiness(page, 'conflict', { instant: true });
  const first = await (await browser.newContext()).newPage();
  const second = await (await browser.newContext()).newPage();
  await asVisitor(first);
  await asVisitor(second);
  await first.goto(`/book/${biz.slug}`);
  await second.goto(`/book/${biz.slug}`);

  // Both reach review with the same (first) time.
  const t1 = await bookThrough(first);
  const t2 = await bookThrough(second, { detailOverrides: { 'First name': 'Sam', 'Mobile phone': '(512) 555-0199', Email: 'sam@example.com' } });
  expect(t2).toBe(t1);

  await first.getByRole('button', { name: 'Book now' }).click();
  await expect(first.getByRole('heading', { name: 'Appointment confirmed' })).toBeVisible();

  await second.getByRole('button', { name: 'Book now' }).click();
  await expect(second.getByText('That time was just taken or is no longer available.')).toBeVisible();
  await second.getByRole('button', { name: 'Choose another time' }).click();
  await expect(second.getByText('That time was just taken. Please choose another.')).toBeVisible();
  const times = second.getByRole('radiogroup', { name: 'Start times' }).getByRole('radio');
  await expect(times.first()).toBeVisible();
  // Capacity 1 + 3 h job + 30 min buffer: the taken time (and the next hours) are gone.
  await expect(times.filter({ hasText: new RegExp(`^${t1}$`) })).toHaveCount(0);

  const rows = await requests(biz.businessId);
  expect(rows.map((x) => x.status)).toEqual(['approved']); // the refused attempt left nothing
});

test('duplicate submissions: double-clicking and retrying create one booking with one link', async ({ page, browser }) => {
  const biz = await bookableBusiness(page, 'double');
  const visitor = await (await browser.newContext()).newPage();
  await asVisitor(visitor);
  await visitor.goto(`/book/${biz.slug}`);
  await bookThrough(visitor);

  // Capture the submit and send it again after the first one succeeded (a retried connection).
  let body = '';
  let headers: Record<string, string> = {};
  await visitor.route(`**/book/${biz.slug}`, async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.headers()['next-action'] && !body) {
      body = req.postData() ?? '';
      headers = req.headers();
    }
    await route.continue();
  });
  await visitor.getByRole('button', { name: 'Send request' }).dblclick();
  await expect(visitor).toHaveURL(/\/r\/[A-Za-z0-9_-]{43}\?new=1$/);
  const link = visitor.url();
  const replay = await visitor.request.post(`/book/${biz.slug}`, { data: body, headers, maxRedirects: 0 });
  expect(replay.status()).toBeLessThan(400);
  // Server actions return their redirect in a header.
  const replayRedirect = replay.headers()['x-action-redirect']?.match(/\/r\/[A-Za-z0-9_-]{43}/)?.[0];
  expect(replayRedirect).toBeTruthy();
  expect(link).toContain(replayRedirect!); // same request → same status link

  expect(await requests(biz.businessId)).toHaveLength(1);
});

test('rate limiting: repeated failed attempts from one address are refused with a clear message', async ({ page, browser }) => {
  const biz = await bookableBusiness(page, 'ratelimit');
  const visitor = await (await browser.newContext()).newPage();
  const address = await asVisitor(visitor);
  // Ten failed submissions already recorded for this address in the last 10 minutes.
  await db.query(
    `insert into public.rate_limit_events (action, key_hash, business_id) select 'submit_failed', $1, $2 from generate_series(1, 10)`,
    [ipHash(address), biz.businessId],
  );
  await visitor.goto(`/book/${biz.slug}`);
  await bookThrough(visitor);
  await visitor.getByRole('button', { name: 'Send request' }).click();
  await expect(visitor.getByText('Too many attempts from this connection. Please wait a few minutes and try again.')).toBeVisible();
  expect(await requests(biz.businessId)).toHaveLength(0);

  // Another address is unaffected.
  const other = await (await browser.newContext()).newPage();
  await asVisitor(other);
  await other.goto(`/book/${biz.slug}`);
  await bookThrough(other);
  await other.getByRole('button', { name: 'Send request' }).click();
  await expect(other.getByRole('heading', { name: 'Request received — not confirmed yet' })).toBeVisible();
});

test('status links: unguessable, generic for wrong links, cancellation honours the cutoff', async ({ page, browser }) => {
  const biz = await bookableBusiness(page, 'status', { instant: true });
  const visitor = await (await browser.newContext()).newPage();
  await asVisitor(visitor);
  await visitor.goto(`/book/${biz.slug}`);
  await bookThrough(visitor);
  await visitor.getByRole('button', { name: 'Book now' }).click();
  await expect(visitor.getByRole('heading', { name: 'Appointment confirmed' })).toBeVisible();
  const link = new URL(visitor.url()).pathname;
  const token = link.split('/').pop()!;

  // Headers: no referrer leak, no indexing.
  const res = await visitor.request.get(link);
  expect(res.headers()['referrer-policy']).toBe('no-referrer');
  expect(res.headers()['x-robots-tag']).toContain('noindex');
  expect(res.headers()['cache-control']).toContain('no-store');

  // Wrong, altered or malformed links: the same generic 404.
  const stranger = await (await browser.newContext()).newPage();
  await asVisitor(stranger);
  for (const bad of [`/r/${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`, '/r/short', `/r/${'x'.repeat(43)}`]) {
    expect((await stranger.goto(bad))?.status(), bad).toBe(404);
    await expect(stranger.getByRole('heading', { name: 'This link isn’t valid' })).toBeVisible();
  }

  // Inside the cutoff: no online cancellation (checked by the server, not only hidden).
  await db.query('update public.booking_settings set cancel_cutoff_hours = 168 where business_id = $1', [biz.businessId]);
  await visitor.goto(link);
  await expect(visitor.getByText(/Online cancellation is only available until 7 days before the appointment/)).toBeVisible();
  await expect(visitor.getByRole('button', { name: 'Cancel appointment' })).toHaveCount(0);

  // Before the cutoff: cancel online.
  await db.query('update public.booking_settings set cancel_cutoff_hours = 0 where business_id = $1', [biz.businessId]);
  await visitor.goto(link);
  await visitor.getByRole('button', { name: 'Cancel appointment' }).click();
  await visitor.getByRole('group', { name: 'Cancel appointment' }).getByRole('button', { name: 'Cancel appointment' }).click();
  await expect(visitor.getByRole('heading', { name: 'Appointment cancelled' })).toBeVisible();
  await expect(visitor.getByText('You cancelled this appointment.')).toBeVisible();
  const { rows } = await db.query(
    `select a.status, a.cancelled_by from public.appointments a join public.booking_requests r on r.id = a.booking_request_id where r.business_id = $1`,
    [biz.businessId],
  );
  expect(rows).toEqual([{ status: 'cancelled', cancelled_by: 'customer' }]);
});

test('cross-business isolation: tampered choices are refused, pages and links show one business only', async ({ page, browser }) => {
  const a = await bookableBusiness(page, 'isoa', { name: 'Alpha Auto Spa' });
  const ownerB = await (await browser.newContext()).newPage();
  const b = await bookableBusiness(ownerB, 'isob', { name: 'Bravo Detailing' });
  await db.query(`update public.services set name = 'Bravo secret package' where id = $1`, [b.services.wash]);

  const visitor = await (await browser.newContext()).newPage();
  await asVisitor(visitor);
  await visitor.goto(`/book/${a.slug}`);
  await expect(visitor.getByText('Bravo secret package')).toHaveCount(0);
  await expect(visitor.getByText('Bravo Detailing')).toHaveCount(0);
  await bookThrough(visitor);

  // Swap A's service id for B's in the submitted selection: the database refuses it.
  await visitor.route(`**/book/${a.slug}`, async (route) => {
    const req = route.request();
    if (req.method() !== 'POST' || !req.headers()['next-action']) return route.continue();
    const body = (req.postData() ?? '').replaceAll(a.services.fullDetail, b.services.wash);
    expect(body).toContain(b.services.wash);
    return route.continue({ postData: body });
  });
  await visitor.getByRole('button', { name: 'Send request' }).click();
  await expect(visitor.getByText('One of your choices is no longer available.')).toBeVisible();
  expect(await requests(a.businessId)).toHaveLength(0);
  expect(await requests(b.businessId)).toHaveLength(0);

  // B's owner can't preview A's page.
  expect((await ownerB.goto(`/book/${a.slug}/preview`))?.status()).toBe(404);
});

for (const [width, height] of [[1280, 900], [390, 844]] as const) {
  test(`booking page layout at ${width}px: no horizontal scroll`, async ({ page, browser }) => {
    const biz = await bookableBusiness(page, `layout${width}`);
    const visitor = await (await browser.newContext({ viewport: { width, height } })).newPage();
    await asVisitor(visitor);
    await visitor.goto(`/book/${biz.slug}`);
    await choose(visitor, 'Large SUV / Truck', 'Full detail', ['Pet hair removal']);
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    await visitor.screenshot({ path: `test-results/booking-service-${width}.png`, fullPage: true });
    await pickFirstTime(visitor);
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    await visitor.screenshot({ path: `test-results/booking-time-${width}.png`, fullPage: false });
  });
}

test('the booking link shown in Settings is the real public route; offline stays unavailable', async ({ page, browser }) => {
  const biz = await bookableBusiness(page, 'settingslink', { published: false });
  await page.goto('/app/settings');
  const link = page.getByRole('link', { name: /\/book\// });
  const href = (await link.getAttribute('href'))!;
  expect(href).toBe(`http://localhost:3000/book/${biz.slug}`);
  await expect(link).toHaveText(href); // what's displayed is exactly what opens
  await expect(page.getByText('Offline — shows “not available” until you put it live')).toBeVisible();

  const visitor = await (await browser.newContext()).newPage();
  // Unpublished: the exact link (and the old /b/ form) give the generic unavailable page.
  expect((await visitor.goto(href))?.status()).toBe(404);
  await expect(visitor.getByRole('heading', { name: 'This booking page isn’t available' })).toBeVisible();
  expect((await visitor.goto(`/b/${biz.slug}`))?.status()).toBe(404);
  await expect(visitor).toHaveURL(`/book/${biz.slug}`);

  // Put live from the owner screen, then the same link works.
  await page.getByRole('link', { name: 'Manage' }).click();
  await page.getByRole('button', { name: 'Put booking page live' }).click();
  await expect(page.getByText('Your booking page is live.')).toBeVisible();
  expect((await visitor.goto(href))?.status()).toBe(200);
  await expect(visitor.getByRole('heading', { name: 'Northside Detail Co.' })).toBeVisible();
  await visitor.goto(`/b/${biz.slug}`); // old-style links land on the real page
  await expect(visitor).toHaveURL(`/book/${biz.slug}`);
  await expect(visitor.getByRole('heading', { name: 'Northside Detail Co.' })).toBeVisible();
  await page.goto('/app/settings');
  await expect(page.getByText(/· Live ·/)).toBeVisible();
});
