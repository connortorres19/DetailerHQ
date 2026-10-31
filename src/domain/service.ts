import { z } from 'zod';

// Services, packages and add-ons (Phase 4A). A package is a service (owner decision 2).
// Mirrors the services / service_prices / service_categories checks (migration
// 20261030120100) and app.priced_services(): a per-size price or duration replaces the base,
// a blank one falls back to it. Money is integer cents everywhere.

export const PRICE_TYPES = [
  { value: 'fixed', label: 'Fixed price', hint: 'One price you charge every time.' },
  { value: 'starting_at', label: 'Starting at', hint: 'A minimum; the final price depends on condition.' },
  { value: 'quote_required', label: 'Quote required', hint: 'You price it after seeing the vehicle (e.g. coatings, correction).' },
] as const;
export type PriceType = (typeof PRICE_TYPES)[number]['value'];

export const MAX_PRICE_CENTS = 10_000_000; // $100,000 — far above any detailing job; keeps integers safe
export const MIN_DURATION = 15;
export const MAX_DURATION = 4320; // 72 hours, the database limit

// "$180", "180", "180.5", "1,250.00" → cents. Rejects negatives, >2 decimals and junk.
export function parseMoney(input: string): number | null {
  const text = input.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [dollars, cents = ''] = text.split('.');
  const value = Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
  return Number.isSafeInteger(value) && value <= MAX_PRICE_CENTS ? value : null;
}

export const centsToInput = (cents: number | null | undefined) =>
  cents == null ? '' : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);

export const formatCents = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ') || '0m';
}

// Duration fields come in as hours + minutes selects (DESIGN_SYSTEM §13.2: 15-minute steps).
function readDuration(hours: FormDataEntryValue | null, minutes: FormDataEntryValue | null): number | null | 'invalid' {
  const h = typeof hours === 'string' ? hours.trim() : '';
  const m = typeof minutes === 'string' ? minutes.trim() : '';
  if (h === '' && m === '') return null;
  if (!/^\d{1,2}$/.test(h || '0') || !/^\d{1,2}$/.test(m || '0')) return 'invalid';
  const total = Number(h || 0) * 60 + Number(m || 0);
  if (Number(m || 0) % 15 !== 0) return 'invalid';
  return total;
}

const durationMessage = `Choose a duration from ${formatDuration(MIN_DURATION)} to ${formatDuration(MAX_DURATION)}.`;
const inRange = (min: number) => min >= MIN_DURATION && min <= MAX_DURATION;

export type SizeOverride = { sizeClassId: string; priceCents: number | null; durationMin: number | null };

export type ServiceInput = {
  name: string;
  description: string | null;
  categoryId: string | null;
  priceType: PriceType;
  basePriceCents: number | null;
  baseDurationMin: number;
  isAddon: boolean;
  isBookable: boolean;
  sizes: SizeOverride[];
};

export type ServiceParse = { ok: true; data: ServiceInput } | { ok: false; fieldErrors: Record<string, string> };

const baseSchema = z.object({
  name: z.string().trim().min(1, 'Enter a service name.').max(80, 'Use 80 characters or fewer.'),
  description: z
    .string()
    .trim()
    .max(500, 'Use 500 characters or fewer.')
    .transform((v) => v || null),
  categoryId: z
    .string()
    .transform((v) => v || null)
    .pipe(z.uuid('Choose a category.').nullable()),
  priceType: z.enum(['fixed', 'starting_at', 'quote_required'], { message: 'Choose how this is priced.' }),
});

// Validates the whole service form, including the per-size grid (`size.<id>.price`,
// `size.<id>.hours`, `size.<id>.minutes`). `sizeIds` are the business's own size classes —
// anything else in the form is rejected, never written.
export function parseServiceForm(formData: FormData, sizeIds: string[]): ServiceParse {
  const errors: Record<string, string> = {};
  const base = baseSchema.safeParse({
    name: formData.get('name') ?? '',
    description: formData.get('description') ?? '',
    categoryId: formData.get('categoryId') ?? '',
    priceType: formData.get('priceType') ?? '',
  });
  if (!base.success) for (const issue of base.error.issues) errors[String(issue.path[0])] ??= issue.message;

  const priceType = base.success ? base.data.priceType : null;
  const quote = priceType === 'quote_required';

  // Base price: required unless quote-required (services check).
  const rawPrice = String(formData.get('basePrice') ?? '').trim();
  let basePriceCents: number | null = null;
  if (rawPrice) {
    basePriceCents = parseMoney(rawPrice);
    if (basePriceCents === null) errors.basePrice = 'Enter a price like 180 or 180.00.';
  } else if (!quote) {
    errors.basePrice = 'Enter a price.';
  }
  if (quote) basePriceCents = null; // never stored for quote-required services

  const baseDuration = readDuration(formData.get('baseHours'), formData.get('baseMinutes'));
  if (baseDuration === null || baseDuration === 'invalid' || !inRange(baseDuration)) errors.baseDuration = durationMessage;

  // Per-size overrides. Only the business's size classes; quote-required keeps durations only.
  const sizes: SizeOverride[] = [];
  for (const key of formData.keys()) {
    const match = key.match(/^size\.([^.]+)\.(price|hours|minutes)$/);
    if (match && !sizeIds.includes(match[1]!)) errors.sizes = 'Unknown vehicle size.';
  }
  for (const id of sizeIds) {
    const rawSizePrice = String(formData.get(`size.${id}.price`) ?? '').trim();
    let priceCents: number | null = null;
    if (rawSizePrice && !quote) {
      priceCents = parseMoney(rawSizePrice);
      if (priceCents === null) errors[`size.${id}.price`] = 'Enter a price like 95 or 95.00.';
    }
    const duration = readDuration(formData.get(`size.${id}.hours`), formData.get(`size.${id}.minutes`));
    let durationMin: number | null = null;
    if (duration === 'invalid' || (typeof duration === 'number' && !inRange(duration))) errors[`size.${id}.duration`] = durationMessage;
    else durationMin = duration;
    // A row needs at least one value (service_prices check); identical-to-base rows are kept as entered.
    if (priceCents !== null || durationMin !== null) sizes.push({ sizeClassId: id, priceCents, durationMin });
  }

  const isAddon = formData.get('isAddon') === 'on';
  const wantsBookable = formData.get('isBookable') === 'on';
  // The database forbids bookable quote-required services; say so instead of failing.
  if (wantsBookable && quote) errors.isBookable = 'Quote-required services can’t be booked online. Customers can ask for a quote instead.';

  if (Object.keys(errors).length || !base.success || typeof baseDuration !== 'number') return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: {
      ...base.data,
      basePriceCents,
      baseDurationMin: baseDuration,
      isAddon,
      isBookable: wantsBookable && !quote,
      sizes,
    },
  };
}

// Summary shown in lists: "$180", "From $260", "$65–$95", "Quote required".
export function priceSummary(s: { price_type: PriceType; base_price_cents: number | null }, sizePrices: (number | null)[]) {
  if (s.price_type === 'quote_required') return 'Quote required';
  const prices = [s.base_price_cents, ...sizePrices].filter((p): p is number => p != null);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = min === max ? formatCents(min) : `${formatCents(min)}–${formatCents(max)}`;
  return s.price_type === 'starting_at' ? `From ${formatCents(min)}` : range;
}

export function durationSummary(base: number, sizeDurations: (number | null)[]) {
  const all = [base, ...sizeDurations].filter((d): d is number => d != null);
  const min = Math.min(...all);
  const max = Math.max(...all);
  return min === max ? formatDuration(min) : `${formatDuration(min)}–${formatDuration(max)}`;
}

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a category name.').max(60, 'Use 60 characters or fewer.'),
});
