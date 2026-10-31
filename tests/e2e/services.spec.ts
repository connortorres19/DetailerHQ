import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, anon, cleanup, db } from './support';
import { ownerWithBusiness } from './support-app';

test.afterAll(cleanup);

async function serviceRows(businessId: string) {
  const { rows } = await db.query(
    `select s.name, s.price_type, s.base_price_cents, s.base_duration_min, s.is_addon, s.is_bookable, s.archived_at is not null as archived,
            c.name as category,
            coalesce((select json_agg(json_build_object('size', v.name, 'price', p.price_cents, 'min', p.duration_min) order by v.sort_order)
                        from public.service_prices p join public.vehicle_size_classes v on v.id = p.size_class_id
                       where p.service_id = s.id), '[]') as sizes
       from public.services s left join public.service_categories c on c.id = s.category_id
      where s.business_id = $1 order by s.name`,
    [businessId],
  );
  return rows;
}

const row = (page: Page, size: string) => page.getByRole('row', { name: new RegExp(`^${size}`) });

test('a package with vehicle-size pricing is stored in cents with per-size overrides', async ({ page }) => {
  const { businessId } = await ownerWithBusiness(page, 'svc');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Services' }).click();
  await expect(page.getByText('No services yet')).toBeVisible();
  await page.getByRole('link', { name: 'Add service' }).first().click();

  // Server-side validation messages.
  await page.getByLabel('Name', { exact: true }).fill('Full detail package');
  await page.getByLabel('Price', { exact: true }).fill('12.345');
  await page.getByRole('button', { name: 'Save service' }).click();
  await expect(page.getByText('Enter a price like 180 or 180.00.')).toBeVisible();

  await page.getByLabel('Price', { exact: true }).fill('260');
  await page.getByLabel('Description (optional)').fill('Interior and exterior, clay and sealant.');
  await page.getByLabel('Time hours', { exact: true }).selectOption('4');
  await page.getByLabel('Time minutes', { exact: true }).selectOption('0');
  // Large SUV / Truck: $320, 5h. Van: time only, 4h 30m. Car / Small SUV: blank → base.
  await row(page, 'Large SUV / Truck').getByLabel('Large SUV / Truck price').fill('320');
  await row(page, 'Large SUV / Truck').getByLabel('Large SUV / Truck time hours').selectOption('5');
  await row(page, 'Large SUV / Truck').getByLabel('Large SUV / Truck time minutes').selectOption('0');
  await row(page, 'Van').getByLabel('Van time hours').selectOption('4');
  await row(page, 'Van').getByLabel('Van time minutes').selectOption('30');
  await page.getByText('Customers can book this online').click();
  await page.getByRole('button', { name: 'Save service' }).click();

  await expect(page.getByText('Service added.')).toBeVisible();
  const item = page.getByRole('listitem').filter({ hasText: 'Full detail package' });
  await expect(item).toContainText('$260–$320');
  await expect(item).toContainText('4h–5h');
  await expect(item).toContainText('Online booking');

  expect(await serviceRows(businessId)).toEqual([
    {
      name: 'Full detail package', price_type: 'fixed', base_price_cents: 26000, base_duration_min: 240, is_addon: false, is_bookable: true,
      archived: false, category: null,
      sizes: [{ size: 'Large SUV / Truck', price: 32000, min: 300 }, { size: 'Van', price: null, min: 270 }],
    },
  ]);

  // The database prices a booking exactly as the editor promises (app.priced_services).
  const priced = await db.query(
    `select v.name, ps.price_cents, ps.duration_min
       from public.vehicle_size_classes v
       cross join lateral app.priced_services($1, array(select id from public.services where business_id = $1), v.id, true) ps
      where v.business_id = $1 order by v.sort_order`,
    [businessId],
  );
  expect(priced.rows).toEqual([
    { name: 'Car', price_cents: 26000, duration_min: 240 },
    { name: 'Small SUV', price_cents: 26000, duration_min: 240 },
    { name: 'Large SUV / Truck', price_cents: 32000, duration_min: 300 },
    { name: 'Van', price_cents: 26000, duration_min: 270 },
  ]);

  // Edit: clear the Van override (row removed), change the truck price (row updated).
  await item.getByRole('link', { name: 'Full detail package' }).click();
  await expect(page.getByLabel('Price', { exact: true })).toHaveValue('260');
  await expect(row(page, 'Large SUV / Truck').getByLabel('Large SUV / Truck price')).toHaveValue('320');
  await row(page, 'Van').getByLabel('Van time hours').selectOption('');
  await row(page, 'Van').getByLabel('Van time minutes').selectOption('');
  await row(page, 'Large SUV / Truck').getByLabel('Large SUV / Truck price').fill('335.50');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Service saved.')).toBeVisible();
  expect((await serviceRows(businessId))[0].sizes).toEqual([{ size: 'Large SUV / Truck', price: 33550, min: 300 }]);
});

test('quote-required services store no price and can’t be booked online; add-ons; archive and restore', async ({ page }) => {
  const { businessId } = await ownerWithBusiness(page, 'svcquote');
  await page.goto('/app/services/new');
  await page.getByLabel('Name', { exact: true }).fill('Ceramic coating');
  await page.getByText('Quote required', { exact: true }).click();
  await expect(page.getByLabel('Price', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(/Customers can book this online/)).toBeDisabled();
  await page.getByLabel('Time hours', { exact: true }).selectOption('8');
  await page.getByRole('button', { name: 'Save service' }).click();
  await expect(page.getByText('Service added.')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Ceramic coating' })).toContainText('Quote required');

  // Tampering: re-enable the disabled checkbox in the browser — the server still refuses.
  await page.getByRole('link', { name: 'Ceramic coating' }).click();
  await page.getByLabel(/Customers can book this online/).evaluate((el: HTMLInputElement) => { el.disabled = false; el.checked = true; });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/Quote-required services can’t be booked online/)).toBeVisible();

  await page.goto('/app/services/new');
  await page.getByLabel('Name', { exact: true }).fill('Pet hair removal');
  await page.getByLabel('Price', { exact: true }).fill('40');
  await page.getByLabel('Time hours', { exact: true }).selectOption('0');
  await page.getByLabel('Time minutes', { exact: true }).selectOption('45');
  await page.getByText('Add-on', { exact: true }).click();
  await page.getByText('Customers can book this online').click();
  await page.getByRole('button', { name: 'Save service' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Pet hair removal' })).toContainText('Add-on');

  const rows = await serviceRows(businessId);
  expect(rows.map((r) => [r.name, r.price_type, r.base_price_cents, r.base_duration_min, r.is_addon, r.is_bookable])).toEqual([
    ['Ceramic coating', 'quote_required', null, 480, false, false],
    ['Pet hair removal', 'fixed', 4000, 45, true, true],
  ]);

  // Archive → hidden from Active, in Archived → restore. Nothing deleted.
  await page.getByRole('link', { name: 'Pet hair removal' }).click();
  await page.getByRole('button', { name: 'Archive' }).click();
  await page.getByRole('button', { name: 'Archive service' }).click();
  await expect(page.getByText('Service archived.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pet hair removal' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Archived', exact: true }).click();
  await page.getByRole('link', { name: 'Pet hair removal' }).click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('button', { name: 'Restore service' }).click();
  await expect(page.getByText('Service restored.')).toBeVisible();
  expect((await serviceRows(businessId)).filter((r) => r.archived)).toEqual([]);
});

test('categories group and order services; only empty categories can be deleted', async ({ page }) => {
  const { businessId } = await ownerWithBusiness(page, 'svccat');
  await page.goto('/app/services');
  for (const name of ['Exterior', 'Interior']) {
    await page.getByLabel('New category name').fill(name);
    await page.getByRole('button', { name: 'Add category' }).click();
    await expect(page.getByText(`Category “${name}” added.`)).toBeVisible();
  }
  for (const [name, cat] of [['Maintenance wash', 'Exterior'], ['Interior reset', 'Interior'], ['Paint enhancement', 'Exterior']]) {
    await page.goto('/app/services/new');
    await page.getByLabel('Name', { exact: true }).fill(name!);
    await page.getByLabel('Category').selectOption({ label: cat! });
    await page.getByLabel('Price', { exact: true }).fill('65');
    await page.getByRole('button', { name: 'Save service' }).click();
    await expect(page.getByText('Service added.')).toBeVisible();
  }
  const exterior = page.getByRole('region', { name: 'Exterior' });
  await expect(exterior.getByRole('link')).toHaveText(['Maintenance wash', 'Paint enhancement']);
  await exterior.getByRole('button', { name: 'Move Paint enhancement up' }).click();
  await expect(page.getByRole('region', { name: 'Exterior' }).getByRole('link')).toHaveText(['Paint enhancement', 'Maintenance wash']);

  // Category order follows the categories panel.
  await page.getByRole('button', { name: 'Move Interior up' }).click();
  await expect(page.locator('section h2')).toHaveText(['Interior', 'Exterior', 'Categories']);

  // In-use categories can't be deleted (no button); an empty one can.
  await page.getByLabel('New category name').fill('Protection');
  await page.getByRole('button', { name: 'Add category' }).click();
  const categoriesPanel = page.getByRole('region', { name: 'Categories' });
  await expect(categoriesPanel.getByRole('listitem').filter({ hasText: 'Exterior' }).getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await categoriesPanel.getByRole('listitem').filter({ hasText: 'Protection' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete category' }).click();
  await expect(page.getByText('Category deleted.')).toBeVisible();
  const { rows } = await db.query('select name from public.service_categories where business_id = $1 order by sort_order', [businessId]);
  expect(rows.map((r) => r.name)).toEqual(['Interior', 'Exterior']);
});

test.describe('cross-business isolation for services', () => {
  test.describe.configure({ mode: 'serial' });
  let a: { businessId: string; serviceId: string; sizeId: string; categoryId: string };
  let b: { email: string; businessId: string; serviceId: string; categoryId: string };
  let pageB: Page;

  test.beforeAll(async ({ browser }) => {
    const pageA = await (await browser.newContext()).newPage();
    const ownerA = await ownerWithBusiness(pageA, 'svciso-a', 'Clearcoat Studio');
    const cat = await db.query(`insert into public.service_categories (business_id, name) values ($1, 'A only') returning id`, [ownerA.businessId]);
    const svc = await db.query(
      `insert into public.services (business_id, category_id, name, price_type, base_price_cents, base_duration_min, is_bookable)
       values ($1, $2, 'Secret A service', 'fixed', 99900, 120, true) returning id`,
      [ownerA.businessId, cat.rows[0].id],
    );
    const size = await db.query('select id from public.vehicle_size_classes where business_id = $1 order by sort_order limit 1', [ownerA.businessId]);
    await db.query('insert into public.service_prices (business_id, service_id, size_class_id, price_cents) values ($1, $2, $3, 123400)', [ownerA.businessId, svc.rows[0].id, size.rows[0].id]);
    a = { businessId: ownerA.businessId, serviceId: svc.rows[0].id, sizeId: size.rows[0].id, categoryId: cat.rows[0].id };
    await pageA.context().close();

    pageB = await (await browser.newContext()).newPage();
    const ownerB = await ownerWithBusiness(pageB, 'svciso-b');
    await pageB.goto('/app/services');
    await pageB.getByLabel('New category name').fill('B category');
    await pageB.getByRole('button', { name: 'Add category' }).click();
    await expect(pageB.getByText('Category “B category” added.')).toBeVisible();
    await pageB.goto('/app/services/new');
    await pageB.getByLabel('Name', { exact: true }).fill('B wash');
    await pageB.getByLabel('Price', { exact: true }).fill('50');
    await pageB.getByRole('button', { name: 'Save service' }).click();
    await expect(pageB.getByText('Service added.')).toBeVisible();
    const ids = await db.query(
      `select (select id from public.services where business_id = $1) as s, (select id from public.service_categories where business_id = $1) as c`,
      [ownerB.businessId],
    );
    b = { email: ownerB.email, businessId: ownerB.businessId, serviceId: ids.rows[0].s, categoryId: ids.rows[0].c };
  });

  test.afterEach(async () => {
    await pageB?.unrouteAll({ behavior: 'ignoreErrors' });
  });

  async function aUnchanged() {
    const { rows } = await db.query(
      `select s.name, s.base_price_cents, s.archived_at, (select json_agg(price_cents) from public.service_prices where service_id = s.id) as prices,
              (select name from public.service_categories where id = $2) as category
         from public.services s where s.id = $1`,
      [a.serviceId, a.categoryId],
    );
    expect(rows[0]).toEqual({ name: 'Secret A service', base_price_cents: 99900, archived_at: null, prices: [123400], category: 'A only' });
  }

  async function tamper(swaps: [string, string][]) {
    let done = false;
    await pageB.route('**/app/services**', async (route) => {
      const req = route.request();
      if (done || req.method() !== 'POST' || !req.headers()['next-action']) return route.continue();
      done = true;
      let body = req.postData() ?? '';
      for (const [from, to] of swaps) body = body.replaceAll(from, to);
      expect(body).toContain(swaps[0]![1]);
      return route.continue({ postData: body });
    });
  }

  test('B can’t open or list A’s services', async () => {
    expect((await pageB.goto(`/app/services/${a.serviceId}`))?.status()).toBe(404);
    for (const path of ['/app/services', '/app/services?view=archived', '/app/services/new']) {
      await pageB.goto(path);
      await expect(pageB.getByText('Secret A service')).toHaveCount(0);
      await expect(pageB.getByText('A only')).toHaveCount(0);
    }
  });

  test('tampered actions: edit / archive A’s service, use A’s category or size → refused, A unchanged', async () => {
    await pageB.goto(`/app/services/${b.serviceId}`);
    await tamper([[b.serviceId, a.serviceId]]);
    await pageB.getByLabel('Name', { exact: true }).fill('Hijacked');
    await pageB.getByRole('button', { name: 'Save changes' }).click();
    await expect(pageB.getByText('We couldn’t find that service.')).toBeVisible();

    await pageB.goto(`/app/services/${b.serviceId}`);
    await pageB.getByRole('button', { name: 'Archive' }).click();
    await tamper([[b.serviceId, a.serviceId]]);
    await pageB.getByRole('button', { name: 'Archive service' }).click();
    await expect(pageB.getByText('We couldn’t find that.')).toBeVisible();

    // A's category id in B's form → foreign key rejects it.
    await pageB.goto(`/app/services/${b.serviceId}`);
    await pageB.getByLabel('Category').selectOption({ label: 'B category' });
    await tamper([[b.categoryId, a.categoryId]]);
    await pageB.getByRole('button', { name: 'Save changes' }).click();
    await expect(pageB.getByText('That category or vehicle size isn’t in your account.')).toBeVisible();

    // A's vehicle size in B's price grid → rejected server-side before any write.
    await pageB.goto(`/app/services/${b.serviceId}`);
    const sizeInput = pageB.getByLabel('Car price');
    const bSize = (await sizeInput.getAttribute('name'))!.split('.')[1]!;
    await sizeInput.fill('77');
    await tamper([[bSize, a.sizeId]]);
    await pageB.getByRole('button', { name: 'Save changes' }).click();
    await expect(pageB.getByText('Unknown vehicle size.')).toBeVisible();

    await aUnchanged();
    const bRow = await db.query('select name, category_id from public.services where id = $1', [b.serviceId]);
    expect(bRow.rows[0]).toEqual({ name: 'B wash', category_id: null }); // B's own row untouched by the refused saves
  });

  test('Data API with B’s session can’t read or write A’s services, prices or categories', async () => {
    const client = anon();
    await client.auth.signInWithPassword({ email: b.email, password: PASSWORD });
    expect((await client.from('services').select('id').eq('id', a.serviceId)).data).toEqual([]);
    expect((await client.from('service_prices').select('service_id').eq('service_id', a.serviceId)).data).toEqual([]);
    expect((await client.from('service_categories').select('id').eq('id', a.categoryId)).data).toEqual([]);
    expect((await client.from('services').update({ base_price_cents: 1 }).eq('id', a.serviceId).select('id')).data).toEqual([]);
    expect((await client.from('service_prices').update({ price_cents: 1 }).eq('service_id', a.serviceId).select('service_id')).data).toEqual([]);
    expect((await client.from('service_prices').delete().eq('service_id', a.serviceId).select('service_id')).data ?? []).toEqual([]);

    const intoA = await client.from('services').insert({ business_id: a.businessId, name: 'X', price_type: 'fixed', base_price_cents: 1, base_duration_min: 60 });
    expect(intoA.error?.code).toBe('42501');
    // A's service with a size A hasn't priced → the composite FK rejects it (service must be B's).
    const otherSize = await db.query('select id from public.vehicle_size_classes where business_id = $1 and id <> $2 limit 1', [a.businessId, a.sizeId]);
    const priceOnA = await client.from('service_prices').insert({ business_id: b.businessId, service_id: a.serviceId, size_class_id: otherSize.rows[0].id, price_cents: 1 });
    expect(priceOnA.error?.code).toBe('23503');
    // Known Phase 1 schema finding (F-4A-1): for a (service, size) pair A HAS priced, the primary
    // key (service_id, size_class_id) is checked before the foreign key, so the error is 23505.
    // It reveals only that the pair exists, needs both of A's random UUIDs, and writes nothing.
    const existingPair = await client.from('service_prices').insert({ business_id: b.businessId, service_id: a.serviceId, size_class_id: a.sizeId, price_cents: 1 });
    expect(['23505', '23503']).toContain(existingPair.error?.code);
    const bWithASize = await client.from('service_prices').insert({ business_id: b.businessId, service_id: b.serviceId, size_class_id: a.sizeId, price_cents: 1 });
    expect(bWithASize.error?.code).toBe('23503');

    // Database rules hold even for direct writes: negative money, bookable quote, bad duration.
    for (const bad of [
      { base_price_cents: -1 },
      { price_type: 'quote_required', base_price_cents: null, is_bookable: true },
      { base_duration_min: 10 },
    ]) {
      const res = await client.from('services').update(bad as never).eq('id', b.serviceId).select('id');
      expect(res.error?.code, JSON.stringify(bad)).toBe('23514');
    }
    await aUnchanged();
  });
});
