import { expect, type Page } from '@playwright/test';
import { PASSWORD, createConfirmedUser, db, uniqueEmail } from './support';

// Creates a confirmed owner with a business through the real onboarding UI, signed in on `page`.
export async function ownerWithBusiness(page: Page, tag: string, name = 'Northside Detail Co.') {
  const email = uniqueEmail(tag);
  const user = await createConfirmedUser(email);
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel('Business name').fill(name);
  await page.getByLabel('Booking link').fill(`e2e-${tag}-${Math.random().toString(36).slice(2, 8)}`);
  await page.getByLabel('Time zone').selectOption('America/Chicago');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/app$/);
  const { rows } = await db.query('select business_id from public.memberships where user_id = $1', [user.id]);
  return { email, userId: user.id, businessId: rows[0].business_id as string };
}
