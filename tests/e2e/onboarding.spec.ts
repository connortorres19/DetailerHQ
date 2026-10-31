import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, cleanup, createConfirmedUser, db, uniqueEmail } from './support';

test.afterAll(cleanup);

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
}

const slugFor = (tag: string) => `e2e-${tag}-${Math.random().toString(36).slice(2, 8)}`;

test('mobile business: one call creates the workspace with capacity 1 and activates it', async ({ page }) => {
  const email = uniqueEmail('onboard-mobile');
  const user = await createConfirmedUser(email);
  await signIn(page, email);

  await page.getByLabel('Business name').fill('Northside Detail Co.');
  await expect(page.getByLabel('Booking link')).toHaveValue('northside-detail-co');
  await expect(page.getByText('/book/northside-detail-co')).toBeVisible(); // the real public route
  const slug = slugFor('northside');
  await page.getByLabel('Booking link').fill(slug);
  await page.getByLabel('Time zone').selectOption('America/Chicago');
  await expect(page.getByText('Mobile businesses take one job at a time.')).toBeVisible();
  await page.getByLabel('Business phone').fill('(512) 555-0142');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/app$/);

  const { rows } = await db.query(
    `select b.name, b.slug, b.timezone, b.service_mode, b.phone_e164, b.account_status,
            (select capacity from public.schedule_resources r where r.business_id = b.id) as capacity,
            (select count(*)::int from public.vehicle_size_classes s where s.business_id = b.id) as sizes
       from public.businesses b join public.memberships m on m.business_id = b.id where m.user_id = $1`,
    [user.id],
  );
  expect(rows[0]).toMatchObject({
    name: 'Northside Detail Co.', slug, timezone: 'America/Chicago', service_mode: 'mobile',
    phone_e164: '+15125550142', account_status: 'pilot', capacity: 1, sizes: 4,
  });

  // Onboarding is done: going back sends the owner to the app.
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/app$/);
});

test('shop business: capacity is required and saved; field errors keep what was typed', async ({ page }) => {
  const email = uniqueEmail('onboard-shop');
  const user = await createConfirmedUser(email);
  await signIn(page, email);

  await page.getByLabel('Business name').fill('Clearcoat Studio');
  await page.getByLabel('Booking link').fill('a'); // too short
  await page.getByLabel('Time zone').selectOption('America/Denver');
  await page.getByText('Shop', { exact: true }).click();
  await page.getByLabel('Jobs you can work on at the same time').fill('25');
  await page.getByLabel('Business phone').fill('555-12');
  await page.getByRole('button', { name: 'Create workspace' }).click();

  await expect(page.getByText('Use 3–40 lowercase letters')).toBeVisible();
  await expect(page.getByText('Enter a number from 1 to 20.')).toBeVisible();
  await expect(page.getByText('Enter a 10-digit US phone number.')).toBeVisible();
  await expect(page.getByLabel('Business name')).toHaveValue('Clearcoat Studio');

  await page.getByLabel('Booking link').fill(slugFor('clearcoat'));
  await page.getByLabel('Jobs you can work on at the same time').fill('2');
  await page.getByLabel('Business phone').fill('');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/app$/);

  const { rows } = await db.query(
    `select b.service_mode, (select capacity from public.schedule_resources r where r.business_id = b.id) as capacity
       from public.businesses b join public.memberships m on m.business_id = b.id where m.user_id = $1`,
    [user.id],
  );
  expect(rows[0]).toMatchObject({ service_mode: 'shop', capacity: 2 });
});

test('a booking link that is taken or reserved is rejected by the database', async ({ page }) => {
  const first = uniqueEmail('slug-a');
  await createConfirmedUser(first);
  await signIn(page, first);
  const slug = slugFor('taken');
  await page.getByLabel('Business name').fill('First Detail');
  await page.getByLabel('Booking link').fill(slug);
  await page.getByLabel('Time zone').selectOption('America/New_York');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByRole('button', { name: 'Sign out' }).click();

  const second = uniqueEmail('slug-b');
  await createConfirmedUser(second);
  await signIn(page, second);
  await page.getByLabel('Business name').fill('Second Detail');
  await page.getByLabel('Booking link').fill(slug);
  await page.getByLabel('Time zone').selectOption('America/New_York');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByText('That link is already in use. Try another.')).toBeVisible();

  await page.getByLabel('Booking link').fill('admin');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByText('That link is reserved. Try another.')).toBeVisible();
});
