import { z } from 'zod';
import { toE164 } from './business.ts';
import { formatCents, formatDuration } from './service.ts';

// Public booking (Phase 4C). Shapes returned by the public_api functions (migration 11), the
// estimate shown while choosing, and validation of what the customer sends. The browser only
// ever shows estimates: the database prices, times and checks every submission itself.

const priceType = z.enum(['fixed', 'starting_at', 'quote_required']);

// Phase 6: the published look (app.branding_payload). Images are referenced by id and served from
// /media/<id>.webp; links were validated by the database (https, the network's own domain).
const pageAsset = z.object({ id: z.uuid(), width: z.number(), height: z.number() });
const pageBrandingSchema = z.object({
  colors: z.object({ primary: z.string().nullable(), secondary: z.string().nullable(), accent: z.string().nullable() }),
  logo: pageAsset.nullable(),
  cover: pageAsset.nullable(),
  gallery: z.array(pageAsset),
  service_photos: z.record(z.string(), pageAsset),
  website_url: z.string().nullable(),
  social: z.record(z.string(), z.string()),
  email: z.string().nullable(),
});
export const NO_BRANDING: z.infer<typeof pageBrandingSchema> = {
  colors: { primary: null, secondary: null, accent: null },
  logo: null,
  cover: null,
  gallery: [],
  service_photos: {},
  website_url: null,
  social: {},
  email: null,
};

export const bookingPageSchema = z.object({
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
  service_mode: z.enum(['mobile', 'shop', 'both']),
  service_area: z.string().nullable(),
  shop_address: z
    .object({ line1: z.string().nullable(), city: z.string().nullable(), state: z.string().nullable(), postal_code: z.string().nullable() })
    .nullable(),
  phone: z.string().nullable(),
  accepting_requests: z.boolean(),
  booking_mode: z.enum(['approval', 'instant']),
  intro: z.string().nullable(),
  policies: z.object({
    cancellation: z.string().nullable(),
    rescheduling: z.string().nullable(),
    prep_instructions: z.string().nullable(),
    online_cancellation: z.boolean(),
    cancel_cutoff_hours: z.number(),
    min_notice_min: z.number(),
    horizon_days: z.number(),
  }),
  categories: z.array(z.object({ id: z.string(), name: z.string() })),
  size_classes: z.array(z.object({ id: z.string(), name: z.string(), examples: z.string().nullable() })),
  services: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      category_id: z.string().nullable(),
      price_type: priceType,
      price_cents: z.number().nullable(),
      duration_min: z.number(),
      is_addon: z.boolean(),
      by_size: z.array(z.object({ size_class_id: z.string(), price_cents: z.number().nullable(), duration_min: z.number().nullable() })),
    }),
  ),
  published: z.boolean().optional(), // owner preview only
  branding: pageBrandingSchema.default(NO_BRANDING),
});

export type BookingPage = z.infer<typeof bookingPageSchema>;
export type PageBranding = BookingPage['branding'];
export type PublicService = BookingPage['services'][number];

export const slotsSchema = z.object({
  duration_min: z.number(),
  last_bookable_date: z.string(),
  days: z.array(z.object({ date: z.string(), slots: z.array(z.string()) })),
});
export type Slots = z.infer<typeof slotsSchema>;

// --- Estimate (mirrors app.priced_services: a size price/duration replaces the base) ---------

export type Line = { id: string; name: string; priceType: PublicService['price_type']; priceCents: number; durationMin: number; isAddon: boolean };

export function priceFor(service: PublicService, sizeId: string | null): Line {
  const override = sizeId ? service.by_size.find((s) => s.size_class_id === sizeId) : undefined;
  return {
    id: service.id,
    name: service.name,
    priceType: service.price_type,
    priceCents: override?.price_cents ?? service.price_cents ?? 0,
    durationMin: override?.duration_min ?? service.duration_min,
    isAddon: service.is_addon,
  };
}

export function estimate(lines: Line[]) {
  return {
    totalCents: lines.reduce((sum, l) => sum + l.priceCents, 0),
    durationMin: lines.reduce((sum, l) => sum + l.durationMin, 0),
    isMinimum: lines.some((l) => l.priceType === 'starting_at'),
  };
}

export const linePrice = (l: Pick<Line, 'priceType' | 'priceCents'>) =>
  l.priceType === 'quote_required' ? 'Quote required' : l.priceType === 'starting_at' ? `From ${formatCents(l.priceCents)}` : formatCents(l.priceCents);

export const estimateLabel = (e: { totalCents: number; isMinimum: boolean }) => `${e.isMinimum ? 'From ' : ''}${formatCents(e.totalCents)}`;

export const aboutDuration = (min: number) => `about ${formatDuration(min)}`;

// Cheapest/most expensive across sizes, for the menu before a size is chosen.
export function priceRange(service: PublicService, sizeIds: string[]) {
  if (service.price_type === 'quote_required') return 'Quote required';
  const prices = (sizeIds.length ? sizeIds : [null]).map((id) => priceFor(service, id).priceCents);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const from = service.price_type === 'starting_at' || lo !== hi ? 'From ' : '';
  return `${from}${formatCents(lo)}`;
}

// --- What the customer sends -----------------------------------------------------------------

const currentYear = new Date().getFullYear();
const text = (max: number, message: string) => z.string().trim().max(max, message);

export const STATES = /^(A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])$/;

export const contactSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Enter your first name.').max(60, 'Use 60 characters or fewer.'),
    lastName: z.string().trim().min(1, 'Enter your last name.').max(60, 'Use 60 characters or fewer.'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, 'Enter a valid email address.')
      .pipe(z.email('Enter a valid email address.')),
    phone: z.string().trim().transform((v, ctx) => {
      const e164 = toE164(v);
      if (!e164) ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit US phone number.' });
      return e164 ?? '';
    }),
    vehicleYear: z
      .string()
      .trim()
      .refine((v) => /^\d{4}$/.test(v) && Number(v) >= 1900 && Number(v) <= currentYear + 2, 'Enter a 4-digit year.')
      .transform(Number),
    vehicleMake: z.string().trim().min(1, 'Enter the make, e.g. Toyota.').max(40, 'Use 40 characters or fewer.'),
    vehicleModel: z.string().trim().min(1, 'Enter the model, e.g. Tacoma.').max(40, 'Use 40 characters or fewer.'),
    vehicleNotes: text(500, 'Use 500 characters or fewer.').optional().transform((v) => v || null),
    notes: text(1000, 'Use 1,000 characters or fewer.').optional().transform((v) => v || null),
    location: z.enum(['mobile', 'shop'], { message: 'Choose where the job happens.' }),
    addressLine1: text(120, 'Use 120 characters or fewer.').optional().default(''),
    city: text(60, 'Use 60 characters or fewer.').optional().default(''),
    // Formats are checked per field (reported with every other error); presence for mobile jobs below.
    state: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .default('')
      .refine((v) => v === '' || STATES.test(v), 'Enter the 2-letter state, e.g. TX.'),
    postalCode: z
      .string()
      .trim()
      .optional()
      .default('')
      .refine((v) => v === '' || /^\d{5}$/.test(v), 'Enter a 5-digit ZIP code.'),
    consent: z.literal('on', { message: 'Please agree so the business can contact you about this booking.' }),
  })
  .superRefine((v, ctx) => {
    if (v.location !== 'mobile') return;
    if (!v.addressLine1) ctx.addIssue({ code: 'custom', path: ['addressLine1'], message: 'Enter the street address.' });
    if (!v.city) ctx.addIssue({ code: 'custom', path: ['city'], message: 'Enter the city.' });
    if (!v.state) ctx.addIssue({ code: 'custom', path: ['state'], message: 'Enter the 2-letter state, e.g. TX.' });
    if (!v.postalCode) ctx.addIssue({ code: 'custom', path: ['postalCode'], message: 'Enter a 5-digit ZIP code.' });
  });

export type ContactInput = z.infer<typeof contactSchema>;

export const selectionSchema = z.object({
  serviceId: z.uuid(),
  addonIds: z.array(z.uuid()).max(9),
  sizeId: z.uuid(),
  start: z.iso.datetime({ offset: true }),
  idempotencyKey: z.uuid(),
});
export type Selection = z.infer<typeof selectionSchema>;

// The JSON the database accepts (allow-listed keys in app.submit_booking_request_core).
export function toRequestPayload(s: Selection, c: ContactInput) {
  const mobile = c.location === 'mobile';
  return {
    service_ids: [s.serviceId, ...s.addonIds],
    vehicle_size_class_id: s.sizeId,
    requested_start: s.start,
    location_type: c.location,
    service_address_line1: mobile ? c.addressLine1 : null,
    service_city: mobile ? c.city : null,
    service_state: mobile ? c.state : null,
    service_postal_code: mobile ? c.postalCode : null,
    contact_first_name: c.firstName,
    contact_last_name: c.lastName,
    contact_phone_e164: c.phone,
    contact_email: c.email,
    vehicle_year: c.vehicleYear,
    vehicle_make: c.vehicleMake,
    vehicle_model: c.vehicleModel,
    vehicle_notes: c.vehicleNotes,
    customer_notes: c.notes,
    consent: true,
  };
}

// Database reasons (DH004 detail / message) → what the customer reads.
export function bookingErrorMessage(e: { code: string; message: string; detail: string | null }): string {
  if (e.code === 'DH005') return 'Too many attempts from this connection. Please wait a few minutes and try again.';
  if (e.code === 'DH003') return 'This business isn’t taking online bookings right now.';
  if (e.message === 'time_unavailable') {
    return e.detail === 'too soon' || e.detail === 'too far ahead'
      ? 'That time is outside the booking window. Please choose another time.'
      : 'That time was just taken or is no longer available. Please choose another time.';
  }
  if (e.message === 'request not accepted') return 'We couldn’t accept another request with these contact details. Please call or text the business.';
  if (e.message === 'unknown or unavailable service' || e.message === 'unknown vehicle size' || e.message === 'add-ons need a main service')
    return 'One of your choices is no longer available. Please review your selection.';
  return 'Something in the form couldn’t be accepted. Please check your details and try again.';
}

// --- Status page ---------------------------------------------------------------------------

export const requestStatusSchema = z.object({
  request_number: z.number(),
  status: z.enum(['pending', 'time_proposed', 'approved', 'declined', 'withdrawn', 'expired', 'proposal_declined', 'closed_duplicate']),
  time_held: z.boolean(),
  business: z.object({ name: z.string(), phone: z.string().nullable(), timezone: z.string(), slug: z.string().nullable() }),
  requested_start: z.string(),
  requested_end: z.string(),
  proposal: z.object({ start: z.string(), end: z.string(), message: z.string().nullable(), answer_by: z.string() }).nullable(),
  decline_message: z.string().nullable(),
  items: z
    .array(z.object({ name: z.string(), price_type: priceType, price_cents: z.number(), duration_min: z.number(), is_addon: z.boolean() }))
    .nullable(),
  size_class: z.string().nullable(),
  vehicle: z.string(),
  location_type: z.enum(['mobile', 'shop']),
  estimate_cents: z.number(),
  estimate_is_minimum: z.boolean(),
  duration_min: z.number(),
  contact: z.object({ phone: z.string().nullable(), email: z.string().nullable() }),
  can_withdraw: z.boolean(),
  appointment: z
    .object({
      status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show']),
      starts_at: z.string(),
      ends_at: z.string(),
      cancelled_by: z.string().nullable(),
      customer_message: z.string().nullable(),
      can_cancel: z.boolean(),
    })
    .nullable(),
  policies: z.object({
    cancellation: z.string().nullable(),
    rescheduling: z.string().nullable(),
    prep_instructions: z.string().nullable(),
    online_cancellation: z.boolean(),
    cancel_cutoff_hours: z.number(),
  }),
});
export type RequestStatus = z.infer<typeof requestStatusSchema>;

// PRODUCT_PLAN §6.4 headlines. `tone` picks the badge colour.
export function statusCopy(s: RequestStatus): { badge: string; tone: 'attention' | 'info' | 'positive' | 'neutral' | 'critical'; headline: string; next: string } {
  const a = s.appointment;
  const name = s.business.name;
  if (a?.status === 'cancelled')
    return { badge: 'Cancelled', tone: 'neutral', headline: 'Appointment cancelled', next: a.cancelled_by === 'customer' ? 'You cancelled this appointment.' : `${name} cancelled this appointment.` };
  if (a?.status === 'completed') return { badge: 'Completed', tone: 'positive', headline: 'Job completed', next: `Thanks for choosing ${sentence(name)}` };
  if (a?.status === 'no_show') return { badge: 'Missed', tone: 'neutral', headline: 'Appointment missed', next: `Contact ${name} to book again.` };
  if (a) return { badge: 'Confirmed', tone: 'positive', headline: 'Appointment confirmed', next: `${name} is expecting you at the time below.` };
  switch (s.status) {
    case 'pending':
      return s.time_held
        ? { badge: 'Pending', tone: 'attention', headline: 'Request received — your time is being held (not a confirmation)', next: `${name} will confirm, decline, or suggest another time.` }
        : { badge: 'Pending', tone: 'attention', headline: 'Request received — not confirmed yet', next: `${name} will confirm, decline, or suggest another time.` };
    case 'time_proposed':
      return { badge: 'New time suggested', tone: 'info', headline: `${name} suggested a different time`, next: 'Accept it to confirm, or decline and send a new request.' };
    case 'declined':
      return { badge: 'Declined', tone: 'neutral', headline: 'Request declined', next: `${name} can’t take this booking.` };
    case 'withdrawn':
      return { badge: 'Withdrawn', tone: 'neutral', headline: 'Request withdrawn', next: 'You withdrew this request.' };
    case 'expired':
      return { badge: 'Expired', tone: 'neutral', headline: 'Request expired', next: 'The requested time passed before it was confirmed.' };
    case 'proposal_declined':
      return { badge: 'Closed', tone: 'neutral', headline: 'Suggested time declined', next: 'You declined the suggested time.' };
    case 'closed_duplicate':
      return { badge: 'Closed', tone: 'neutral', headline: 'Request closed as a duplicate', next: `${name} already has another request from you for this.` };
    default:
      return { badge: 'Confirmed', tone: 'positive', headline: 'Appointment confirmed', next: '' };
  }
}

// "until 1 day before the appointment" / "up to the start time" (cancel_cutoff_hours).
export const cutoffPhrase = (h: number) =>
  h === 0 ? 'up to the start time' : `until ${h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${h} hour${h === 1 ? '' : 's'}`} before the appointment`;

// Ends a sentence after a business name without doubling its own period ("Northside Detail Co.").
export const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);
export { formatDuration };

// --- Owner: what the booking page says (booking_settings text columns) ----------------------


// Booking page → whether customers may cancel online. (The wording customers read moved to
// Settings → Branding in Phase 6: domain/branding brandingFormSchema.)
export const onlineCancellationSchema = z.object({
  onlineCancellation: z.string().optional().transform((v) => v === 'on'),
});
