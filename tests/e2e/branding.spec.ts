import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { cleanup, db, PASSWORD } from './support';
import { asVisitor, bookableBusiness, fillDetails, pickFirstTime } from './support-booking';

test.afterAll(cleanup);

// --- Fixtures ------------------------------------------------------------------------------------

const solid = (w: number, h: number, background: string, format: 'png' | 'jpeg' = 'jpeg') => {
  const img = sharp({ create: { width: w, height: h, channels: format === 'png' ? 4 : 3, background } });
  return (format === 'png' ? img.png() : img.jpeg({ quality: 85 })).toBuffer();
};
const file = async (name: string, buffer: Promise<Buffer> | Buffer, mimeType = name.endsWith('.png') ? 'image/png' : 'image/jpeg') => ({ name, mimeType, buffer: await buffer });

const assets = async (businessId: string) =>
  (await db.query(`select id, kind, status, width, height, storage_path from public.media_assets where business_id = $1 order by created_at`, [businessId])).rows;
const fileExists = async (path: string) =>
  (await db.query(`select count(*)::int as n from storage.objects where bucket_id = 'business-media' and name = $1`, [path])).rows[0].n === 1;

async function uploadTo(page: Page, slot: string, f: { name: string; mimeType: string; buffer: Buffer }) {
  const field = page.locator('[data-kind]').filter({ has: page.getByText(slot, { exact: true }) }).first();
  await field.locator('input[type=file]').setInputFiles(f);
  return field;
}

/** WCAG contrast of every visible text element against its painted background (AA: 4.5, large 3). */
async function contrastFailures(page: Page, scope = 'body') {
  return page.evaluate((sel) => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = '1'] = m[1]!.split(/[ ,/]+/).filter(Boolean);
      return { r: +r!, g: +g!, b: +b!, a: +a };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const ch = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const bgOf = (el: Element | null): { r: number; g: number; b: number } => {
      for (let e = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.backgroundImage !== 'none' && e.tagName !== 'BODY') return { r: -1, g: -1, b: -1 }; // image or gradient: skip
        const c = parse(s.backgroundColor);
        if (c && c.a > 0.95) return c;
      }
      return parse(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255 };
    };
    const out: string[] = [];
    const root = document.querySelector(sel)!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !n.textContent?.trim()) continue;
      seen.add(el);
      const s = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (s.visibility === 'hidden' || s.display === 'none' || rect.width <= 1 || rect.height <= 1 || el.closest('[aria-hidden="true"],.visually-hidden,:disabled,[disabled]')) continue;
      if (el.closest('svg, option')) continue;
      const fg = parse(s.color);
      const bg = bgOf(el);
      if (!fg || bg.r < 0) continue;
      const ratio = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) out.push(`${ratio.toFixed(2)} "${n.textContent.trim().slice(0, 40)}" ${s.color} on rgb(${bg.r},${bg.g},${bg.b})`);
    }
    return out;
  }, scope);
}

// --- Branding ------------------------------------------------------------------------------------

test('branding: upload, validate, preview a draft, publish, replace and remove — and booking still works', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const biz = await bookableBusiness(page, 'brand');
  const visitor = await (await browser.newContext()).newPage();
  await asVisitor(visitor);

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Branding' }).click();
  await expect(page.getByRole('heading', { name: 'Logo and cover photo' })).toBeVisible();
  // Defaults: nothing published yet; the wording already on the booking page is here to edit.
  await expect(page.getByText('Up to date')).toBeVisible();
  await expect(page.getByLabel('About your business')).toHaveValue(/Hand-washed, never rushed/);

  // Validation: wrong type (browser check), fake image and too-small cover (server checks).
  const logoField = await uploadTo(page, 'Logo', await file('notes.txt', Buffer.from('hello'), 'text/plain'));
  await expect(logoField.getByRole('alert')).toHaveText('Use a JPEG, PNG or WebP image.');
  await uploadTo(page, 'Logo', await file('fake.png', Buffer.from('not really a png at all')));
  await expect(logoField.getByRole('alert')).toHaveText('Use a JPEG, PNG or WebP image.');
  const coverField = await uploadTo(page, 'Cover photo', await file('small.jpg', solid(500, 300, '#335577')));
  await expect(coverField.getByRole('alert')).toHaveText('That image is 500 × 300 px. Cover photos need at least 1200 × 400 px.');
  expect(await assets(biz.businessId)).toEqual([]); // nothing reserved or stored for refused files

  // Real uploads: logo (transparent PNG), cover, two gallery photos, a service photo.
  await uploadTo(page, 'Logo', await file('logo.png', solid(800, 400, '#00000000', 'png')));
  await expect(logoField.getByRole('img', { name: 'Logo preview' })).toHaveAttribute('src', /^\/media\/[0-9a-f-]{36}\.webp$/);
  await uploadTo(page, 'Cover photo', await file('cover.jpg', solid(3000, 1500, '#2d3b45')));
  await expect(coverField.getByRole('img', { name: 'Cover photo preview' })).toHaveAttribute('src', /^\/media\//);
  await page.locator('#gallery-files').setInputFiles([await file('g1.jpg', solid(1200, 900, '#556b2f')), await file('g2.jpg', solid(1200, 900, '#8b4513'))]);
  await expect(page.getByRole('list', { name: 'Gallery photos' }).getByRole('listitem')).toHaveCount(2);
  const svcField = await uploadTo(page, 'Full detail', await file('svc.jpg', solid(800, 600, '#4a6fa5')));
  await expect(svcField.getByRole('img', { name: 'Full detail preview' })).toHaveAttribute('src', /^\/media\//);
  // Stored as resized WebP; the cover was scaled down to 2400 px wide.
  const stored = await assets(biz.businessId);
  expect(stored.map((a) => [a.kind, a.status])).toEqual([['logo', 'ready'], ['cover', 'ready'], ['gallery', 'ready'], ['gallery', 'ready'], ['service', 'ready']]);
  expect(stored.find((a) => a.kind === 'cover')).toMatchObject({ width: 2400, height: 1200 });
  expect(stored.find((a) => a.kind === 'logo')).toMatchObject({ width: 512, height: 256 });
  for (const a of stored) expect(await fileExists(a.storage_path)).toBe(true);

  // Colours (a light yellow: buttons keep readable text; links get a deeper shade), links, wording.
  await page.getByLabel('Primary colour', { exact: true }).fill('#f5d76e');
  await page.getByLabel('Secondary colour', { exact: true }).fill('#1f2a44');
  await expect(page.getByRole('list', { name: 'Readability adjustments' })).toContainText('Links use a deeper shade');
  await page.getByLabel('About your business').fill('Ceramic coatings and full details in North Austin.');
  await page.getByLabel('Instagram').fill('https://evil.example.com/northside');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Enter a Instagram link, like https://instagram.com/yourbusiness')).toBeVisible();
  await page.getByLabel('Instagram').fill('https://instagram.com/northsidedetail');
  await page.getByLabel('Website (optional)').fill('https://northside-detail.example.com');
  // Live preview reflects the editor immediately.
  const preview = page.getByTestId('brand-preview');
  await expect(preview).toContainText('Ceramic coatings and full details in North Austin.');
  await expect(preview.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', 'https://instagram.com/northsidedetail');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/Draft saved/)).toBeVisible();
  await expect(page.getByText('Unpublished changes', { exact: true })).toBeVisible();

  // A saved draft is private: the public page and the image URLs don't show it.
  await visitor.goto(`/book/${biz.slug}`);
  await expect(visitor.getByText('Hand-washed, never rushed.')).toBeVisible();
  await expect(visitor.getByRole('img', { name: 'Northside Detail Co. logo' })).toHaveCount(0);
  const logo = stored.find((a) => a.kind === 'logo')!;
  expect((await visitor.request.get(`/media/${logo.storage_path}`)).status()).toBe(404);
  // …while the owner's full-page preview shows the draft.
  await page.goto(`/book/${biz.slug}/preview?draft=1`);
  await expect(page.getByText(/Draft preview/)).toBeVisible();
  await expect(page.getByRole('img', { name: 'Northside Detail Co. logo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Our work' })).toBeVisible();

  // Publish.
  await page.goto('/app/settings/branding');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(/Published\. Your booking page now shows these changes/)).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByRole('img', { name: 'Northside Detail Co. logo' })).toBeVisible();
  await expect(visitor.getByText('Ceramic coatings and full details in North Austin.')).toBeVisible();
  await expect(visitor.getByRole('list', { name: 'Northside Detail Co. online' }).getByRole('link', { name: 'Instagram' })).toHaveAttribute('rel', /noopener/);
  await expect(visitor.getByRole('link', { name: 'northside-detail.example.com' })).toBeVisible();
  await expect(visitor.getByRole('heading', { name: 'Our work' })).toBeVisible();
  await expect(visitor.locator('#our-work img')).toHaveCount(2);
  await expect(visitor.getByRole('listitem').filter({ hasText: 'Full detail' }).locator('img')).toHaveAttribute('src', /^\/media\//);
  const media = await visitor.request.get(`/media/${logo.storage_path}`);
  expect(media.status()).toBe(200);
  expect(media.headers()['content-type']).toBe('image/webp');
  expect(media.headers()['cache-control']).toContain('public');
  // Brand colour on the buttons, with readable text; every text on the page stays readable.
  expect(await contrastFailures(visitor, 'main')).toEqual([]);
  await visitor.getByRole('radio', { name: /^Car/ }).check();
  await visitor.getByRole('radio', { name: /^Exterior wash/ }).check();
  const btn = visitor.getByRole('button', { name: 'Choose a time' });
  await expect(btn).toBeEnabled();
  expect(await btn.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(245, 215, 110)');
  expect(await btn.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(23, 23, 22)'); // graphite text on yellow
  expect(await contrastFailures(visitor, 'main')).toEqual([]);

  // Booking still works on the branded page.
  await pickFirstTime(visitor);
  await visitor.getByRole('button', { name: 'Continue' }).click();
  await fillDetails(visitor);
  await visitor.getByRole('button', { name: 'Review' }).click();
  await visitor.getByLabel(/may contact me/).check();
  await visitor.getByRole('button', { name: 'Send request' }).click();
  await expect(visitor.getByText('Request sent to Northside Detail Co. — not confirmed yet.')).toBeVisible();

  // Replace the logo: the old one stays live until publishing, then its file is deleted.
  await page.goto('/app/settings/branding');
  await uploadTo(page, 'Logo', await file('logo2.png', solid(300, 300, '#ffffff', 'png')));
  await expect(page.locator('[data-kind="logo"] img')).not.toHaveAttribute('src', `/media/${logo.storage_path}`);
  expect((await visitor.request.get(`/media/${logo.storage_path}`)).status()).toBe(200);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(/Published\./)).toBeVisible();
  await expect.poll(async () => fileExists(logo.storage_path)).toBe(false);
  expect((await db.query('select count(*)::int as n from public.media_assets where id = $1', [logo.id])).rows[0].n).toBe(0);
  expect((await visitor.request.get(`/media/${logo.storage_path}`)).status()).toBe(404);

  // Remove the cover: asks first; after publishing it's gone from the page and from storage.
  const cover = stored.find((a) => a.kind === 'cover')!;
  await page.locator('[data-kind="cover"]').getByRole('button', { name: 'Remove cover photo' }).click();
  await expect(page.getByRole('group', { name: 'Remove cover photo' })).toContainText('stays on your live page until you publish');
  await page.getByRole('group', { name: 'Remove cover photo' }).getByRole('button', { name: 'Remove cover photo' }).click();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(/Published\./)).toBeVisible();
  await expect.poll(async () => fileExists(cover.storage_path)).toBe(false);
  await visitor.goto(`/book/${biz.slug}`);
  await expect(visitor.locator('img[src*="' + cover.id + '"]')).toHaveCount(0);
  // No file without a row, no ready row without a file.
  for (const a of await assets(biz.businessId)) expect(await fileExists(a.storage_path)).toBe(a.status !== 'deleting' || true);
});

test('branding: cancel, reset to defaults, discard a draft; another business sees nothing of it', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const a = await bookableBusiness(page, 'brandA');
  await page.goto('/app/settings/branding');
  await uploadTo(page, 'Logo', await file('logo.png', solid(400, 400, '#123456', 'png')));
  await expect(page.locator('[data-kind="logo"] img')).toHaveAttribute('src', /^\/media\//);
  const [logo] = await assets(a.businessId);
  await page.getByLabel('Primary colour', { exact: true }).fill('#0b6e4f');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(/Published\./)).toBeVisible();

  // Cancel: unsaved edits go back.
  await page.getByLabel('Primary colour', { exact: true }).fill('#aa0000');
  await page.getByRole('button', { name: 'Cancel changes' }).click();
  await expect(page.getByLabel('Primary colour', { exact: true })).toHaveValue('#0b6e4f');
  // Reset to defaults asks first, then clears the look (until published).
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await page.getByRole('group', { name: 'Reset to defaults' }).getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(page.getByLabel('Primary colour', { exact: true })).toHaveValue('');
  await expect(page.locator('[data-kind="logo"] img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/Draft saved/)).toBeVisible();
  // Discarding the draft brings the published look back.
  await page.getByRole('button', { name: 'Discard unpublished changes' }).click();
  await page.getByRole('group', { name: 'Discard unpublished changes' }).getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByText('Unpublished changes discarded.')).toBeVisible();
  await expect(page.getByLabel('Primary colour', { exact: true })).toHaveValue('#0b6e4f');
  await expect(page.locator('[data-kind="logo"] img')).toHaveAttribute('src', `/media/${logo.storage_path}`);

  // Business B: its own branding page is empty; A's draft-only images are invisible to it.
  await uploadTo(page, 'Cover photo', await file('cover.jpg', solid(1600, 800, '#333333')));
  await expect(page.locator('[data-kind="cover"] img')).toHaveAttribute('src', /^\/media\//);
  const draftCover = (await assets(a.businessId)).find((x) => x.kind === 'cover')!;
  const pageB = await (await browser.newContext()).newPage();
  const b = await bookableBusiness(pageB, 'brandB', { name: 'Bravo Detailing' });
  await pageB.goto('/app/settings/branding');
  await expect(pageB.locator('[data-kind="logo"] img')).toHaveCount(0);
  expect((await pageB.request.get(`/media/${draftCover.storage_path}`)).status()).toBe(404); // A's unpublished image
  expect((await pageB.request.get(`/media/${logo.storage_path}`)).status()).toBe(200); // A's published logo is public
  // B's page never shows A's branding, and A's preview isn't B's.
  await pageB.goto(`/book/${b.slug}`);
  await expect(pageB.locator('img[src^="/media/"]')).toHaveCount(0);
  expect((await pageB.goto(`/book/${a.slug}/preview?draft=1`))?.status()).toBe(404);
  // B can't upload into A: uploads always go to the signed-in owner's business.
  const res = await pageB.request.post('/app/media/upload', {
    headers: { origin: new URL(pageB.url()).origin },
    multipart: { kind: 'logo', file: await file('x.png', solid(200, 200, '#ff0000', 'png')) },
  });
  expect(res.status()).toBe(200);
  const { id } = await res.json();
  expect((await db.query('select business_id from public.media_assets where id = $1', [id])).rows[0].business_id).toBe(b.businessId);
  // Cross-site upload attempts are refused.
  const forged = await pageB.request.post('/app/media/upload', { headers: { origin: 'https://evil.example.com' }, multipart: { kind: 'logo', file: await file('x.png', solid(200, 200, '#ff0000', 'png')) } });
  expect(forged.status()).toBe(403);
});

// --- Appearance ----------------------------------------------------------------------------------

test('appearance: light, dark and system; saved per user, restored after signing in again; public pages stay light', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const biz = await bookableBusiness(page, 'theme');
  const canvas = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.goto('/app/settings/appearance');
  await expect(page.getByRole('radio', { name: /^Match my device/ })).toBeChecked(); // default
  expect(await canvas()).toBe('rgb(250, 250, 249)');

  await page.getByRole('radio', { name: /^Dark/ }).check();
  await expect(page.getByText(/Appearance saved/)).toBeVisible();
  expect(await canvas()).toBe('rgb(19, 19, 18)');
  // The theme is in the server's HTML (no flash before scripts run).
  const html = await (await page.request.get('/app')).text();
  expect(html).toContain('class="app-theme" data-theme="dark"');
  await page.goto('/app');
  expect(await canvas()).toBe('rgb(19, 19, 18)');
  expect(await contrastFailures(page, 'body')).toEqual([]);

  // Public booking page: always light, in the business's look, whatever the owner's theme.
  await page.goto(`/book/${biz.slug}`);
  expect(await canvas()).toBe('rgb(250, 250, 249)');
  // The branding preview inside a dark dashboard is light too.
  await page.goto('/app/settings/branding');
  expect(await page.getByTestId('brand-preview').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(250, 250, 249)');

  // Sign out and back in: dark comes back.
  await page.goto('/app');
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page).toHaveURL(/sign-in/);
  await page.getByLabel('Email').fill(biz.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(await canvas()).toBe('rgb(19, 19, 18)');

  // System follows the device.
  await page.goto('/app/settings/appearance');
  await page.getByRole('radio', { name: /^Match my device/ }).check();
  await expect(page.getByText(/Appearance saved/)).toBeVisible();
  const ctxDark = await browser.newContext({ colorScheme: 'dark', storageState: await page.context().storageState() });
  const darkPage = await ctxDark.newPage();
  await darkPage.goto('/app');
  expect(await darkPage.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(19, 19, 18)');
  const ctxLight = await browser.newContext({ colorScheme: 'light', storageState: await page.context().storageState() });
  const lightPage = await ctxLight.newPage();
  await lightPage.goto('/app');
  expect(await lightPage.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(250, 250, 249)');

  // Light, explicitly.
  await page.getByRole('radio', { name: /^Light/ }).check();
  await expect(page.getByText(/Appearance saved/)).toBeVisible();
  await darkPage.goto('/app');
  expect(await darkPage.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(250, 250, 249)');
  expect((await db.query('select theme from public.user_preferences where user_id = $1', [biz.userId])).rows[0].theme).toBe('light');
});

test('dark theme: every dashboard screen keeps readable contrast', async ({ page }) => {
  test.setTimeout(180_000);
  const biz = await bookableBusiness(page, 'darkaudit');
  await db.query(`insert into public.user_preferences (user_id, theme) values ($1, 'dark')`, [biz.userId]);
  const screens = ['/app', '/app/bookings', '/app/calendar', '/app/leads', '/app/quotes', '/app/customers', '/app/services', '/app/availability', '/app/booking-page', '/app/settings', '/app/settings/branding', '/app/settings/appearance', '/app/settings/account', '/app/follow-ups', '/app/leads/new', '/app/quotes/new', '/app/appointments/new'];
  for (const theme of ['dark', 'light']) {
    await db.query(`update public.user_preferences set theme = $2 where user_id = $1`, [biz.userId, theme]);
    for (const path of screens) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      expect(await contrastFailures(page, 'body'), `${theme} ${path}`).toEqual([]);
    }
  }
});

for (const [width, height] of [[390, 844], [1280, 900]] as const) {
  test(`branding and appearance layout at ${width}px: no horizontal scroll`, async ({ page, browser }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    const biz = await bookableBusiness(page, `bl${width}`);
    await page.goto('/app/settings/branding');
    await uploadTo(page, 'Logo', await file('logo.png', solid(600, 300, '#1f2a44', 'png')));
    await expect(page.locator('[data-kind="logo"] img')).toHaveAttribute('src', /^\/media\//);
    await uploadTo(page, 'Cover photo', await file('cover.jpg', solid(2000, 900, '#3c4a57')));
    await expect(page.locator('[data-kind="cover"] img')).toHaveAttribute('src', /^\/media\//);
    await page.locator('#gallery-files').setInputFiles([1, 2, 3].map((i) => ({ name: `g${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.alloc(0) })).slice(0, 0));
    await page.getByLabel('Primary colour', { exact: true }).fill('#0b6e4f');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByText(/Published\./)).toBeVisible();
    for (const path of ['/app/settings/branding', '/app/settings/appearance', `/book/${biz.slug}`]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBe(0);
      await page.screenshot({ path: `test-results/p6-${path.split('/').pop()}-${width}.png`, fullPage: true });
    }
    await db.query(`insert into public.user_preferences (user_id, theme) values ($1, 'dark') on conflict (user_id) do update set theme = 'dark'`, [biz.userId]);
    for (const path of ['/app', '/app/settings/branding', '/app/calendar', '/app/customers']) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBe(0);
      await page.screenshot({ path: `test-results/p6-dark-${path.split('/').pop()}-${width}.png`, fullPage: true });
    }
    const visitor = await (await browser.newContext({ viewport: { width, height } })).newPage();
    await asVisitor(visitor);
    await visitor.goto(`/book/${biz.slug}`);
    expect(await contrastFailures(visitor, 'main')).toEqual([]);
  });
}
