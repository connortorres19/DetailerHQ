import { expect, test, type Page } from '@playwright/test';
import { cleanup, db } from './support';
import { asVisitor, bookableBusiness } from './support-booking';

test.afterAll(cleanup);

// Business from bookableBusiness: mobile, capacity 1, hours 08–18, 1 h notice, 30 min buffer.
// Full detail $180 / 3 h ($240 / 4 h for Large SUV / Truck); Ceramic coating is quote-only.
const dayAhead = (n: number) => new Date(Date.now() + n * 86400_000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const lead = async (id: string) => (await db.query('select status, last_contacted_at, customer_id, next_follow_up_at, lost_reason from public.leads where id = $1', [id])).rows[0];
const quote = async (id: string) =>
  (await db.query('select number, status, subtotal_cents, discount_cents, total_cents, customer_id, vehicle_id, lead_id, token_hash is not null as has_link from public.quotes where id = $1', [id])).rows[0];
const idFromUrl = (page: Page) => page.url().split('/').pop()!.split('?')[0]!;

async function newLead(page: Page, overrides: Record<string, string> = {}) {
  await page.goto('/app/leads/new');
  await page.getByLabel('Website', { exact: true }).check();
  await page.getByLabel('First name').fill(overrides.first ?? 'Jordan');
  await page.getByLabel('Last name (optional)').fill('Reyes');
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill(overrides.phone ?? '(512) 555-0142');
  await page.getByLabel('Email (optional)').fill(overrides.email ?? 'jordan.reyes@example.com');
  await page.getByLabel('Year').fill('2021');
  await page.getByLabel('Make').fill('Tesla');
  await page.getByLabel('Model').fill('Model Y');
  const size = page.getByLabel('Size');
  await size.selectOption((await size.locator('option', { hasText: 'Large SUV / Truck' }).getAttribute('value'))!);
  const service = page.getByLabel('Service', { exact: true });
  await service.selectOption((await service.locator('option', { hasText: 'Full detail' }).getAttribute('value'))!);
  await page.getByLabel('Request').fill('Full detail plus a ceramic coating before a road trip.');
  await page.getByLabel('Internal notes').fill('Budget around $1,000 — mentioned a competitor quote.');
  await page.getByRole('button', { name: 'Add lead' }).click();
  await expect(page.getByText('Lead saved.')).toBeVisible();
  return idFromUrl(page);
}

test('leads: create, contact log, notes, follow-ups, status changes, filters and search', async ({ page }) => {
  const biz = await bookableBusiness(page, 'leads');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Leads' }).click();
  await expect(page.getByText('No leads here yet')).toBeVisible();
  const id = await newLead(page);

  await expect(page.getByRole('heading', { name: /Jordan Reyes/ })).toContainText('New');
  const details = page.getByRole('region', { name: 'Details' });
  for (const text of ['2021 Tesla Model Y · Large SUV / Truck', 'Full detail', 'ceramic coating', 'Not contacted yet', 'Budget around $1,000']) await expect(details).toContainText(text);
  await expect(page.getByRole('region', { name: 'History' })).toContainText('Lead added');

  // Log a call: last contacted + status Contacted, in the history.
  const log = page.getByRole('form', { name: 'Log contact' });
  await log.getByLabel('Log contact').selectOption('phone');
  await log.getByLabel('What was said? (optional)').fill('Left a voicemail');
  await log.getByRole('button', { name: 'Log contact' }).click();
  await expect(page.getByText('Contact logged.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Jordan Reyes/ })).toContainText('Contacted');
  await expect(page.getByRole('region', { name: 'History' })).toContainText('Called — “Left a voicemail”');
  expect((await lead(id)).last_contacted_at).not.toBeNull();
  const note = page.getByRole('form', { name: 'Add note' });
  await note.getByLabel('Add a note').fill('Prefers Saturday mornings');
  await note.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByRole('region', { name: 'History' })).toContainText('Note — “Prefers Saturday mornings”');

  // Follow-up due today → on the follow-ups page and Today; then done.
  const fu = page.getByRole('form', { name: 'Set follow-up' });
  await fu.getByLabel('Follow up on').fill(dayAhead(0));
  await fu.getByLabel('Time (optional)').fill('00:15');
  await fu.getByLabel('Note (optional)').fill('Send the quote');
  await fu.getByRole('button', { name: 'Set follow-up' }).click();
  await expect(page.getByText('Follow-up set.')).toBeVisible();
  await page.goto('/app/follow-ups');
  await expect(page.getByRole('region', { name: /Due today or overdue · 1/ })).toContainText('Jordan Reyes');
  await page.goto('/app');
  await expect(page.getByRole('link', { name: '1 follow-up due' })).toBeVisible();
  await page.goto(`/app/leads/${id}`);
  await page.getByRole('form', { name: 'Complete follow-up' }).getByRole('button', { name: 'Mark done' }).click();
  await expect(page.getByText('Follow-up done.')).toBeVisible();
  expect((await lead(id)).next_follow_up_at).toBeNull();

  // Lost needs a reason.
  const status = page.getByRole('form', { name: 'Lead status' });
  await status.getByLabel('Status').selectOption('lost');
  await status.getByLabel('Why was it lost?').selectOption('price');
  await status.getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByText('Status updated.')).toBeVisible();
  expect(await lead(id)).toMatchObject({ status: 'lost', lost_reason: 'price' });

  // A second, uncontacted lead; filters and search.
  await newLead(page, { first: 'Sam', phone: '(512) 555-0199', email: 'sam@example.com' });
  await page.goto('/app/leads?status=lost');
  await expect(page.getByRole('list', { name: 'Leads' }).getByRole('listitem')).toHaveCount(1);
  await page.goto('/app/leads?status=new');
  await expect(page.getByRole('list', { name: 'Leads' })).toContainText('Sam Reyes');
  await page.goto('/app/leads?q=555-0199');
  await expect(page.getByRole('list', { name: 'Leads' }).getByRole('listitem')).toHaveCount(1);
  await page.goto('/app/follow-ups');
  await expect(page.getByRole('region', { name: /Not contacted yet · 1/ })).toContainText('Sam Reyes');
  void biz;
});

test('quote from a lead → customer accepts → booked once, with the quoted work and prices', async ({ page, browser }) => {
  const biz = await bookableBusiness(page, 'quotes');
  const leadId = await newLead(page);
  await page.getByRole('link', { name: 'Create quote' }).click();

  // Prefilled from the lead: new customer, vehicle, the requested service at the large-SUV price.
  await expect(page.getByLabel('First name')).toHaveValue('Jordan');
  await expect(page.getByLabel('Make')).toHaveValue('Tesla');
  const line1 = page.getByRole('listitem', { name: 'Line 1' });
  await expect(line1.getByLabel('Line 1 name')).toHaveValue('Full detail');
  await expect(line1.getByLabel('Price ($)')).toHaveValue('240');
  // A custom line with a description and quantity, and a discount.
  await page.getByRole('button', { name: 'Add custom line' }).click();
  const line2 = page.getByRole('listitem', { name: 'Line 2' });
  await line2.getByLabel('Line 2 name').fill('Ceramic coating (3-year)');
  await line2.getByLabel('Line 2 description (optional)').fill('Paint correction, then coating');
  await line2.getByLabel('Qty').fill('1');
  await line2.getByLabel('Price ($)').fill('900');
  await line2.getByLabel('Time (min)').fill('240');
  await page.getByRole('button', { name: 'Add custom line' }).click();
  const line3 = page.getByRole('listitem', { name: 'Line 3' });
  await line3.getByLabel('Line 3 name').fill('Wheel coating');
  await line3.getByLabel('Qty').fill('4');
  await line3.getByLabel('Price ($)').fill('25');
  await page.getByLabel('Discount ($, optional)').fill('40');
  await expect(page.getByRole('region', { name: 'Quote total' })).toContainText('$1,240');
  await expect(page.getByRole('region', { name: 'Quote total' })).toContainText('$1,200');
  await page.getByLabel('Job description and notes for the customer').fill('Full detail, then a 3-year ceramic coating.');
  await page.getByLabel('Terms (optional)').fill('Allow two days for curing.');
  await page.getByLabel('Internal notes').fill('SECRET: margin is thin');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  const quoteId = idFromUrl(page);
  expect(await quote(quoteId)).toMatchObject({ status: 'draft', subtotal_cents: 124000, discount_cents: 4000, total_cents: 120000, lead_id: leadId });

  // Preview = the customer's view; no internal notes.
  await page.getByRole('link', { name: 'Preview' }).click();
  await expect(page.getByRole('article', { name: /Quote #/ })).toContainText('$1,200');
  await expect(page.getByText('SECRET')).toHaveCount(0);
  await page.goBack();

  await page.getByRole('button', { name: 'Send quote' }).click();
  await expect(page.getByText('Quote sent.')).toBeVisible();
  const link = (await page.getByLabel('Quote link').textContent())!;
  expect(link).toMatch(/\/q\/[A-Za-z0-9_-]{43}$/);
  expect((await lead(leadId)).status).toBe('quote_sent');
  // Sent quotes are frozen: no editor any more.
  await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);

  // The customer, no account: sees everything except internal notes; accepts.
  const customer = await (await browser.newContext()).newPage();
  await asVisitor(customer);
  const res = await customer.goto(new URL(link).pathname);
  expect(res?.headers()['referrer-policy']).toBe('no-referrer');
  const doc = customer.getByRole('article', { name: /Quote #/ });
  for (const text of ['Northside Detail Co.', '2021 Tesla Model Y', 'Ceramic coating (3-year)', 'Paint correction, then coating', 'Wheel coating', '$1,200', 'Allow two days for curing.'])
    await expect(doc).toContainText(text);
  expect(await customer.content()).not.toContain('SECRET');
  await customer.getByRole('button', { name: 'Accept quote' }).click();
  await expect(customer.getByText(/You accepted this quote/)).toBeVisible();
  await expect(customer.getByRole('button', { name: 'Accept quote' })).toHaveCount(0);
  // Answering again changes nothing.
  await customer.reload();
  await expect(customer.getByText(/You accepted this quote/)).toBeVisible();
  expect((await quote(quoteId)).status).toBe('accepted');

  // The owner books it at an open time; the work and prices carry over.
  await page.goto('/app');
  await expect(page.getByRole('link', { name: '1 accepted quote to book' })).toBeVisible();
  await page.goto(`/app/quotes/${quoteId}`);
  const convert = page.getByRole('form', { name: 'Book this quote' });
  await expect(convert.getByLabel('Job length: hours')).toHaveValue('8'); // 4 h + 4 h; the wheel line has no time set
  await convert.getByLabel('Date').fill(dayAhead(5));
  await convert.getByLabel('Job length: hours').fill('4');
  await expect(convert.getByLabel('Start time').locator('option').first()).toBeAttached();
  await convert.getByLabel('Street address').fill('1234 Oak St');
  await convert.getByRole('button', { name: 'Book this quote' }).click();
  await expect(page.getByText('Appointment created.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Appointment' })).toContainText('Accepted quote');
  await expect(page.getByRole('region', { name: 'Services' })).toContainText('Ceramic coating (3-year)');
  const { rows: [appt] } = await db.query(`select estimated_total_cents, source, customer_id, quote_id from public.appointments where quote_id = $1`, [quoteId]);
  expect(appt).toMatchObject({ estimated_total_cents: 120000, source: 'quote' });
  expect(await quote(quoteId)).toMatchObject({ status: 'converted' });
  expect((await lead(leadId)).status).toBe('booked');
  // No new customer created at conversion: the quote's customer is the appointment's.
  expect(appt.customer_id).toBe((await quote(quoteId)).customer_id);

  // The customer, lead and quote all point at each other.
  await page.getByRole('link', { name: 'View quote' }).click();
  await expect(page.getByRole('heading', { name: /Quote #/ })).toContainText('Booked');
  await expect(page.getByRole('region', { name: 'Related' })).toContainText('Jordan Reyes');
  await page.getByRole('region', { name: 'Related' }).getByRole('link', { name: 'Jordan Reyes' }).first().click();
  await expect(page.getByRole('region', { name: 'Quotes' })).toContainText('Booked');
  await expect(page.getByRole('region', { name: 'Leads' })).toContainText('Converted');
  await expect(page.getByRole('region', { name: 'Appointments' })).toContainText('Accepted quote');
  void biz;
});

test('declined, expired and withdrawn quotes; existing customer; catalog changes never alter a quote', async ({ page, browser }) => {
  const biz = await bookableBusiness(page, 'qstates');
  const { rows: [dana] } = await db.query(
    `insert into public.customers (business_id, first_name, last_name, phone_e164) values ($1, 'Dana', 'Lopez', '+15125550301') returning id`,
    [biz.businessId],
  );
  await db.query(`insert into public.vehicles (business_id, customer_id, year, make, model, size_class_id) values ($1, $2, 2019, 'Toyota', 'Tacoma', $3)`, [biz.businessId, dana.id, biz.sizes.car]);

  const make = async () => {
    await page.goto(`/app/quotes/new?customer=${dana.id}`);
    await expect(page.getByText('Dana Lopez')).toBeVisible();
    await expect(page.getByLabel('2019 Toyota Tacoma')).toBeChecked();
    const add = page.getByLabel('Add from your services');
    await add.selectOption((await add.locator('option', { hasText: 'Full detail' }).getAttribute('value'))!);
    await expect(page.getByRole('listitem', { name: 'Line 1' }).getByLabel('Price ($)')).toHaveValue('180');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
    const id = idFromUrl(page);
    await page.getByRole('button', { name: 'Send quote' }).click();
    await expect(page.getByText('Quote sent.')).toBeVisible();
    return { id, path: new URL((await page.getByLabel('Quote link').textContent())!).pathname };
  };
  const customer = await (await browser.newContext()).newPage();
  await asVisitor(customer);

  // Catalog price changes after sending don't touch the quote.
  const a = await make();
  await db.query(`update public.services set base_price_cents = 99900 where id = $1`, [biz.services.fullDetail]);
  await customer.goto(a.path);
  await expect(customer.getByRole('article', { name: /Quote #/ })).toContainText('$180');
  // Decline.
  await customer.getByRole('button', { name: 'Decline', exact: true }).click();
  await customer.getByRole('group', { name: 'Decline quote' }).getByRole('button', { name: 'Decline quote' }).click();
  await expect(customer.getByText('You declined this quote.')).toBeVisible();
  expect((await quote(a.id)).status).toBe('declined');
  await page.goto(`/app/quotes/${a.id}`);
  await expect(page.getByRole('region', { name: 'History' })).toContainText('Customer declined the quote');
  await expect(page.getByRole('form', { name: 'Book this quote' })).toHaveCount(0);

  // Expired: past its date the link shows it, and it can't be accepted.
  await db.query(`update public.services set base_price_cents = 18000 where id = $1`, [biz.services.fullDetail]);
  const b = await make();
  await db.query(`update public.quotes set valid_until = current_date - 2 where id = $1`, [b.id]);
  await customer.goto(b.path);
  await expect(customer.getByText(/This quote has expired/)).toBeVisible();
  await expect(customer.getByRole('button', { name: 'Accept quote' })).toHaveCount(0);

  // Withdrawn: the link stops working; the quote is a draft again.
  const c = await make();
  await page.getByRole('button', { name: 'Withdraw' }).click();
  await page.getByRole('group', { name: 'Withdraw quote' }).getByRole('button', { name: 'Withdraw quote' }).click();
  await expect(page.getByRole('status').or(page.locator('[role=alert]')).getByText(/withdrawn/i).first()).toBeVisible();
  expect((await customer.goto(c.path))?.status()).toBe(404);
  await expect(customer.getByRole('heading', { name: 'This quote link isn’t valid' })).toBeVisible();
  expect(await quote(c.id)).toMatchObject({ status: 'draft', has_link: false });
  // Only one customer record for Dana throughout.
  const { rows: [{ n }] } = await db.query(`select count(*)::int as n from public.customers where business_id = $1`, [biz.businessId]);
  expect(n).toBe(1);
});

test('quote conversion never books an unavailable time', async ({ page, browser }) => {
  const biz = await bookableBusiness(page, 'qbusy');
  const { rows: [eli] } = await db.query(`insert into public.customers (business_id, first_name, phone_e164, address_line1) values ($1, 'Eli', '+15125550302', '12 Pine St') returning id`, [biz.businessId]);
  const { rows: [civic] } = await db.query(`insert into public.vehicles (business_id, customer_id, make, model, size_class_id) values ($1, $2, 'Honda', 'Civic', $3) returning id`, [biz.businessId, eli.id, biz.sizes.car]);
  // Something already booked on day 4 at 10:00.
  const busyStart = (await db.query(`select (((now() at time zone 'America/Chicago')::date + 4 + time '10:00') at time zone 'America/Chicago') as t`)).rows[0].t;
  await db.query(
    `insert into public.appointments (business_id, resource_id, customer_id, vehicle_id, starts_at, ends_at, location_type, service_address_line1, source)
     select $1, r.id, $2, $3, $4, $4::timestamptz + interval '3 hours', 'mobile', '12 Pine St', 'phone' from public.schedule_resources r where r.business_id = $1`,
    [biz.businessId, eli.id, civic.id, busyStart],
  );
  // A quote proposing exactly that time, accepted by the customer.
  await page.goto(`/app/quotes/new?customer=${eli.id}`);
  const add = page.getByLabel('Add from your services');
  await add.selectOption((await add.locator('option', { hasText: 'Full detail' }).getAttribute('value'))!);
  await page.getByLabel('Proposed date (optional)').fill(dayAhead(4));
  await page.getByLabel('Proposed time (optional)').fill('10:00');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  const quoteId = idFromUrl(page);
  await page.getByRole('button', { name: 'Send quote' }).click();
  const customer = await (await browser.newContext()).newPage();
  await asVisitor(customer);
  await customer.goto(new URL((await page.getByLabel('Quote link').textContent())!).pathname);
  await expect(customer.getByRole('article', { name: /Quote #/ })).toContainText('Proposed time');
  await customer.getByRole('button', { name: 'Accept quote' }).click();
  await expect(customer.getByText(/You accepted this quote/)).toBeVisible();

  await page.reload();
  const convert = page.getByRole('form', { name: 'Book this quote' });
  await expect(convert.getByText(/no longer open/)).toBeVisible();
  // Force the busy time anyway (typed): refused, nothing created.
  await convert.getByRole('button', { name: 'Enter a time that isn’t listed' }).click();
  await convert.getByLabel('Start time').fill('10:00');
  await convert.getByRole('button', { name: 'Book this quote' }).click();
  await expect(page.getByText('That time is already fully booked (including the buffer between jobs).')).toBeVisible();
  const { rows: [{ n }] } = await db.query(`select count(*)::int as n from public.appointments where quote_id = $1`, [quoteId]);
  expect(n).toBe(0);
  expect((await quote(quoteId)).status).toBe('accepted');
});

test('cross-business: B cannot open, edit or book A’s leads and quotes', async ({ page, browser }) => {
  const a = await bookableBusiness(page, 'lqA', { name: 'Alpha Auto Spa' });
  const leadId = await newLead(page);
  await page.getByRole('link', { name: 'Create quote' }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  const quoteId = idFromUrl(page);

  const pageB = await (await browser.newContext()).newPage();
  await bookableBusiness(pageB, 'lqB', { name: 'Bravo Detailing' });
  expect((await pageB.goto(`/app/leads/${leadId}`))?.status()).toBe(404);
  expect((await pageB.goto(`/app/quotes/${quoteId}`))?.status()).toBe(404);
  expect((await pageB.goto(`/app/quotes/${quoteId}/preview`))?.status()).toBe(404);
  await pageB.goto('/app/leads');
  await expect(pageB.getByText('Jordan Reyes')).toHaveCount(0);

  // Tamper: B saves its own new quote but posts it as A's quote id.
  await pageB.goto('/app/quotes/new');
  await pageB.getByRole('tab', { name: 'New customer' }).click();
  await pageB.getByLabel('First name').fill('Bravo');
  await pageB.getByRole('textbox', { name: 'Phone', exact: true }).fill('(512) 555-0998');
  await pageB.getByLabel('Make').fill('Ford');
  await pageB.getByLabel('Model').fill('Focus');
  await pageB.getByRole('button', { name: 'Add custom line' }).click();
  await pageB.getByLabel('Line 1 name').fill('Hijack');
  await pageB.getByRole('listitem', { name: 'Line 1' }).getByLabel('Price ($)').fill('1');
  await pageB.route('**/app/quotes/new', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST' || !req.headers()['next-action']) return route.continue();
    // Bound argument: the quote id (null for a new quote) → A's id.
    return route.continue({ postData: (req.postData() ?? '').replace('"$undefined"', `"${quoteId}"`).replace('[null', `["${quoteId}"`) });
  });
  await pageB.getByRole('button', { name: 'Save draft' }).click();
  await expect(pageB.getByText(/wasn’t found|weren’t accepted|Check the highlighted/)).toBeVisible();
  const { rows } = await db.query(`select q.business_id, (select count(*)::int from public.quote_items i where i.quote_id = q.id and i.name = 'Hijack') as hijacked from public.quotes q where q.id = $1`, [quoteId]);
  expect(rows[0]).toEqual({ business_id: a.businessId, hijacked: 0 });
});

for (const [width, height] of [[390, 844], [1280, 900]] as const) {
  test(`leads and quotes layout at ${width}px: no horizontal page scroll`, async ({ page, browser }) => {
    await page.setViewportSize({ width, height });
    await bookableBusiness(page, `lq${width}`);
    const leadId = await newLead(page);
    for (const [path, shot] of [['/app/leads', 'leads'], [`/app/leads/${leadId}`, 'lead'], [`/app/quotes/new?lead=${leadId}`, 'quote-new'], ['/app/follow-ups', 'follow-ups']] as const) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBe(0);
      await page.screenshot({ path: `test-results/p5-${shot}-${width}.png`, fullPage: true });
    }
    // The customer's quote page.
    await page.goto(`/app/quotes/new?lead=${leadId}`);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
    await page.getByRole('button', { name: 'Send quote' }).click();
    const link = (await page.getByLabel('Quote link').textContent())!;
    const customer = await (await browser.newContext({ viewport: { width, height } })).newPage();
    await asVisitor(customer);
    await customer.goto(new URL(link).pathname);
    expect(await customer.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    await customer.screenshot({ path: `test-results/p5-public-quote-${width}.png`, fullPage: true });
  });
}
