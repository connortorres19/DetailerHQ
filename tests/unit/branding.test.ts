import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  brandingFormSchema,
  brandTheme,
  colorNotes,
  contrast,
  isMediaFile,
  PAPER,
  socialUrlOk,
  solidFor,
  textOn,
  toDraft,
  websiteOk,
  withContrast,
} from '../../src/domain/branding.ts';
import { asTheme, themeSchema } from '../../src/domain/theme.ts';

const ID = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;

test('contrast: WCAG reference values', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(contrast('#ffffff', '#ffffff'), 1);
  assert.equal(contrast('#767676', '#ffffff').toFixed(2), '4.54');
});

test('any colour an owner picks gives readable button text (≥ 4.5:1), across the whole spectrum', () => {
  for (let r = 0; r < 256; r += 17)
    for (let g = 0; g < 256; g += 17)
      for (let b = 0; b < 256; b += 17) {
        const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        const solid = solidFor(hex);
        assert.ok(contrast(textOn(solid), solid) >= 4.5, `${hex} → ${solid} with ${textOn(solid)}`);
        assert.ok(contrast(withContrast(hex, PAPER, 4.5), PAPER) >= 4.5, `link ink for ${hex}`);
        assert.ok(contrast(withContrast(hex, PAPER, 3), PAPER) >= 3, `accent for ${hex}`);
      }
});

test('colours that already pass are left exactly as chosen', () => {
  assert.equal(solidFor('#0b6e4f'), '#0b6e4f');
  assert.equal(withContrast('#0b6e4f', PAPER, 4.5), '#0b6e4f');
  assert.equal(textOn('#0b6e4f'), '#ffffff');
  assert.equal(textOn('#f5d76e'), '#171716'); // light yellow: graphite text
});

test('brand theme: only checked hex values, readable pairs, nothing without colours', () => {
  assert.deepEqual(brandTheme({ primary: null, secondary: null, accent: null }), {});
  assert.deepEqual(brandTheme({ primary: 'red; background:url(x)', secondary: 'javascript:alert(1)', accent: '#12' }), {});
  const t = brandTheme({ primary: '#f5d76e', secondary: '#1f2a44', accent: '#ffe600' });
  for (const v of Object.values(t)) assert.match(v, /^#[0-9a-f]{6}$/);
  assert.ok(contrast(t['--brand-on-solid']!, t['--brand-solid']!) >= 4.5);
  assert.ok(contrast(t['--color-text-link']!, PAPER) >= 4.5);
  assert.ok(contrast(t['--brand-on-band']!, t['--brand-band']!) >= 4.5);
  assert.ok(contrast(t['--brand-on-band-muted']!, t['--brand-band']!) >= 4.5);
  assert.ok(contrast(t['--brand-accent']!, PAPER) >= 3);
  assert.ok(colorNotes({ primary: '#f5d76e', secondary: null, accent: null }).some((n) => n.startsWith('Links use a deeper shade')));
  assert.deepEqual(colorNotes({ primary: '#0b6e4f', secondary: null, accent: null }), []);
});

test('links: https on the network’s own domain only', () => {
  assert.ok(socialUrlOk('instagram', 'https://instagram.com/northside'));
  assert.ok(socialUrlOk('instagram', 'https://www.instagram.com/northside'));
  assert.ok(socialUrlOk('google', 'https://g.page/northside'));
  for (const bad of ['http://instagram.com/x', 'https://instagram.com.evil.com/x', 'https://evilinstagram.com/x', 'javascript:alert(1)', 'https://user@instagram.com/x', 'https://instagram.com/"onmouseover=x'])
    assert.ok(!socialUrlOk('instagram', bad), bad);
  assert.ok(websiteOk('https://northside-detail.com/about'));
  for (const bad of ['http://northside.com', 'https://localhost', 'data:text/html,hi', 'https://a b.com']) assert.ok(!websiteOk(bad), bad);
});

test('branding form → draft: normalised colours, links, wording limits, images', () => {
  const ok = brandingFormSchema.parse({
    primaryColor: '#0B6E4F',
    secondaryColor: '',
    accentColor: '',
    website: 'https://northside.com',
    showEmail: 'on',
    intro: '  Hand-washed. ',
    cancellation: '',
    rescheduling: '',
    prep: '',
    social_instagram: 'https://instagram.com/northside',
    images: JSON.stringify({ logo: ID(1), cover: null, gallery: [ID(2), ID(3)], services: { [ID(4)]: ID(5) } }),
  });
  const r = toDraft(ok);
  assert.ok(r.ok);
  assert.deepEqual(r.draft, {
    primary_color: '#0b6e4f',
    secondary_color: null,
    accent_color: null,
    logo_asset_id: ID(1),
    cover_asset_id: null,
    gallery_asset_ids: [ID(2), ID(3)],
    service_photos: { [ID(4)]: ID(5) },
    website_url: 'https://northside.com',
    social_links: { instagram: 'https://instagram.com/northside' },
    show_email: true,
    intro_text: 'Hand-washed.',
    cancellation_policy_text: null,
    reschedule_policy_text: null,
    prep_instructions: null,
  });
  // Every problem reported at once.
  const bad = brandingFormSchema.safeParse({ primaryColor: 'blue', intro: 'x'.repeat(301), cancellation: 'x'.repeat(1001), website: 'http://x.com', social_facebook: 'https://instagram.com/x' });
  assert.ok(!bad.success);
  assert.deepEqual(bad.error.issues.map((i) => i.path[0]).sort(), ['cancellation', 'intro', 'primaryColor', 'social_facebook', 'website']);
  // Image lists: ids only, up to 12 gallery photos.
  const many = brandingFormSchema.parse({ images: JSON.stringify({ gallery: Array.from({ length: 13 }, (_, i) => ID((i % 9) + 1)) }) });
  assert.deepEqual(toDraft(many), { ok: false, message: 'The gallery holds up to 12 photos.' });
  assert.equal(toDraft(brandingFormSchema.parse({ images: '{"logo":"../../etc/passwd"}' })).ok, false);
  assert.equal(toDraft(brandingFormSchema.parse({ images: 'not json' })).ok, false);
});

test('media URLs: only <uuid>.webp names reach Storage', () => {
  assert.ok(isMediaFile(`${ID(1)}.webp`));
  for (const bad of [`${ID(1)}.png`, `../${ID(1)}.webp`, `${ID(1)}.webp?x`, 'a.webp', `ABCDEF12-1111-4111-8111-111111111111.webp`]) assert.ok(!isMediaFile(bad), bad);
});

test('theme preference: three options; anything else falls back to the device setting', () => {
  for (const t of ['light', 'dark', 'system']) assert.ok(themeSchema.safeParse({ theme: t }).success);
  assert.ok(!themeSchema.safeParse({ theme: 'neon' }).success);
  assert.equal(asTheme('dark'), 'dark');
  assert.equal(asTheme(null), 'system');
  assert.equal(asTheme('purple'), 'system');
});

// The dark tokens appear twice in globals.css (explicit dark, and "system" inside the dark media
// query). They must match; and every text token must stay readable on every dark surface.
const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
function block(after: string) {
  const start = css.indexOf('{', css.indexOf(after)) + 1;
  let depth = 1;
  let i = start;
  for (; depth; i += 1) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
  return Object.fromEntries([...css.slice(start, i - 1).matchAll(/(--[a-z0-9-]+|color-scheme):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

test('dark theme: the explicit and the "match my device" blocks are identical', () => {
  const dark = block(":root:has(.app-theme[data-theme='dark'])");
  const system = block(":root:has(.app-theme[data-theme='system'])");
  assert.ok(Object.keys(dark).length > 30);
  assert.deepEqual(system, dark);
});

test('dark theme: text and status colours meet WCAG AA on every dark surface', () => {
  const d = block(":root:has(.app-theme[data-theme='dark'])");
  const surfaces = ['--graphite-0', '--graphite-25', '--graphite-50'].map((k) => d[k]!);
  for (const [text, min] of [['--graphite-900', 4.5], ['--graphite-700', 4.5], ['--graphite-600', 4.5], ['--graphite-500', 4.5], ['--steel-600', 4.5], ['--steel-700', 4.5], ['--steel-500', 3]] as const)
    for (const bg of surfaces) assert.ok(contrast(d[text]!, bg) >= min, `${text} on ${bg}: ${contrast(d[text]!, bg).toFixed(2)}`);
  for (const s of ['attention', 'info', 'positive', 'critical', 'neutral']) {
    assert.ok(contrast(d[`--color-${s}-text`]!, d[`--color-${s}-bg`]!) >= 4.5, s);
    assert.ok(contrast(d[`--color-${s}-text`]!, d['--graphite-0']!) >= 4.5, `${s} on surface`);
  }
  // Primary buttons: dark text on the light "strongest ink".
  assert.ok(contrast(d['--color-action-primary-text']!, d['--graphite-900']!) >= 4.5);
});
