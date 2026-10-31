import { expect, test, type Page } from '@playwright/test';
import { cleanup, db } from './support';
import { bookableBusiness } from './support-booking';

test.afterAll(cleanup);

// Business from bookableBusiness: mobile, capacity 1, hours 08–18 daily, 1 h notice, 30 min buffer,
// hourly slots. Full detail $180 / 3 h ($240 / 4 h for Large SUV / Truck), Exterior wash from $60,
// Pet hair removal add-on $40 / 30 min, Ceramic coating (quote only).
const dayAhead = (n: number) => new Date(Date.now() + n * 86400_000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const appointments = async (businessId: string) =>
  (
    await db.query(
      `select a.id, a.source, a.status, a.estimated_total_cents, extract(epoch from a.ends_at - a.starts_at) / 60 as minutes, a.internal_notes,
              c.first_name, c.source as customer_source, v.make, v.model, a.starts_at
         from public.appointments a join public.customers c on c.id = a.customer_id join public.vehicles v on v.id = a.vehicle_id
        where a.business_id = $1 order by a.created_at`,
      [businessId],
    )
  ).rows.map((r) => ({ ...r, minutes: Number(r.minutes) }));

async function pickService(page: Page, size: string, service: string, addons: string[] = []) {
  const sizeSelect = page.getByLabel('Vehicle size');
  await sizeSelect.selectOption((await sizeSelect.locator('option', { hasText: size }).first().getAttribute('value'))!);
  await page.getByRole('radiogroup', { name: 'Service' }).getByLabel(new RegExp(`^${service}`)).check();
  for (const a of addons) await page.getByRole('checkbox', { name: new RegExp(`^${a}`) }).check();
}
async function pickTime(page: Page, date: string, index = 0) {
  await page.getByLabel('Date').fill(date);
  const select = page.getByLabel('Start time');
  await expect(select.locator('option').first()).toBeAttached();
  const value = (await select.locator('option').nth(index).getAttribute('value'))!;
  await select.selectOption(value);
  return value;
}

test('phone booking for a new customer and vehicle: saved prices, confirmed, everywhere at once', async ({ page }) => {
  const biz = await bookableBusiness(page, 'ownernew');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Bookings' }).click();
  await page.getByRole('link', { name: 'New appointment' }).click();
  await expect(page.getByRole('heading', { name: 'New appointment' })).toBeVisible();
  await expect(page.getByLabel('Phone call')).toBeChecked();
  await expect(page.getByText('Ceramic coating')).toHaveCount(0); // quote-only services can't be booked without a price

  await page.getByRole('tab', { name: 'New customer' }).click();
  await page.getByLabel('First name').fill('Jordan');
  await page.getByLabel('Last name (optional)').fill('Reyes');
  await page.getByLabel('Phone', { exact: true }).fill('(512) 555-0142');
  await page.getByLabel('Make').fill('Tesla');
  await page.getByLabel('Model').fill('Model Y');
  await pickService(page, 'Large SUV / Truck', 'Full detail', ['Pet hair removal']);
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('$280 · about 4h 30m');
  const slot = await pickTime(page, dayAhead(3));
  await page.getByLabel('Street address').fill('500 Elm St');
  await page.getByLabel('City').fill('Austin');
  await page.getByLabel('State').fill('tx');
  await page.getByLabel('ZIP').fill('78702');
  await page.getByLabel('Notes (only you see these)').fill('Called from the shop line. Gate code 4411.');
  // Injected price/duration fields are ignored: the database prices the job.
  await page.evaluate(() => {
    const form = document.querySelector('form')!;
    for (const [name, value] of [['price', '1'], ['estimated_total_cents', '1'], ['durationMin', '15']]) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
  });
  await page.getByRole('button', { name: 'Create appointment' }).click();

  await expect(page.getByText('Appointment created. It’s on your calendar now.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Jordan Reyes/ })).toContainText('Confirmed');
  await expect(page.getByRole('region', { name: 'Appointment' })).toContainText('Phone call');
  await expect(page.getByRole('region', { name: 'Appointment' })).toContainText('Gate code 4411');
  await expect(page.getByRole('region', { name: 'Services' })).toContainText('$280');
  await expect(page.getByRole('region', { name: 'History' })).toContainText('You created the appointment');

  const [a] = await appointments(biz.businessId);
  expect(a).toMatchObject({ source: 'phone', status: 'scheduled', estimated_total_cents: 28000, minutes: 270, first_name: 'Jordan', customer_source: 'phone', make: 'Tesla' });
  expect(new Date(a.starts_at).toISOString()).toBe(new Date(slot).toISOString());

  // Inbox, calendar (day/week/agenda) and the customer's history show it straight away.
  await page.goto('/app/bookings?view=confirmed');
  await expect(page.getByRole('list', { name: 'Bookings' })).toContainText('Jordan Reyes');
  await expect(page.getByRole('list', { name: 'Bookings' })).toContainText('Phone call');
  for (const view of ['day', 'week']) {
    await page.goto(`/app/calendar?view=${view}&date=${dayAhead(3)}`);
    await expect(page.getByRole('grid').getByLabel(/^Confirmed: Jordan Reyes/)).toBeVisible();
  }
  await page.goto(`/app/calendar?view=agenda&date=${dayAhead(3)}`);
  await expect(page.getByRole('link', { name: /Jordan Reyes/ })).toBeVisible();
  await page.goto('/app/customers');
  await page.getByRole('link', { name: 'Jordan Reyes' }).click();
  await expect(page.getByRole('region', { name: 'Appointments' })).toContainText('Full detail, Pet hair removal');
  await expect(page.getByRole('region', { name: 'Appointments' })).toContainText('Confirmed');
});

test('existing customers: existing vehicle (text) and a new vehicle (walk-in); no duplicates created', async ({ page }) => {
  const biz = await bookableBusiness(page, 'ownerexisting');
  const { rows: [dana] } = await db.query(
    `insert into public.customers (business_id, first_name, last_name, phone_e164, email, address_line1, city, state, postal_code)
     values ($1, 'Dana', 'Lopez', '+15125550301', 'dana@example.com', '700 Oak St', 'Austin', 'TX', '78703') returning id`,
    [biz.businessId],
  );
  await db.query(`insert into public.vehicles (business_id, customer_id, year, make, model, size_class_id) values ($1, $2, 2019, 'Toyota', 'Tacoma', $3)`, [biz.businessId, dana.id, biz.sizes.large]);

  // From the customer's page: prefilled, vehicle and its size preselected.
  await page.goto(`/app/customers/${dana.id}`);
  await page.getByRole('link', { name: 'New appointment' }).click();
  await expect(page.getByText('Dana Lopez')).toBeVisible();
  await expect(page.getByLabel('2019 Toyota Tacoma')).toBeChecked();
  await expect(page.getByLabel('Vehicle size')).toHaveValue(biz.sizes.large);
  await expect(page.getByLabel('Street address')).toHaveValue('700 Oak St'); // from the customer record
  await page.getByLabel('Text message').check();
  await page.getByRole('radiogroup', { name: 'Service' }).getByLabel(/^Full detail/).check();
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('$240 · about 4h');
  await pickTime(page, dayAhead(3));
  await page.getByRole('button', { name: 'Create appointment' }).click();
  await expect(page.getByText('Appointment created.')).toBeVisible();

  // Search by phone, then add a new vehicle for a walk-in.
  await page.goto('/app/appointments/new');
  await page.getByLabel('Walk-in').check();
  await page.getByLabel('Find a customer').fill('555-0301');
  await page.getByRole('list', { name: 'Matching customers' }).getByRole('button', { name: /Dana Lopez/ }).click();
  await page.getByLabel('Add a vehicle').check();
  await page.getByLabel('Year (optional)').fill('2022');
  await page.getByLabel('Make').fill('Subaru');
  await page.getByLabel('Model').fill('Outback');
  await pickService(page, 'Small SUV', 'Exterior wash');
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('From $60 · about 1h');
  await pickTime(page, dayAhead(4));
  await page.getByRole('button', { name: 'Create appointment' }).click();
  await expect(page.getByText('Appointment created.')).toBeVisible();

  const rows = await appointments(biz.businessId);
  expect(rows.map((r) => [r.source, r.first_name, r.make, r.estimated_total_cents, r.minutes])).toEqual([
    ['text', 'Dana', 'Toyota', 24000, 240],
    ['walk_in', 'Dana', 'Subaru', 6000, 60],
  ]);
  const { rows: [{ n }] } = await db.query(`select count(*)::int as n from public.customers where business_id = $1`, [biz.businessId]);
  expect(n).toBe(1);

  // In-person and other sources too.
  for (const [label, value] of [['In person', 'in_person'], ['Other', 'other']] as const) {
    await page.goto(`/app/appointments/new?customer=${dana.id}`);
    await page.getByLabel(label, { exact: true }).check();
    await page.getByRole('radiogroup', { name: 'Service' }).getByLabel(/^Exterior wash/).check();
    await pickTime(page, dayAhead(value === 'other' ? 6 : 5));
    await page.getByRole('button', { name: 'Create appointment' }).click();
    await expect(page.getByText('Appointment created.')).toBeVisible();
  }
  expect((await appointments(biz.businessId)).map((r) => r.source)).toEqual(['text', 'walk_in', 'in_person', 'other']);
});

test('unavailable times are refused by the server, and nothing is left behind', async ({ page }) => {
  const biz = await bookableBusiness(page, 'ownerbusy');
  const { rows: [c] } = await db.query(`insert into public.customers (business_id, first_name, phone_e164, address_line1) values ($1, 'Eli', '+15125550302', '12 Pine St') returning id`, [biz.businessId]);
  await db.query(`insert into public.vehicles (business_id, customer_id, make, model, size_class_id) values ($1, $2, 'Honda', 'Civic', $3)`, [biz.businessId, c.id, biz.sizes.car]);
  await page.goto(`/app/appointments/new?customer=${c.id}`);
  await page.getByRole('radiogroup', { name: 'Service' }).getByLabel(/^Full detail/).check();
  const slot = await pickTime(page, dayAhead(3));
  await page.getByRole('button', { name: 'Create appointment' }).click();
  await expect(page.getByText('Appointment created.')).toBeVisible();

  // A new customer at the same time (slot value tampered back in): refused, no customer created.
  await page.goto('/app/appointments/new');
  await page.getByRole('tab', { name: 'New customer' }).click();
  await page.getByLabel('First name').fill('Ghost');
  await page.getByLabel('Phone', { exact: true }).fill('(512) 555-0666');
  await page.getByLabel('Make').fill('Ghost');
  await page.getByLabel('Model').fill('Car');
  await page.getByLabel('Street address').fill('1 Ghost Ln');
  await pickService(page, 'Car', 'Full detail');
  await pickTime(page, dayAhead(3));
  await page.getByLabel('Start time').evaluate((el, value) => {
    const select = el as HTMLSelectElement;
    select.add(new Option('tampered', value));
    select.value = value;
  }, slot);
  await page.getByRole('button', { name: 'Create appointment' }).click();
  await expect(page.getByText('That time is already fully booked (including the buffer between jobs).')).toBeVisible();
  // The owner's choices are kept after a refused save.
  await expect(page.getByLabel('First name')).toHaveValue('Ghost');
  await expect(page.getByRole('radiogroup', { name: 'Service' }).getByLabel(/^Full detail/)).toBeChecked();
  expect(await appointments(biz.businessId)).toHaveLength(1);
  const { rows: [{ n }] } = await db.query(`select count(*)::int as n from public.customers where first_name = 'Ghost' and business_id = $1`, [biz.businessId]);
  expect(n).toBe(0);

  // Validation messages for missing details.
  await page.goto('/app/appointments/new');
  await page.getByRole('tab', { name: 'New customer' }).click();
  await page.getByRole('button', { name: 'Create appointment' }).click();
  await expect(page.getByText('Enter a first name.')).toBeVisible();
  await expect(page.getByText('Enter a phone number or an email address.')).toBeVisible();
  await expect(page.getByText('Choose a vehicle size.')).toBeVisible();
  await expect(page.getByText('Choose a service.')).toBeVisible();
  await expect(page.getByText('Enter the street address for a mobile job.')).toBeVisible();
});

test('calendar holds: booked in one step; expired holds are refused', async ({ page }) => {
  const biz = await bookableBusiness(page, 'ownerhold');
  const day = dayAhead(4);
  await page.goto('/app/calendar');
  await page.getByLabel('Date').fill(day);
  await page.getByLabel('From').selectOption('13:15');
  await page.getByLabel('To').selectOption('15:15');
  await page.getByLabel('Note (optional, private)').fill('Fleet van — called back');
  await page.getByRole('button', { name: 'Hold time' }).click();
  await expect(page.getByText('Time held.')).toBeVisible();

  await page.getByRole('region', { name: 'Active holds' }).getByRole('link', { name: 'Book this hold' }).click();
  await expect(page.getByRole('heading', { name: 'Book this hold' })).toBeVisible();
  await expect(page.getByText(/Booking your hold: starts .* 1:15 PM \(“Fleet van — called back”\)/)).toBeVisible();
  await page.getByRole('tab', { name: 'New customer' }).click();
  await page.getByLabel('First name').fill('Fleet');
  await page.getByLabel('Phone', { exact: true }).fill('(512) 555-0777');
  await page.getByLabel('Make').fill('Ford');
  await page.getByLabel('Model').fill('Transit');
  await page.getByLabel('Street address').fill('3 Fleet Rd');
  await pickService(page, 'Van', 'Full detail');
  await page.getByRole('button', { name: 'Create appointment' }).click();
  await expect(page.getByText('Appointment created.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'History' })).toContainText('You booked it from a calendar hold');
  const [a] = await appointments(biz.businessId);
  expect(new Date(a.starts_at).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })).toBe('1:15 PM');
  const { rows: [{ n }] } = await db.query(`select count(*)::int as n from public.schedule_blocks where business_id = $1 and kind = 'hold'`, [biz.businessId]);
  expect(n).toBe(0);

  // An expired hold: the page says so, and a save that still names it is refused.
  const { rows: [expired] } = await db.query(
    `with s as (select set_config('session_replication_role', 'replica', true))
     insert into public.schedule_blocks (business_id, resource_id, kind, during, expires_at)
     select $1, r.id, 'hold', tstzrange(now() + interval '5 days', now() + interval '5 days 2 hours'), now() - interval '1 minute'
       from public.schedule_resources r, s where r.business_id = $1 returning id`,
    [biz.businessId],
  ).catch(async () => {
    // Fallback: set replication role on a dedicated client (the trigger refuses expired holds).
    const client = await db.connect();
    try {
      await client.query('begin');
      await client.query("set local session_replication_role = replica");
      const res = await client.query(
        `insert into public.schedule_blocks (business_id, resource_id, kind, during, expires_at)
         select $1, r.id, 'hold', tstzrange(now() + interval '5 days', now() + interval '5 days 2 hours'), now() - interval '1 minute'
           from public.schedule_resources r where r.business_id = $1 returning id`,
        [biz.businessId],
      );
      await client.query('commit');
      return res;
    } finally {
      client.release();
    }
  });
  await page.goto(`/app/appointments/new?hold=${expired.id}`);
  await expect(page.getByText('That hold has expired or was released.')).toBeVisible();
  await expect(page.getByLabel('Date')).toBeVisible(); // falls back to choosing a time
});

test('two owners’ sessions booking the same slot at once: exactly one appointment', async ({ page, browser }) => {
  const biz = await bookableBusiness(page, 'ownerrace');
  const { rows: [c] } = await db.query(`insert into public.customers (business_id, first_name, phone_e164, address_line1) values ($1, 'Eli', '+15125550302', '12 Pine St') returning id`, [biz.businessId]);
  await db.query(`insert into public.vehicles (business_id, customer_id, make, model, size_class_id) values ($1, $2, 'Honda', 'Civic', $3)`, [biz.businessId, c.id, biz.sizes.car]);
  const second = await page.context().newPage(); // same owner, second tab
  for (const p of [page, second]) {
    await p.goto(`/app/appointments/new?customer=${c.id}`);
    await p.getByRole('radiogroup', { name: 'Service' }).getByLabel(/^Full detail/).check();
    await pickTime(p, dayAhead(3));
  }
  await Promise.all([page.getByRole('button', { name: 'Create appointment' }).click(), second.getByRole('button', { name: 'Create appointment' }).click()]);
  const outcomes = await Promise.all(
    [page, second].map((p) =>
      Promise.race([
        p.getByText('Appointment created.').waitFor().then(() => 'created'),
        p.getByText(/already fully booked|was just taken/).waitFor().then(() => 'refused'),
      ]),
    ),
  );
  expect(outcomes.sort()).toEqual(['created', 'refused']);
  expect(await appointments(biz.businessId)).toHaveLength(1);
  void browser;
});

test('cross-business: B cannot load or book A’s customers, vehicles or holds', async ({ page, browser }) => {
  const a = await bookableBusiness(page, 'ownerisoA', { name: 'Alpha Auto Spa' });
  const { rows: [aCust] } = await db.query(`insert into public.customers (business_id, first_name, phone_e164) values ($1, 'Alpha', '+15125550311') returning id`, [a.businessId]);
  const pageB = await (await browser.newContext()).newPage();
  const b = await bookableBusiness(pageB, 'ownerisoB', { name: 'Bravo Detailing' });
  const { rows: [bCust] } = await db.query(`insert into public.customers (business_id, first_name, phone_e164, address_line1) values ($1, 'Bravo', '+15125550312', '9 Elm St') returning id`, [b.businessId]);
  await db.query(`insert into public.vehicles (business_id, customer_id, make, model, size_class_id) values ($1, $2, 'Ford', 'Focus', $3)`, [b.businessId, bCust.id, b.sizes.car]);

  await pageB.goto(`/app/appointments/new?customer=${aCust.id}`);
  await expect(pageB.getByText('Alpha')).toHaveCount(0); // not prefilled: RLS hides it
  await pageB.getByLabel('Find a customer').fill('Alpha');
  await expect(pageB.getByText('No customers match.')).toBeVisible();

  // Tamper: B books its own customer but swaps in A's customer id.
  await pageB.goto(`/app/appointments/new?customer=${bCust.id}`);
  await pageB.getByRole('radiogroup', { name: 'Service' }).getByLabel(/^Full detail/).check();
  await pickTime(pageB, dayAhead(3));
  await pageB.route('**/app/appointments/new**', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST' || !req.headers()['next-action']) return route.continue();
    return route.continue({ postData: (req.postData() ?? '').replaceAll(bCust.id, aCust.id) });
  });
  await pageB.getByRole('button', { name: 'Create appointment' }).click();
  await expect(pageB.getByText('That customer, vehicle or hold wasn’t found. Choose again.')).toBeVisible();
  expect(await appointments(a.businessId)).toHaveLength(0);
  expect(await appointments(b.businessId)).toHaveLength(0);
});

test('new appointment form on a phone: no horizontal scroll, sticky save bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bookableBusiness(page, 'owner390');
  await page.goto('/app/appointments/new');
  await page.getByRole('tab', { name: 'New customer' }).click();
  await page.getByRole('radiogroup', { name: 'Service' }).getByLabel(/^Full detail/).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  await expect(page.getByRole('button', { name: 'Create appointment' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/new-appointment-390.png', fullPage: true });
});
