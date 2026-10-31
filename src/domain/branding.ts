import { z } from 'zod';

// Branding (Phase 6). The database is the authority (migration 20261102120000_branding_media.sql:
// app.branding_clean); these give owners field-level messages, and turn the colours an owner picks
// into a palette that always keeps text readable (WCAG 2.2 contrast).

// --- Colour maths --------------------------------------------------------------------------------

export type Rgb = { r: number; g: number; b: number };

export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb) {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mixes `hex` toward `toward` by `amount` (0–1). */
export function mix(hex: string, toward: string, amount: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  return rgbToHex({ r: a.r + (b.r - a.r) * amount, g: a.g + (b.g - a.g) * amount, b: a.b + (b.b - a.b) * amount });
}

/**
 * The closest colour to `hex` that reaches `min` contrast against `bg`: unchanged when it already
 * does, otherwise mixed toward black (on light backgrounds) or white (on dark ones) a step at a time.
 */
export function withContrast(hex: string, bg: string, min: number) {
  if (contrast(hex, bg) >= min) return hex;
  const toward = luminance(bg) > 0.4 ? '#000000' : '#ffffff';
  for (let step = 1; step <= 40; step += 1) {
    const candidate = mix(hex, toward, step / 40);
    if (contrast(candidate, bg) >= min) return candidate;
  }
  return toward;
}

export const INK = '#171716'; // graphite-900
export const PAPER = '#ffffff';

/** Readable text on a solid colour: white or graphite, whichever reads better (≥ 4.5:1 guaranteed). */
export function textOn(bg: string) {
  return contrast(PAPER, bg) >= contrast(INK, bg) ? PAPER : INK;
}

/**
 * A button background close to the owner's colour on which white or graphite text reaches 4.5:1.
 * Mid-tones where neither does are nudged darker until white text passes.
 */
export function solidFor(hex: string) {
  if (Math.max(contrast(PAPER, hex), contrast(INK, hex)) >= 4.5) return hex;
  return withContrast(hex, PAPER, 4.5);
}

// --- Public page theme ---------------------------------------------------------------------------

export type BrandColors = { primary: string | null; secondary: string | null; accent: string | null };

/**
 * CSS custom properties for the public booking page from the owner's colours. Every value is a
 * checked hex colour (never owner text), so it is safe to put in a style attribute. Without colours
 * the page keeps the DetailerHQ defaults (no properties set).
 */
export function brandTheme(colors: BrandColors): Record<string, string> {
  const vars: Record<string, string> = {};
  const primary = colors.primary && isHex(colors.primary) ? colors.primary.toLowerCase() : null;
  const secondary = colors.secondary && isHex(colors.secondary) ? colors.secondary.toLowerCase() : null;
  const accent = colors.accent && isHex(colors.accent) ? colors.accent.toLowerCase() : null;
  if (primary) {
    const solid = solidFor(primary);
    const on = textOn(solid);
    vars['--brand-solid'] = solid;
    vars['--brand-on-solid'] = on;
    vars['--brand-solid-hover'] = mix(solid, on === PAPER ? '#000000' : '#ffffff', 0.12);
    vars['--brand-ink'] = withContrast(primary, PAPER, 4.5); // brand-coloured text and links on white
    vars['--brand-tint'] = mix(primary, PAPER, 0.92); // selected rows
    // The shared tokens the booking page's buttons and links already use.
    vars['--color-action-primary-bg'] = solid;
    vars['--color-action-primary-bg-hover'] = vars['--brand-solid-hover'];
    vars['--color-action-primary-text'] = on;
    vars['--color-text-link'] = vars['--brand-ink'];
    vars['--color-text-link-hover'] = withContrast(mix(primary, '#000000', 0.2), PAPER, 4.5);
  }
  if (secondary) {
    vars['--brand-band'] = secondary; // header band when there is no cover photo
    vars['--brand-on-band'] = textOn(secondary);
    vars['--brand-on-band-muted'] = withContrast(mix(textOn(secondary), secondary, 0.2), secondary, 4.5);
  }
  const mark = accent ?? primary;
  if (mark) {
    vars['--brand-accent'] = withContrast(mark, PAPER, 3); // progress, checked borders: 3:1 non-text
    vars['--brand-focus'] = withContrast(mark, PAPER, 3);
    vars['--color-focus-ring'] = vars['--brand-focus'];
  }
  return vars;
}

/** Contrast notes the editor shows next to the colour pickers (what we adjusted, and why). */
export function colorNotes(colors: BrandColors) {
  const notes: string[] = [];
  if (colors.primary && isHex(colors.primary)) {
    const solid = solidFor(colors.primary);
    if (solid !== colors.primary.toLowerCase()) notes.push('Buttons use a slightly deeper shade of your primary colour so their text stays readable.');
    if (withContrast(colors.primary, PAPER, 4.5) !== colors.primary.toLowerCase()) notes.push('Links use a deeper shade of your primary colour so they read on white.');
  }
  const mark = colors.accent ?? colors.primary;
  if (mark && isHex(mark) && withContrast(mark, PAPER, 3) !== mark.toLowerCase()) notes.push('Highlights use a deeper shade of your accent colour so they stand out on white.');
  return notes;
}

// --- Draft --------------------------------------------------------------------------------------

export const SOCIAL_NETWORKS = [
  { key: 'instagram', label: 'Instagram', hosts: ['instagram.com'], example: 'https://instagram.com/yourbusiness' },
  { key: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'fb.com'], example: 'https://facebook.com/yourbusiness' },
  { key: 'tiktok', label: 'TikTok', hosts: ['tiktok.com'], example: 'https://tiktok.com/@yourbusiness' },
  { key: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be'], example: 'https://youtube.com/@yourbusiness' },
  { key: 'google', label: 'Google Business Profile', hosts: ['google.com', 'g.page', 'goo.gl'], example: 'https://g.page/yourbusiness' },
  { key: 'yelp', label: 'Yelp', hosts: ['yelp.com'], example: 'https://yelp.com/biz/yourbusiness' },
] as const;
export type SocialKey = (typeof SOCIAL_NETWORKS)[number]['key'];

/** Same rule as app.social_host_ok: https, on the network's own domain (or a subdomain). */
export function socialUrlOk(key: SocialKey, url: string) {
  const net = SOCIAL_NETWORKS.find((n) => n.key === key);
  if (!net || url.length > 200 || /[\s<>"'`]/.test(url)) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return net.hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

export function websiteOk(url: string) {
  if (url.length > 200 || /[\s<>"'`]/.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname);
  } catch {
    return false;
  }
}

export type BrandingDraft = {
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  logo_asset_id: string | null;
  cover_asset_id: string | null;
  gallery_asset_ids: string[];
  service_photos: Record<string, string>;
  website_url: string | null;
  social_links: Partial<Record<SocialKey, string>>;
  show_email: boolean;
  intro_text: string | null;
  cancellation_policy_text: string | null;
  reschedule_policy_text: string | null;
  prep_instructions: string | null;
};

export const EMPTY_LOOK = {
  primary_color: null,
  secondary_color: null,
  accent_color: null,
  logo_asset_id: null,
  cover_asset_id: null,
  gallery_asset_ids: [] as string[],
  service_photos: {} as Record<string, string>,
  website_url: null,
  social_links: {},
  show_email: false,
} satisfies Partial<BrandingDraft>;

const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .optional()
    .transform((v) => v || null);
const color = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || isHex(v), 'Choose a colour like #1f4e79.');

/** The editor's form → a draft for public.save_branding_draft (images come from the editor state). */
export const brandingFormSchema = z
  .object({
    primaryColor: color,
    secondaryColor: color,
    accentColor: color,
    website: z.string().trim().optional().default(''),
    showEmail: z.string().optional().transform((v) => v === 'on'),
    intro: text(300, 'About your business'),
    cancellation: text(1000, 'Cancellation policy'),
    rescheduling: text(1000, 'Rescheduling policy'),
    prep: text(1000, 'Before the appointment'),
    ...Object.fromEntries(SOCIAL_NETWORKS.map((n) => [`social_${n.key}`, z.string().trim().optional().default('')])),
    images: z.string().default('{}'),
  })
  .superRefine((v, ctx) => {
    const r = v as Record<string, unknown>;
    if (v.website && !websiteOk(v.website)) ctx.addIssue({ code: 'custom', path: ['website'], message: 'Enter a website starting with https://' });
    for (const n of SOCIAL_NETWORKS) {
      const url = String(r[`social_${n.key}`] ?? '');
      if (url && !socialUrlOk(n.key, url)) ctx.addIssue({ code: 'custom', path: [`social_${n.key}`], message: `Enter a ${n.label} link, like ${n.example}` });
    }
  });

const imagesSchema = z.object({
  logo: z.uuid().nullable().default(null),
  cover: z.uuid().nullable().default(null),
  gallery: z.array(z.uuid()).max(12, 'The gallery holds up to 12 photos.').default([]),
  services: z.record(z.uuid(), z.uuid()).default({}),
});

export function toDraft(v: z.infer<typeof brandingFormSchema>): { ok: true; draft: BrandingDraft } | { ok: false; message: string } {
  let images: z.infer<typeof imagesSchema>;
  try {
    const parsed = imagesSchema.safeParse(JSON.parse(v.images));
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
    images = parsed.data;
  } catch {
    return { ok: false, message: 'The images couldn’t be read. Refresh and try again.' };
  }
  const r = v as Record<string, unknown>;
  const social: Partial<Record<SocialKey, string>> = {};
  for (const n of SOCIAL_NETWORKS) {
    const url = String(r[`social_${n.key}`] ?? '');
    if (url) social[n.key] = url;
  }
  return {
    ok: true,
    draft: {
      primary_color: v.primaryColor,
      secondary_color: v.secondaryColor,
      accent_color: v.accentColor,
      logo_asset_id: images.logo,
      cover_asset_id: images.cover,
      gallery_asset_ids: images.gallery,
      service_photos: images.services,
      website_url: v.website || null,
      social_links: social,
      show_email: v.showEmail,
      intro_text: v.intro,
      cancellation_policy_text: v.cancellation,
      reschedule_policy_text: v.rescheduling,
      prep_instructions: v.prep,
    },
  };
}

// --- Images -------------------------------------------------------------------------------------

export const MEDIA_KINDS = ['logo', 'cover', 'gallery', 'service'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** What the server accepts and produces for each kind of image. */
export const IMAGE_SPECS: Record<MediaKind, { label: string; minWidth: number; minHeight: number; maxWidth: number; maxHeight: number; hint: string }> = {
  logo: { label: 'Logo', minWidth: 64, minHeight: 64, maxWidth: 512, maxHeight: 512, hint: 'Square or wide, at least 64 px. PNG with a transparent background works best.' },
  cover: { label: 'Cover photo', minWidth: 1200, minHeight: 400, maxWidth: 2400, maxHeight: 1600, hint: 'A wide photo of your work, at least 1200 × 400 px.' },
  gallery: { label: 'Gallery photo', minWidth: 600, minHeight: 400, maxWidth: 1600, maxHeight: 1600, hint: 'At least 600 × 400 px.' },
  service: { label: 'Service photo', minWidth: 400, minHeight: 300, maxWidth: 1200, maxHeight: 1200, hint: 'At least 400 × 300 px.' },
};

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // what owners may send; stored WebP is far smaller
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const mediaUrl = (id: string) => `/media/${id}.webp`;
export const isMediaFile = (name: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/.test(name);
