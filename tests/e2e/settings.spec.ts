import { expect, test } from '@playwright/test';
import { PASSWORD, cleanup, createConfirmedUser, db, linkFromEmail, uniqueEmail } from './support';
import { ownerWithBusiness } from './support-app';

test.afterAll(cleanup);

test('business details save to the database; setup-only fields are read-only', async ({ page }) => {
  const { businessId } = await ownerWithBusiness(page, 'settings', 'Ridgeway Mobile Detailing');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/app\/settings$/);

  await page.getByLabel('Business name').fill('Ridgeway Mobile Detailing LLC');
  await page.getByLabel('Business phone').fill('512-555-0188');
  await page.getByLabel('Service area').fill('North Austin & Round Rock');
  await page.getByRole('button', { name: 'Save business details' }).click();
  await expect(page.getByText('Business details saved.')).toBeVisible();
  await expect(page.getByText('Ridgeway Mobile Detailing LLC').first()).toBeVisible(); // sidebar refreshed

  const { rows } = await db.query('select name, phone_e164, service_area_text from public.businesses where id = $1', [businessId]);
  expect(rows[0]).toEqual({ name: 'Ridgeway Mobile Detailing LLC', phone_e164: '+15125550188', service_area_text: 'North Austin & Round Rock' });

  // Slug / time zone / mode are shown, not editable; mobile capacity is fixed at 1.
  await expect(page.getByText('Central Time')).toBeVisible();
  await expect(page.getByLabel('Booking link')).toHaveCount(0);
  await expect(page.getByText('Mobile businesses take one job at a time.')).toBeVisible();
  await expect(page.getByLabel('Jobs you can work on at the same time')).toHaveCount(0);

  await page.getByLabel('Business phone').fill('12345');
  await page.getByRole('button', { name: 'Save business details' }).click();
  await expect(page.getByText('Enter a 10-digit US phone number.')).toBeVisible();
});

test('shop capacity goes through set_capacity and is validated', async ({ page }) => {
  const email = uniqueEmail('capacity');
  const user = await createConfirmedUser(email);
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Business name').fill('Clearcoat Studio');
  await page.getByLabel('Booking link').fill(`e2e-cap-${Math.random().toString(36).slice(2, 8)}`);
  await page.getByLabel('Time zone').selectOption('America/Chicago');
  await page.getByText('Shop', { exact: true }).click();
  await page.getByLabel('Jobs you can work on at the same time').fill('2');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/app/settings');
  const field = page.getByLabel('Jobs you can work on at the same time');
  await expect(field).toHaveValue('2');
  await field.fill('21');
  await page.getByRole('button', { name: 'Save capacity' }).click();
  await expect(page.getByText('Enter a number from 1 to 20.')).toBeVisible();
  await field.fill('3');
  await page.getByRole('button', { name: 'Save capacity' }).click();
  await expect(page.getByText('Capacity saved.')).toBeVisible();

  const { rows } = await db.query(
    `select r.capacity from public.schedule_resources r join public.memberships m on m.business_id = r.business_id
      where m.user_id = $1 and r.kind = 'general' and r.active`,
    [user.id],
  );
  expect(rows[0].capacity).toBe(3);
});

test('change password requires the current password', async ({ page }) => {
  const { email } = await ownerWithBusiness(page, 'password');
  await page.goto('/app/settings/account');
  const newPassword = 'another-strong-password-9';

  await page.getByLabel('Current password').fill('wrong-password');
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password').fill(newPassword);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('That isn’t your current password.').first()).toBeVisible();

  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password').fill(newPassword);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed.')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).last().click();
  await expect(page).toHaveURL(/\/sign-in\?signed-out=1/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test('change email: confirmed from both inboxes before it applies', async ({ page }) => {
  const { email, userId } = await ownerWithBusiness(page, 'email');
  const newEmail = uniqueEmail('newaddress');
  await page.goto('/app/settings/account');
  await page.getByLabel('New email').fill(newEmail);
  await page.getByRole('button', { name: 'Change email' }).click();
  await expect(page.getByText(`We sent confirmation links to ${email} and ${newEmail}`)).toBeVisible();

  const pending = await db.query('select email, email_change from auth.users where id = $1', [userId]);
  expect(pending.rows[0]).toEqual({ email, email_change: newEmail }); // not applied yet

  await page.goto(await linkFromEmail(newEmail, /new .*email/i));
  await page.goto(await linkFromEmail(email, /new .*email/i));
  await expect(page).toHaveURL(/\/app\/settings\/account$/);
  const done = await db.query('select email from auth.users where id = $1', [userId]);
  expect(done.rows[0].email).toBe(newEmail);
});
