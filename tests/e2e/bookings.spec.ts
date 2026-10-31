import { expect, test, type Page } from '@playwright/test';
import { cleanup, db } from './support';
import { asVisitor, bookableBusiness, seedRequest } from './support-booking';

test.afterAll(cleanup);

const status = async (id: string) => (await db.query('select status from public.booking_requests where id = $1', [id])).rows[0].status as string;
const appointmentOf = async (requestId: string) =>
  (
    await db.query(
      `select a.id, a.status, a.starts_at, a.customer_id, c.source, (select count(*)::int from public.schedule_blocks b where b.appointment_id = a.id) as blocks
         from public.appointments a join public.customers c on c.id = a.customer_id where a.booking_request_id = $1`,
      [requestId],
    )
  ).rows[0];
const actions = (page: Page) => page.getByRole('region', { name: 'Actions' });
const openForm = async (page: Page, button: string) => {
  await actions(page).getByRole('button', { name: button, exact: true }).first().click();
  return page.getByRole('form', { name: button });
};

test('inbox: pending requests first, every detail shown; confirm, never overbook, decline privately', async ({ page, browser }) => {
  const biz = await bookableBusiness(page, 'inbox');
  const r1 = await seedRequest(biz, { daysAhead: 3, time: '10:00', addon: true, notes: 'Gate code 4411' });
  const r2 = await seedRequest(biz, { daysAhead: 3, time: '11:00', first: 'Sam', last: 'Ortiz', phone: '+15125550199', email: 'sam@example.com' });
  const r3 = await seedRequest(biz, { daysAhead: 6, time: '09:00', first: 'Lee', last: 'Park', phone: '+15125550177', email: 'lee@example.com' });

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Bookings' }).click();
  const tabs = page.getByRole('navigation', { name: 'Filter bookings' });
  await expect(tabs.getByRole('link', { name: /Pending/ })).toContainText('3');
  const rows = page.getByRole('list', { name: 'Bookings' }).getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Jordan Reyes'); // soonest pending first
  await expect(rows.nth(1)).toContainText('Sam Ortiz');
  await expect(rows.nth(2)).toContainText('Lee Park');
  const first = rows.nth(0);
  for (const text of ['(512) 555-0142', 'jordan.reyes@example.com', '2021 Tesla Model Y · Car', 'Full detail', '+ Pet hair removal', '$220', '3h 30m', '10:00 AM', 'Gate code 4411', 'Pending'])
    await expect(first).toContainText(text);

  // Detail: everything, then confirm.
  await first.getByRole('link').click();
  await expect(page.getByRole('heading', { name: /Jordan Reyes/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Services' })).toContainText('Estimated total');
  await expect(page.getByRole('region', { name: 'Services' })).toContainText('$220');
  await expect(page.getByRole('region', { name: 'Customer notes' })).toContainText('Gate code 4411');
  await expect(page.getByRole('region', { name: 'Vehicle' })).toContainText('Dog hair in the back');
  await expect(page.getByRole('link', { name: '(512) 555-0142', exact: true })).toHaveAttribute('href', 'tel:+15125550142');
  await expect(page.getByRole('link', { name: 'Text (512) 555-0142' })).toHaveAttribute('href', 'sms:+15125550142');
  await expect(page.getByRole('link', { name: 'jordan.reyes@example.com' })).toHaveAttribute('href', 'mailto:jordan.reyes@example.com');
  const confirm = await openForm(page, 'Confirm booking');
  await confirm.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByText('Booking confirmed.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Jordan Reyes/ })).toContainText('Confirmed');
  expect(await appointmentOf(r1.id)).toMatchObject({ status: 'scheduled', source: 'booking_page', blocks: 1 });
  await expect(page.getByRole('region', { name: 'History' })).toContainText('You confirmed the booking');

  // The overlapping request can't be confirmed (capacity 1): nothing changes.
  await page.goto(`/app/bookings/${r2.id}`);
  const confirm2 = await openForm(page, 'Confirm booking');
  await confirm2.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByText('That time is already fully booked.')).toBeVisible();
  expect(await status(r2.id)).toBe('pending');
  expect(await appointmentOf(r2.id)).toBeUndefined();

  // Decline with a private reason and a message the customer sees.
  const decline = await openForm(page, 'Decline');
  await decline.getByLabel('Reason (private)').fill('Booked solid that morning');
  await decline.getByLabel('Show a message to the customer').check();
  await decline.getByLabel('Message to the customer', { exact: true }).fill('Sorry, that morning is full. Please pick another day.');
  await decline.getByRole('button', { name: 'Decline request' }).click();
  await expect(page.getByText('Request declined.')).toBeVisible();
  expect(await status(r2.id)).toBe('declined');
  const customer = await (await browser.newContext()).newPage();
  await asVisitor(customer);
  await customer.goto(`/r/${r2.token}`);
  await expect(customer.getByRole('heading', { name: 'Request declined' })).toBeVisible();
  await expect(customer.getByText('Sorry, that morning is full.')).toBeVisible();
  await expect(customer.getByText('Booked solid')).toHaveCount(0); // the private reason never leaves

  // Filters.
  await page.goto('/app/bookings?view=confirmed');
  await expect(page.getByRole('list', { name: 'Bookings' }).getByRole('listitem')).toHaveCount(1);
  await page.goto('/app/bookings?view=declined');
  await expect(page.getByRole('list', { name: 'Bookings' })).toContainText('Sam Ortiz');
  await page.goto('/app/bookings?view=pending');
  await expect(page.getByRole('list', { name: 'Bookings' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('list', { name: 'Bookings' })).toContainText(String('Lee Park'));
  void r3;
});

test('duplicate customers: warned, inspectable, linked only when the owner chooses', async ({ page }) => {
  const biz = await bookableBusiness(page, 'dupes');
  const { rows: [existing] } = await db.query(
    `insert into public.customers (business_id, first_name, last_name, phone_e164, email) values ($1, 'Jordan', 'Reyes', '+15125550142', 'old@example.com') returning id`,
    [biz.businessId],
  );
  await db.query(`insert into public.vehicles (business_id, customer_id, year, make, model) values ($1, $2, 2018, 'Honda', 'Civic')`, [biz.businessId, existing.id]);
  const keepSeparate = await seedRequest(biz, { daysAhead: 3, time: '09:00' });
  const link = await seedRequest(biz, { daysAhead: 5, time: '09:00' });

  await page.goto(`/app/bookings/${keepSeparate.id}`);
  await expect(page.getByText('Possible existing customer:')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Jordan Reyes' }).first()).toHaveAttribute('href', `/app/customers/${existing.id}`);
  // Default: a new record (Phase 4C behaviour), no merging.
  const confirm = await openForm(page, 'Confirm booking');
  await expect(confirm.getByLabel('A new customer record from this request (default)')).toBeChecked();
  await confirm.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByText('Booking confirmed.')).toBeVisible();
  expect((await appointmentOf(keepSeparate.id)).customer_id).not.toBe(existing.id);

  // The owner explicitly picks the existing customer and their existing vehicle.
  await page.goto(`/app/bookings/${link.id}`);
  const confirm2 = await openForm(page, 'Confirm booking');
  await confirm2.getByLabel('Existing customer: Jordan Reyes').first().check();
  await confirm2.getByLabel('Vehicle').selectOption({ label: '2018 Honda Civic' });
  await confirm2.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByText('Booking confirmed.')).toBeVisible();
  expect((await appointmentOf(link.id)).customer_id).toBe(existing.id);
  const { rows: [{ n }] } = await db.query(`select count(*)::int as n from public.vehicles where customer_id = $1`, [existing.id]);
  expect(n).toBe(1); // existing vehicle used, none added
});

test('propose another time: the customer accepts one and rejects another; nothing is auto-confirmed', async ({ page, browser }) => {
  const biz = await bookableBusiness(page, 'propose');
  const accept = await seedRequest(biz, { daysAhead: 3, time: '08:00' });
  const reject = await seedRequest(biz, { daysAhead: 4, time: '08:00', first: 'Sam', phone: '+15125550199', email: 'sam@example.com' });

  await page.goto(`/app/bookings/${accept.id}`);
  const propose = await openForm(page, 'Propose another time');
  const day = new Date(Date.now() + 5 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  await propose.getByLabel('Date').fill(day);
  const slot = propose.getByLabel('Open start time');
  await expect(slot.locator('option').first()).toBeAttached();
  const chosen = await slot.locator('option').nth(2).getAttribute('value');
  await slot.selectOption(chosen!);
  await propose.getByLabel('Message to the customer (optional)').fill('Could you do a little later?');
  await propose.getByRole('button', { name: 'Propose this time' }).click();
  await expect(page.getByText('New time proposed.')).toBeVisible();
  expect(await status(accept.id)).toBe('time_proposed');
  expect(await appointmentOf(accept.id)).toBeUndefined(); // not confirmed until the customer accepts
  await expect(page.getByText(/^You proposed .* it’s confirmed only if they accept\.$/)).toBeVisible();

  const customer = await (await browser.newContext()).newPage();
  await asVisitor(customer);
  await customer.goto(`/r/${accept.token}`);
  await expect(customer.getByRole('heading', { name: /suggested a different time/ })).toBeVisible();
  await expect(customer.getByText('Could you do a little later?')).toBeVisible();
  await customer.getByRole('button', { name: 'Accept this time' }).click();
  await expect(customer.getByRole('heading', { name: 'Appointment confirmed' })).toBeVisible();
  const appt = await appointmentOf(accept.id);
  expect(new Date(appt.starts_at).toISOString()).toBe(new Date(chosen!).toISOString());
  await page.reload();
  await expect(page.getByRole('heading', { name: /Jordan Reyes/ })).toContainText('Confirmed');

  // Reject.
  await page.goto(`/app/bookings/${reject.id}`);
  const propose2 = await openForm(page, 'Propose another time');
  await propose2.getByLabel('Date').fill(day);
  await expect(propose2.getByLabel('Open start time').locator('option').first()).toBeAttached();
  await propose2.getByRole('button', { name: 'Propose this time' }).click();
  await expect(page.getByText('New time proposed.')).toBeVisible();
  await customer.goto(`/r/${reject.token}`);
  await customer.getByRole('button', { name: 'Decline', exact: true }).click();
  await customer.getByRole('group', { name: 'Decline' }).getByRole('button', { name: 'Decline' }).click();
  await expect(customer.getByRole('heading', { name: 'Suggested time declined' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Sam/ })).toContainText('Proposal declined');
  expect(await appointmentOf(reject.id)).toBeUndefined();
});

test('holds: request holds and calendar holds take capacity, never replace appointments, and release', async ({ page }) => {
  const biz = await bookableBusiness(page, 'holds');
  const held = await seedRequest(biz, { daysAhead: 3, time: '09:00' });
  const other = await seedRequest(biz, { daysAhead: 3, time: '10:00', first: 'Sam', phone: '+15125550199', email: 'sam@example.com' });

  // Hold the requested time: the overlapping request can't be confirmed while it's held.
  await page.goto(`/app/bookings/${held.id}`);
  const hold = await openForm(page, 'Hold this time');
  await hold.getByLabel('Hold for').selectOption('24');
  await hold.getByRole('button', { name: 'Hold time' }).click();
  await expect(page.getByText(/You’re holding this time until/)).toBeVisible();
  await page.goto(`/app/bookings/${other.id}`);
  const confirm = await openForm(page, 'Confirm booking');
  await confirm.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByText('That time is already fully booked.')).toBeVisible();
  await page.goto(`/app/bookings/${held.id}`);
  await actions(page).getByRole('button', { name: 'Release hold' }).click();
  await expect(page.getByText('Hold released.')).toBeVisible();

  // Calendar hold on another day, shown on the calendar and in the list.
  const day = new Date(Date.now() + 8 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Calendar' }).click();
  await page.getByLabel('Date').fill(day);
  await page.getByLabel('From').selectOption('13:00');
  await page.getByLabel('To').selectOption('15:00');
  await page.getByLabel('Keep it for').selectOption('48');
  await page.getByLabel('Note (optional, private)').fill('Fleet van — waiting on PO');
  await page.getByRole('button', { name: 'Hold time' }).click();
  await expect(page.getByText('Time held.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Active holds' })).toContainText('Fleet van — waiting on PO');
  await expect(page.getByRole('region', { name: 'Active holds' })).toContainText('1:00 PM – 3:00 PM');
  const { rows: blocks } = await db.query(
    `select note, booking_request_id from public.schedule_blocks where business_id = $1 and kind = 'hold'`,
    [biz.businessId],
  );
  expect(blocks).toEqual([{ note: 'Fleet van — waiting on PO', booking_request_id: null }]);
  await page.goto(`/app/calendar?view=day&date=${day}`);
  await expect(page.getByRole('grid').getByLabel(/^Hold: Hold, 1:00 PM to 3:00 PM/)).toBeVisible();

  // A hold over a confirmed appointment is refused.
  await page.goto(`/app/bookings/${other.id}`);
  const confirm2 = await openForm(page, 'Confirm booking');
  await confirm2.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByText('Booking confirmed.')).toBeVisible();
  await page.goto('/app/calendar');
  await page.getByLabel('Date').fill(new Date(other.start).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }));
  await page.getByLabel('From').selectOption('10:00');
  await page.getByLabel('To').selectOption('11:00');
  await page.getByRole('button', { name: 'Hold time' }).click();
  await expect(page.getByText('That time is already fully booked. Holds never replace confirmed appointments.')).toBeVisible();

  // Release.
  await page.getByRole('region', { name: 'Active holds' }).getByRole('button', { name: 'Release' }).click();
  await expect(page.getByRole('region', { name: 'Active holds' })).toContainText('No holds.');
  expect((await db.query(`select count(*)::int as n from public.schedule_blocks where business_id = $1 and kind = 'hold'`, [biz.businessId])).rows[0].n).toBe(0);
});

test('appointments: reschedule without overbooking, cancel frees the time, complete and no-show', async ({ page }) => {
  const biz = await bookableBusiness(page, 'appts');
  const a = await seedRequest(biz, { daysAhead: 3, time: '08:00' });
  const b = await seedRequest(biz, { daysAhead: 3, time: '13:00', first: 'Sam', phone: '+15125550199', email: 'sam@example.com' });
  const c = await seedRequest(biz, { daysAhead: 3, time: '09:00', first: 'Lee', phone: '+15125550177', email: 'lee@example.com' });
  for (const r of [a, b]) {
    await page.goto(`/app/bookings/${r.id}`);
    const f = await openForm(page, 'Confirm booking');
    await f.getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page.getByText('Booking confirmed.')).toBeVisible();
  }
  const day = new Date(a.start).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  // Reschedule A into B's time (custom time): refused, A unchanged.
  await page.goto(`/app/bookings/${a.id}`);
  let f = await openForm(page, 'Reschedule');
  await f.getByLabel('Date').fill(day);
  await f.getByRole('button', { name: 'Enter a time that isn’t listed' }).click();
  await f.getByLabel('Start time').fill('13:30');
  await f.getByRole('button', { name: 'Reschedule' }).click();
  await expect(page.getByText('That time is already fully booked. Nothing was changed.')).toBeVisible();
  expect(new Date((await appointmentOf(a.id)).starts_at).getTime()).toBe(new Date(a.start).getTime());

  // Reschedule A to an open time on another day.
  const later = new Date(Date.now() + 9 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  await f.getByRole('button', { name: 'Choose from open times' }).click();
  await f.getByLabel('Date').fill(later);
  await expect(f.getByLabel('Open start time').locator('option').first()).toBeAttached();
  await f.getByRole('button', { name: 'Reschedule' }).click();
  await expect(page.getByText('Appointment rescheduled.')).toBeVisible();
  const moved = await appointmentOf(a.id);
  expect(new Date(moved.starts_at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })).toBe(later);
  expect(moved.blocks).toBe(1);

  // Cancel B: its time is free again, so C (overlapping B? no — C overlaps A's old slot) can be confirmed.
  await page.goto(`/app/bookings/${b.id}`);
  f = await openForm(page, 'Cancel appointment');
  await f.getByLabel('Reason (private)').fill('Customer called to cancel');
  await f.getByRole('button', { name: 'Cancel appointment' }).click();
  await expect(page.getByText('Appointment cancelled. The time is free again.')).toBeVisible();
  expect(await appointmentOf(b.id)).toMatchObject({ status: 'cancelled', blocks: 0 });
  await page.goto(`/app/bookings/${c.id}`);
  f = await openForm(page, 'Confirm booking');
  await f.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByText('Booking confirmed.')).toBeVisible();

  // Future jobs can't be completed or marked no-show; past ones can.
  await expect(actions(page).getByRole('button', { name: 'Mark completed' })).toHaveCount(0);
  await expect(page.getByText('Mark completed or no-show becomes available once the start time has passed.')).toBeVisible();
  const past = async (label: string) => {
    const { rows: [cust] } = await db.query(`insert into public.customers (business_id, first_name, phone_e164) values ($1, $2, '+15125550111') returning id`, [biz.businessId, label]);
    const { rows: [veh] } = await db.query(`insert into public.vehicles (business_id, customer_id, make, model) values ($1, $2, 'Ford', 'F-150') returning id`, [biz.businessId, cust.id]);
    const { rows: [ap] } = await db.query(
      `insert into public.appointments (business_id, resource_id, customer_id, vehicle_id, starts_at, ends_at, location_type, estimated_total_cents)
       select $1, r.id, $2, $3, now() - interval '${label === 'Done' ? 30 : 50} hours', now() - interval '${label === 'Done' ? 27 : 47} hours', 'shop', 18000
         from public.schedule_resources r where r.business_id = $1 returning id`,
      [biz.businessId, cust.id, veh.id],
    );
    return ap.id as string;
  };
  const done = await past('Done');
  const missed = await past('Missed');
  await page.goto(`/app/bookings/${done}`);
  await actions(page).getByRole('button', { name: 'Mark completed' }).click();
  await expect(page.getByText('Marked completed.')).toBeVisible();
  await page.goto(`/app/bookings/${missed}`);
  await actions(page).getByRole('button', { name: 'Mark no-show' }).click();
  await expect(page.getByText('Marked as a no-show.')).toBeVisible();
  const { rows } = await db.query('select id, status from public.appointments where id = any($1)', [[done, missed]]);
  expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({ [done]: 'completed', [missed]: 'no_show' });
  await page.goto('/app/bookings?view=completed');
  await expect(page.getByRole('list', { name: 'Bookings' })).toContainText('Done');
  await page.goto('/app/bookings?view=cancelled');
  await expect(page.getByRole('list', { name: 'Bookings' })).toContainText('Missed');
  await expect(page.getByRole('list', { name: 'Bookings' })).toContainText('Sam');
});

test('calendar shows real data in the business time zone: day, week and agenda', async ({ page }) => {
  const biz = await bookableBusiness(page, 'calendar');
  const confirmed = await seedRequest(biz, { daysAhead: 2, time: '09:00' });
  const pending = await seedRequest(biz, { daysAhead: 2, time: '14:00', first: 'Sam', phone: '+15125550199', email: 'sam@example.com' });
  await page.goto(`/app/bookings/${confirmed.id}`);
  const f = await openForm(page, 'Confirm booking');
  await f.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByText('Booking confirmed.')).toBeVisible();
  const day = new Date(confirmed.start).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  await page.goto(`/app/calendar?view=day&date=${day}`);
  const grid = page.getByRole('grid');
  await expect(grid.getByLabel('Confirmed: Jordan Reyes, 9:00 AM to 12:00 PM')).toBeVisible();
  await expect(grid.getByLabel('Pending request: Sam Reyes, 2:00 PM to 5:00 PM')).toBeVisible();
  await page.screenshot({ path: 'test-results/calendar-day.png', fullPage: true });
  await page.goto(`/app/calendar?view=week&date=${day}`);
  await expect(page.getByRole('grid').getByLabel(/^Confirmed: Jordan Reyes/)).toBeVisible();
  await page.screenshot({ path: 'test-results/calendar-week.png' });
  await page.goto(`/app/calendar?view=agenda&date=${day}`);
  await expect(page.getByText('9:00 AM – 12:00 PM')).toBeVisible();
  await page.getByRole('link', { name: /Sam Reyes/ }).click();
  await expect(page).toHaveURL(`/app/bookings/${pending.id}`);
});

test('cross-business isolation: B cannot open or act on A’s bookings or holds', async ({ page, browser }) => {
  const a = await bookableBusiness(page, 'isoA4d', { name: 'Alpha Auto Spa' });
  const ra = await seedRequest(a, { daysAhead: 3, time: '09:00', first: 'Alpha', last: 'Customer' });
  const pageB = await (await browser.newContext()).newPage();
  const b = await bookableBusiness(pageB, 'isoB4d', { name: 'Bravo Detailing' });
  const rb = await seedRequest(b, { daysAhead: 3, time: '09:00', first: 'Bravo', last: 'Customer' });

  expect((await pageB.goto(`/app/bookings/${ra.id}`))?.status()).toBe(404);
  await pageB.goto('/app/bookings');
  await expect(pageB.getByText('Alpha Customer')).toHaveCount(0);
  await pageB.goto(`/app/calendar?view=agenda`);
  await expect(pageB.getByText('Alpha Customer')).toHaveCount(0);

  // Tamper: B confirms its own request but swaps in A's request id.
  await pageB.goto(`/app/bookings/${rb.id}`);
  await pageB.route(`**/app/bookings/${rb.id}`, async (route) => {
    const req = route.request();
    if (req.method() !== 'POST' || !req.headers()['next-action']) return route.continue();
    const body = (req.postData() ?? '').replaceAll(rb.id, ra.id);
    expect(body).toContain(ra.id);
    return route.continue({ postData: body });
  });
  const f = await openForm(pageB, 'Confirm booking');
  await f.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(pageB.getByText('That booking, customer or vehicle wasn’t found.')).toBeVisible();
  expect(await status(ra.id)).toBe('pending');
  expect(await status(rb.id)).toBe('pending');
});

for (const [width, height] of [[390, 844], [1280, 900]] as const) {
  test(`booking management layout at ${width}px: no horizontal page scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const biz = await bookableBusiness(page, `mgmt${width}`);
    const r = await seedRequest(biz, { daysAhead: 2, time: '09:00', addon: true, notes: 'Please use the side gate.' });
    await seedRequest(biz, { daysAhead: 2, time: '13:00', first: 'Sam', phone: '+15125550199', email: 'sam@example.com' });
    for (const [path, shot] of [['/app/bookings', 'inbox'], [`/app/bookings/${r.id}`, 'detail'], ['/app/calendar', 'calendar']] as const) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBe(0);
      await page.screenshot({ path: `test-results/mgmt-${shot}-${width}.png`, fullPage: true });
    }
  });
}
