import { expect, test, type Browser, type Page } from '@playwright/test';
import { PASSWORD, anon, cleanup, db } from './support';
import { ownerWithBusiness } from './support-app';

// Cross-business isolation through the real app. Owner A's records are created first; owner B
// then tries to reach them by URL, by search, by rewriting the record IDs that Next.js sends in
// server-action requests (bound arguments travel in plain text), and through the Data API with
// B's own session. Every attempt must fail and leave A's data untouched.

test.describe.configure({ mode: 'serial' });
test.afterAll(cleanup);

let a: { businessId: string; customerId: string; vehicleId: string };
let b: { email: string; customerId: string; vehicleId: string };
let pageB: Page;

async function newOwnerPage(browser: Browser) {
  const context = await browser.newContext();
  return context.newPage();
}

test.beforeAll(async ({ browser }) => {
  const pageA = await newOwnerPage(browser);
  const ownerA = await ownerWithBusiness(pageA, 'iso-a', 'Clearcoat Studio');
  const cust = await db.query(
    `insert into public.customers (business_id, first_name, last_name, phone_e164, notes)
     values ($1, 'Zelda', 'Onlyinbusinessa', '+15125550199', 'A private note') returning id`,
    [ownerA.businessId],
  );
  const veh = await db.query(
    `insert into public.vehicles (business_id, customer_id, make, model) values ($1, $2, 'Porsche', 'Taycan') returning id`,
    [ownerA.businessId, cust.rows[0].id],
  );
  a = { businessId: ownerA.businessId, customerId: cust.rows[0].id, vehicleId: veh.rows[0].id };
  await pageA.context().close();

  pageB = await newOwnerPage(browser);
  const ownerB = await ownerWithBusiness(pageB, 'iso-b', 'Northside Detail Co.');
  await pageB.goto('/app/customers/new');
  await pageB.getByLabel('First name').fill('Sam');
  await pageB.getByLabel('Phone').fill('(512) 555-0111');
  await pageB.getByRole('button', { name: 'Save customer' }).click();
  await expect(pageB.getByText('Customer added.')).toBeVisible();
  const customerId = pageB.url().split('/app/customers/')[1]!.split('?')[0]!;
  await pageB.getByRole('link', { name: 'Add vehicle' }).click();
  await pageB.getByLabel('Make', { exact: true }).fill('Honda');
  await pageB.getByLabel('Model', { exact: true }).fill('Odyssey');
  await pageB.getByRole('button', { name: 'Save vehicle' }).click();
  await expect(pageB.getByText('Vehicle added.')).toBeVisible();
  const { rows } = await db.query('select id from public.vehicles where customer_id = $1', [customerId]);
  b = { email: ownerB.email, customerId, vehicleId: rows[0].id };
});

async function aUnchanged() {
  const { rows } = await db.query(
    `select c.first_name, c.archived_at, c.notes, (select count(*)::int from public.vehicles v where v.customer_id = c.id) as vehicles,
            (select v.model from public.vehicles v where v.id = $2) as model
       from public.customers c where c.id = $1`,
    [a.customerId, a.vehicleId],
  );
  expect(rows[0]).toEqual({ first_name: 'Zelda', archived_at: null, notes: 'A private note', vehicles: 1, model: 'Taycan' });
}

test('B cannot open A’s customer or vehicle pages by URL (404)', async () => {
  for (const path of [
    `/app/customers/${a.customerId}`,
    `/app/customers/${a.customerId}/edit`,
    `/app/customers/${a.customerId}/vehicles/new`,
    `/app/customers/${a.customerId}/vehicles/${a.vehicleId}/edit`,
    `/app/customers/${b.customerId}/vehicles/${a.vehicleId}/edit`, // A's vehicle under B's customer
  ]) {
    const res = await pageB.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(pageB.getByText('Onlyinbusinessa')).toHaveCount(0);
  }
});

test('B’s list and search never include A’s customers', async () => {
  // Only result rows are checked: the empty state echoes the search text back ("No matches for …").
  await pageB.goto('/app/customers');
  await expect(pageB.locator('tbody tr')).toHaveText([/Sam/]);
  for (const q of ['Zelda', 'Onlyinbusinessa', '5550199']) {
    await pageB.goto(`/app/customers?q=${encodeURIComponent(q)}`);
    await expect(pageB.locator('tbody tr')).toHaveCount(0);
    await expect(pageB.getByText(`No matches for “${q}”`)).toBeVisible();
  }
  await pageB.goto('/app/customers?view=archived&q=Zelda');
  await expect(pageB.locator('tbody tr')).toHaveCount(0);
});

// Rewrites B's own record IDs to A's in the next server-action POST from `pageB`.
async function tamperNextAction(swaps: [string, string][]) {
  let done = false;
  await pageB.route('**/app/customers/**', async (route) => {
    const req = route.request();
    if (done || req.method() !== 'POST' || !req.headers()['next-action']) return route.continue();
    done = true;
    let body = req.postData() ?? '';
    for (const [from, to] of swaps) body = body.replaceAll(from, to);
    expect(body).toContain(swaps[0]![1]); // the rewrite really happened
    return route.continue({ postData: body });
  });
}

test.afterEach(async () => {
  await pageB?.unrouteAll({ behavior: 'ignoreErrors' });
});

test('tampered server action: B “edits” A’s customer → not found, A unchanged', async () => {
  await pageB.goto(`/app/customers/${b.customerId}/edit`);
  await tamperNextAction([[b.customerId, a.customerId]]);
  await pageB.getByLabel('First name').fill('Hijacked');
  await pageB.getByRole('button', { name: 'Save changes' }).click();
  await expect(pageB.getByText('We couldn’t find that record.')).toBeVisible();
  await aUnchanged();
});

test('tampered server action: B “archives” A’s customer → not found, A unchanged', async () => {
  await pageB.goto(`/app/customers/${b.customerId}`);
  await pageB.getByRole('button', { name: 'Archive' }).first().click();
  await tamperNextAction([[b.customerId, a.customerId]]);
  await pageB.getByRole('button', { name: 'Archive customer' }).click();
  await expect(pageB).toHaveURL(/\/app\/customers\?missing=1/);
  await aUnchanged();
});

test('tampered server action: B adds a vehicle to A’s customer → rejected, nothing inserted', async () => {
  await pageB.goto(`/app/customers/${b.customerId}/vehicles/new`);
  await tamperNextAction([[b.customerId, a.customerId]]);
  await pageB.getByLabel('Make', { exact: true }).fill('Injected');
  await pageB.getByLabel('Model', { exact: true }).fill('Car');
  await pageB.getByRole('button', { name: 'Save vehicle' }).click();
  await expect(pageB.getByText('We couldn’t find that record.')).toBeVisible();
  const { rows } = await db.query(`select count(*)::int as n from public.vehicles where make = 'Injected'`);
  expect(rows[0].n).toBe(0);
  await aUnchanged();
});

test('tampered server action: B edits and archives A’s vehicle → not found, A unchanged', async () => {
  await pageB.goto(`/app/customers/${b.customerId}/vehicles/${b.vehicleId}/edit`);
  await tamperNextAction([[b.customerId, a.customerId], [b.vehicleId, a.vehicleId]]);
  await pageB.getByLabel('Model', { exact: true }).fill('Hijacked');
  await pageB.getByRole('button', { name: 'Save changes' }).click();
  await expect(pageB.getByText('We couldn’t find that record.')).toBeVisible();

  await pageB.goto(`/app/customers/${b.customerId}`);
  await pageB.locator('li', { hasText: 'Honda Odyssey' }).getByRole('button', { name: 'Archive' }).click();
  await tamperNextAction([[b.customerId, a.customerId], [b.vehicleId, a.vehicleId]]);
  await pageB.getByRole('button', { name: 'Archive vehicle' }).click();
  await expect(pageB).toHaveURL(/\/app\/customers\?missing=1/);
  const { rows } = await db.query('select archived_at from public.vehicles where id = $1', [a.vehicleId]);
  expect(rows[0].archived_at).toBeNull();
  await aUnchanged();
});

test('Data API with B’s own session: A’s rows are invisible and unwritable', async () => {
  const client = anon();
  const { error: signInError } = await client.auth.signInWithPassword({ email: b.email, password: PASSWORD });
  expect(signInError).toBeNull();

  const read = await client.from('customers').select('id').eq('id', a.customerId);
  expect(read.data).toEqual([]);
  const vehicles = await client.from('vehicles').select('id').eq('id', a.vehicleId);
  expect(vehicles.data).toEqual([]);
  const business = await client.from('businesses').select('id').eq('id', a.businessId);
  expect(business.data).toEqual([]);

  const update = await client.from('customers').update({ notes: 'pwned' }).eq('id', a.customerId).select('id');
  expect(update.data).toEqual([]);

  const insertIntoA = await client.from('customers').insert({ business_id: a.businessId, first_name: 'X', phone_e164: '+15125550123' });
  expect(insertIntoA.error?.code).toBe('42501'); // RLS with-check

  const { rows } = await db.query('select business_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = $1', [b.email]);
  const crossVehicle = await client.from('vehicles').insert({ business_id: rows[0].business_id, customer_id: a.customerId, make: 'X', model: 'Y' });
  expect(crossVehicle.error?.code).toBe('23503'); // composite FK: customer must be in the same business

  const del = await client.from('customers').delete().eq('id', a.customerId).select('id');
  expect(del.data ?? []).toEqual([]);
  await aUnchanged();
});
