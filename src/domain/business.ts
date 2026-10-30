import { z } from 'zod';

// Mirrors app.is_us_timezone() (migration 20261030120000). tests/node/domain.test.js checks
// every value against the database function.
export const US_TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Phoenix', label: 'Mountain Time — Arizona (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  ...[
    'America/Detroit', 'America/Kentucky/Louisville', 'America/Kentucky/Monticello', 'America/Indiana/Indianapolis',
    'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Indiana/Marengo', 'America/Indiana/Petersburg',
    'America/Indiana/Vevay', 'America/Indiana/Tell_City', 'America/Indiana/Knox', 'America/Menominee',
    'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'America/North_Dakota/Beulah', 'America/Boise',
    'America/Juneau', 'America/Sitka', 'America/Metlakatla', 'America/Yakutat', 'America/Nome', 'America/Adak',
  ].map((tz) => ({ value: tz, label: tz.replace('America/', '').replace(/_/g, ' ') })),
];

export const SERVICE_MODES = [
  { value: 'mobile', label: 'Mobile', description: 'I go to the customer.' },
  { value: 'shop', label: 'Shop', description: 'Customers bring the vehicle to me.' },
  { value: 'both', label: 'Both', description: 'Mobile jobs and a shop.' },
] as const;

// --- Phone numbers: stored as E.164 (+1XXXXXXXXXX), shown as (512) 555-0142 ---------------

const US_E164 = /^\+1[2-9][0-9]{2}[2-9][0-9]{6}$/; // same as app.is_valid_us_phone()

export function toE164(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const e164 = `+1${national}`;
  return national.length === 10 && US_E164.test(e164) ? e164 : null;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

// Optional phone field: blank → null; anything else must be a valid US number.
export const optionalPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const e164 = toE164(v);
    if (!e164) ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit US phone number.' });
    return e164;
  });

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v, ctx) => {
    if (!v) return null;
    if (!z.email().safeParse(v).success || v.length > 254) ctx.addIssue({ code: 'custom', message: 'Enter a valid email address.' });
    return v;
  });

// --- Booking link (slug) ------------------------------------------------------------------

// Mirrors the businesses.slug checks: 3–40 chars, lowercase letters, digits and hyphens,
// no leading/trailing hyphen, not a reserved word.
const RESERVED = ['app', 'api', 'admin', 'www', 'b', 'r', 'q', 'auth', 'sign-in', 'sign-up', 'onboarding', 'pricing', 'contact', 'legal', 'support', 'help', 'status'];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Use 3–40 lowercase letters, numbers and hyphens (not at the start or end).')
  .refine((v) => !RESERVED.includes(v), 'That link is reserved. Try another.');

// --- Onboarding -------------------------------------------------------------------------

export const onboardingSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your business name.').max(120, 'Use 120 characters or fewer.'),
    slug: slugSchema,
    timezone: z.string().refine((tz) => US_TIMEZONES.some((t) => t.value === tz), 'Choose a US time zone.'),
    serviceMode: z.enum(['mobile', 'shop', 'both'], { message: 'Choose where you work.' }),
    // Checked per field (not only below), so its error shows alongside the others.
    capacity: z
      .string()
      .trim()
      .optional()
      .refine((c) => c === undefined || (/^\d+$/.test(c) && Number(c) >= 1 && Number(c) <= 20), 'Enter a number from 1 to 20.'),
    phone: optionalPhone,
    email: optionalEmail,
  })
  .transform((v, ctx) => {
    // D-26: mobile-only businesses work one job at a time; shops say how many at once.
    if (v.serviceMode === 'mobile') return { ...v, capacity: 1 };
    if (v.capacity === undefined) {
      ctx.addIssue({ code: 'custom', path: ['capacity'], message: 'Enter a number from 1 to 20.' });
      return z.NEVER;
    }
    return { ...v, capacity: Number(v.capacity) };
  });

// --- Settings ---------------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((v) => v || null);

// Columns owners may update directly (column grants in migration 20261030120300). Slug,
// time zone and service mode are not among them.
export const businessProfileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your business name.').max(120, 'Use 120 characters or fewer.'),
  phone: optionalPhone,
  email: optionalEmail,
  serviceAreaText: optionalText(300),
  shopAddressLine1: optionalText(120),
  shopCity: optionalText(60),
  shopState: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === '' || /^[A-Z]{2}$/.test(v), 'Use the 2-letter state code, e.g. TX.')
    .transform((v) => v || null),
  shopPostalCode: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[0-9]{5}(-[0-9]{4})?$/.test(v), 'Enter a 5-digit ZIP code.')
    .transform((v) => v || null),
});

export const capacitySchema = z.object({
  capacity: z
    .string()
    .trim()
    .refine((c) => /^\d+$/.test(c) && Number(c) >= 1 && Number(c) <= 20, 'Enter a number from 1 to 20.')
    .transform(Number),
});
