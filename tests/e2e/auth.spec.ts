import { expect, test } from '@playwright/test';
import { PASSWORD, anon, cleanup, createConfirmedUser, invite, linkFromEmail, track, uniqueEmail } from './support';

test.afterAll(cleanup);

test.describe('invite-only registration', () => {
  test('sign-up page explains early access is invite-only', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.getByRole('heading', { name: 'Early access is invite-only' })).toBeVisible();
    await expect(page.locator('input[name="password"]')).toHaveCount(0);
  });

  test('Supabase itself rejects public sign-ups (not just the UI)', async () => {
    const { data, error } = await anon().auth.signUp({ email: uniqueEmail('blocked'), password: PASSWORD });
    if (data.user) track(data.user.id);
    expect(error?.code).toBe('signup_disabled');
  });
});

test('invited owner accepts the invite, sets a password and lands in onboarding', async ({ page }) => {
  const email = uniqueEmail('invite');
  await invite(email);
  const link = await linkFromEmail(email, /invited/i);
  expect(link).toContain('/auth/confirm?token_hash=');

  await page.goto(link);
  await expect(page).toHaveURL(/\/auth\/set-password$/);
  await expect(page.getByText(`You’re setting up DetailerHQ for ${email}`)).toBeVisible();

  await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill('something-else-123');
  await page.getByRole('button', { name: 'Save password and continue' }).click();
  await expect(page.getByText('The passwords don’t match.')).toBeVisible();

  await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Save password and continue' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  // The invite link works once.
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page).toHaveURL(/\/sign-in\?error=link/);
  await expect(page.getByText('That link is invalid or has expired')).toBeVisible();

  // And the new password signs in.
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
});

test.describe('sign in and sign out', () => {
  test('wrong password is rejected; correct password signs in; sign out ends the session', async ({ page }) => {
    const email = uniqueEmail('signin');
    await createConfirmedUser(email);

    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('That email and password don’t match an account.')).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveValue(email); // kept after the failed attempt

    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/onboarding$/); // no business yet
    await expect(page.getByRole('heading', { name: 'Set up your business' })).toBeVisible();

    // Signed-in owners skip the sign-in page.
    await page.goto('/sign-in');
    await expect(page).not.toHaveURL(/\/sign-in/);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in\?signed-out=1/);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp/);
  });

  test('protected pages redirect to sign-in and come back afterwards', async ({ page }) => {
    const email = uniqueEmail('next');
    await createConfirmedUser(email);
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fonboarding/);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test('an off-site `next` is ignored (no open redirect)', async ({ page }) => {
    const email = uniqueEmail('redirect');
    await createConfirmedUser(email);
    await page.goto('/sign-in?next=//evil.example.com/steal');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/localhost:3000\/onboarding$/);
  });

  test('an unconfirmed email cannot sign in', async ({ page }) => {
    const email = uniqueEmail('unconfirmed');
    await invite(email); // invited but never accepted: no password, not confirmed
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toBeVisible(); // not Next's route announcer
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test('password reset by email', async ({ page }) => {
  const email = uniqueEmail('reset');
  await createConfirmedUser(email);
  const newPassword = 'a-brand-new-password-7';

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('If an account exists for that email')).toBeVisible();

  // Unknown emails get the identical answer.
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(uniqueEmail('nobody'));
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('If an account exists for that email')).toBeVisible();

  const link = await linkFromEmail(email, /reset/i);
  await page.goto(link);
  await expect(page).toHaveURL(/\/auth\/reset-password$/);
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm password').fill(newPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page).toHaveURL(/\/onboarding$/); // /app → no business yet → onboarding

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in\?signed-out=1/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That email and password don’t match an account.')).toBeVisible();
  await page.getByLabel('Password').fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
});

test('authenticated responses are never cached and carry a CSP', async ({ request }) => {
  const res = await request.get('/sign-in');
  expect(res.headers()['cache-control']).toContain('no-store');
  expect(res.headers()['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(res.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
});
