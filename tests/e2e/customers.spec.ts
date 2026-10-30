import { expect, test } from '@playwright/test';
import { cleanup, db } from './support';
import { ownerWithBusiness } from './support-app';

test.afterAll(cleanup);

test('add, find, edit and archive customers with real data', async ({ page }) => {
  const { businessId } = await ownerWithBusiness(page, 'cust');
  await page.goto('/app/customers');
  await expect(page.getByText('No customers yet')).toBeVisible();
  await page.getByRole('link', { name: 'Add customer' }).first().click();

  // A phone or email is required (the table's check, shown as a field error).
  await page.getByLabel('First name').fill('Jordan');
  await page.getByLabel('Last name').fill('Reyes');
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByText('Add a phone number or an email so you can reach them.')).toBeVisible();

  await page.getByLabel('Phone').fill('512.555.0142');
  await page.getByLabel('Email').fill('Jordan.Reyes@Example.com');
  await page.getByLabel('Prefers').selectOption('text');
  await page.getByLabel('State').fill('tx');
  await page.getByLabel('Notes').fill('Gate code 4471');
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByText('Customer added.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Jordan Reyes' })).toBeVisible();
  await expect(page.getByText('(512) 555-0142')).toBeVisible();

  const { rows } = await db.query('select phone_e164, email, state, preferred_contact, notes from public.customers where business_id = $1', [businessId]);
  expect(rows).toEqual([{ phone_e164: '+15125550142', email: 'jordan.reyes@example.com', state: 'TX', preferred_contact: 'text', notes: 'Gate code 4471' }]);

  // Duplicate warning: same phone in this business; "Create anyway" still works.
  await page.goto('/app/customers/new');
  await page.getByLabel('First name').fill('J.');
  await page.getByLabel('Phone').fill('(512) 555-0142');
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByText('A customer with this phone number or email already exists.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Jordan Reyes' })).toBeVisible();
  await page.getByRole('button', { name: 'Create anyway' }).click();
  await expect(page.getByText('Customer added.')).toBeVisible();

  // Second customer for search.
  await page.goto('/app/customers/new');
  await page.getByLabel('First name').fill('Priya');
  await page.getByLabel('Last name').fill('Natarajan');
  await page.getByLabel('Email').fill('priya@example.com');
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByText('Customer added.')).toBeVisible();

  const search = async (q: string) => {
    await page.goto(`/app/customers?q=${encodeURIComponent(q)}`);
    return page.locator('tbody tr').allInnerTexts();
  };
  expect((await search('priya')).join()).toContain('Priya Natarajan');
  expect((await search('jordan reyes')).join()).toContain('Jordan Reyes');
  expect(await search('5550142')).toHaveLength(2); // phone digits
  expect((await search('priya@')).length).toBe(1);
  await search('tacoma');
  await expect(page.getByText('No matches for “tacoma”')).toBeVisible();
  await search('x),or(id.not.is.null'); // PostgREST filter syntax is neutralised, not executed
  await expect(page.getByText(/No matches for/)).toBeVisible();

  // Edit.
  await page.goto('/app/customers?q=priya');
  await page.getByRole('link', { name: 'Priya Natarajan' }).click();
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Last name').fill('Natarajan-Shah');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Priya Natarajan-Shah' })).toBeVisible();

  // Archive → hidden from Active, listed under Archived → restore.
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText(/Nothing is deleted, and you can restore them/)).toBeVisible();
  await page.getByRole('button', { name: 'Archive customer' }).click();
  await expect(page.getByText('Customer archived.')).toBeVisible();
  await page.goto('/app/customers');
  await expect(page.getByRole('link', { name: 'Priya Natarajan-Shah' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Archived', exact: true }).click();
  await page.getByRole('link', { name: 'Priya Natarajan-Shah' }).click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('button', { name: 'Restore customer' }).click();
  await expect(page.getByText('Customer restored.')).toBeVisible();

  const counts = await db.query('select count(*)::int as n, count(archived_at)::int as archived from public.customers where business_id = $1', [businessId]);
  expect(counts.rows[0]).toEqual({ n: 3, archived: 0 }); // nothing was deleted
});

test('multiple vehicles per customer: add with size, edit, archive and restore', async ({ page }) => {
  const { businessId } = await ownerWithBusiness(page, 'veh');
  await page.goto('/app/customers/new');
  await page.getByLabel('First name').fill('Marcus');
  await page.getByLabel('Last name').fill('Bell');
  await page.getByLabel('Phone').fill('(512) 555-0177');
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByText('No vehicles yet')).toBeVisible();

  await page.getByRole('link', { name: 'Add vehicle' }).click();
  await page.getByRole('button', { name: 'Save vehicle' }).click();
  await expect(page.getByText('Enter the make, e.g. Toyota.')).toBeVisible();
  await page.getByLabel('Year', { exact: true }).fill('2019');
  await page.getByLabel('Make', { exact: true }).fill('Toyota');
  await page.getByLabel('Model', { exact: true }).fill('Tacoma');
  await page.getByLabel('Trim', { exact: true }).fill('TRD');
  await page.getByLabel('Color', { exact: true }).fill('Gray');
  await page.getByLabel('Plate', { exact: true }).fill('lkt4821');
  await page.getByText('Large SUV / Truck').click();
  await page.getByRole('button', { name: 'Save vehicle' }).click();
  await expect(page.getByText('Vehicle added.')).toBeVisible();
  await expect(page.getByText('2019 Toyota Tacoma TRD')).toBeVisible();
  await expect(page.getByText('Gray · Large SUV / Truck · LKT4821')).toBeVisible();

  await page.getByRole('link', { name: 'Add vehicle' }).click();
  await page.getByLabel('Year', { exact: true }).fill('2016');
  await page.getByLabel('Make', { exact: true }).fill('BMW');
  await page.getByLabel('Model', { exact: true }).fill('340i');
  await page.getByRole('button', { name: 'Save vehicle' }).click();
  await expect(page.getByRole('heading', { name: 'Vehicles · 2' })).toBeVisible();

  // Edit the BMW.
  await page.locator('li', { hasText: '2016 BMW 340i' }).getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Color', { exact: true }).fill('Black');
  await page.getByText('Car', { exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Vehicle saved.')).toBeVisible();
  await expect(page.getByText('Black · Car')).toBeVisible();

  // Archive the Tacoma (sold), then restore it.
  await page.locator('li', { hasText: '2019 Toyota Tacoma TRD' }).getByRole('button', { name: 'Archive' }).click();
  await page.getByRole('button', { name: 'Archive vehicle' }).click();
  await expect(page.getByText('Vehicle archived.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vehicles · 1' })).toBeVisible();
  await page.getByText('Archived vehicles · 1').click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('button', { name: 'Restore vehicle' }).click();
  await expect(page.getByRole('heading', { name: 'Vehicles · 2' })).toBeVisible();

  const { rows } = await db.query(
    `select v.make, v.plate, v.color, s.name as size from public.vehicles v
       left join public.vehicle_size_classes s on s.id = v.size_class_id where v.business_id = $1 order by v.make`,
    [businessId],
  );
  expect(rows).toEqual([
    { make: 'BMW', plate: null, color: 'Black', size: 'Car' },
    { make: 'Toyota', plate: 'LKT4821', color: 'Gray', size: 'Large SUV / Truck' },
  ]);

  // Today reflects the real customer count.
  await page.goto('/app');
  await expect(page.getByText('1 active customer')).toBeVisible();
});
