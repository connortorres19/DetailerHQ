import { expect, test } from '@playwright/test';
import { cleanup } from './support';
import { ownerWithBusiness } from './support-app';

test.afterAll(cleanup);

test('Today shows real, empty state for a new business and only working navigation', async ({ page }) => {
  await ownerWithBusiness(page, 'today', 'Ridgeway Mobile Detailing');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await expect(page.getByText('Nothing scheduled today')).toBeVisible();
  await expect(page.getByText('No jobs scheduled this week.')).toBeVisible();
  await expect(page.getByText('No customers yet.')).toBeVisible();
  await expect(page.getByText('Needs your action')).toHaveCount(0); // hidden when nothing is pending

  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveText(['Today', 'Customers', 'Services', 'Availability', 'Booking page', 'Settings']);
  await expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Ridgeway Mobile Detailing').first()).toBeVisible();

  // Setup checklist reflects real data: workspace done, contact details done (email prefilled), customer to do.
  const setup = page.getByRole('region', { name: 'Setup checklist' });
  await expect(setup.getByRole('listitem')).toHaveText([
    /Create your workspace\(done\)/,
    /Add business contact details\(done\)/,
    /Add your first customer\(to do\)/,
    /Add your services\(to do\)/,
    /Set your working hours\(to do\)/,
    /Put your booking page live\(to do\)/,
  ]);
});

for (const [width, height] of [[1280, 800], [820, 1180], [390, 844]] as const) {
  test(`shell layout at ${width}px has no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await ownerWithBusiness(page, `shell${width}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Customers' })).toBeVisible();
    await page.screenshot({ path: `test-results/shell-${width}.png`, fullPage: true });
  });
}
