import { z } from 'zod';
import type { StatusTone } from '../components/ui/StatusBadge.tsx';
import { toE164 } from './business.ts';
import { parseMoney } from './service.ts';

// Leads and quotes (Phase 5). The database is the final authority (migration 14); these give
// owners field-level messages and shared labels.

// --- Leads -------------------------------------------------------------------------------------

// Pipeline statuses. Stored values come from Phase 1 (quote_sent = "Quoted", booked = "Converted");
// follow_up_due is a legacy value shown as "Contacted" (follow-ups are a date, not a status).
export const LEAD_STATUSES = [
  { value: 'new', label: 'New', tone: 'attention' },
  { value: 'contacted', label: 'Contacted', tone: 'info' },
  { value: 'quote_sent', label: 'Quoted', tone: 'info' },
  { value: 'booked', label: 'Converted', tone: 'positive' },
  { value: 'lost', label: 'Lost', tone: 'neutral' },
] as const satisfies readonly { value: string; label: string; tone: StatusTone }[];
export type LeadStatus = (typeof LEAD_STATUSES)[number]['value'];

export function leadStatus(value: string) {
  const v = value === 'follow_up_due' ? 'contacted' : value;
  return LEAD_STATUSES.find((s) => s.value === v) ?? LEAD_STATUSES[0];
}

// How a lead came in. The booking page and a few older values are shown but not offered.
export const LEAD_SOURCES = [
  { value: 'phone', label: 'Phone' },
  { value: 'text', label: 'Text' },
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' },
  { value: 'social_media', label: 'Social media' },
  { value: 'other', label: 'Other' },
] as const;
export const SOURCE_LABELS: Record<string, string> = {
  ...Object.fromEntries(LEAD_SOURCES.map((s) => [s.value, s.label])),
  booking_page: 'Booking page',
  instagram: 'Instagram',
  facebook: 'Facebook',
  google: 'Google',
  repeat: 'Repeat customer',
};

export const LOST_REASONS = [
  { value: 'price', label: 'Price' },
  { value: 'timing', label: 'Timing' },
  { value: 'went_elsewhere', label: 'Went elsewhere' },
  { value: 'no_response', label: 'No response' },
  { value: 'not_a_fit', label: 'Not a fit' },
  { value: 'other', label: 'Other' },
] as const;

export const CONTACT_CHANNELS = [
  { value: 'phone', label: 'Call' },
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'in_person', label: 'In person' },
  { value: 'other', label: 'Other' },
] as const;

const optional = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer.`).optional().transform((v) => v || null);
const uuidOrNull = z.string().optional().transform((v) => v || null).pipe(z.uuid().nullable());

export const leadSchema = z
  .object({
    source: z.enum(['phone', 'text', 'website', 'walk_in', 'referral', 'social_media', 'other', 'booking_page', 'instagram', 'facebook', 'google', 'repeat'], {
      message: 'Choose how the lead came in.',
    }),
    customerId: uuidOrNull,
    vehicleId: uuidOrNull,
    firstName: optional(60, 'First name'),
    lastName: optional(60, 'Last name'),
    phone: z.string().trim().optional().default(''),
    email: z.string().trim().toLowerCase().optional().default(''),
    year: z.string().trim().optional().default(''),
    make: optional(40, 'Make'),
    model: optional(40, 'Model'),
    sizeId: uuidOrNull,
    serviceId: uuidOrNull,
    request: optional(2000, 'Request'),
    notes: optional(2000, 'Notes'),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (!v.firstName) issue('firstName', 'Enter a first name.');
    if (v.phone && !toE164(v.phone)) issue('phone', 'Enter a 10-digit US phone number.');
    if (v.email && !z.email().safeParse(v.email).success) issue('email', 'Enter a valid email address.');
    if (!v.customerId && !v.phone && !v.email) issue('phone', 'Enter a phone number or an email address.');
    if (v.year && !(/^\d{4}$/.test(v.year) && Number(v.year) >= 1900 && Number(v.year) <= new Date().getFullYear() + 2)) issue('year', 'Enter a 4-digit year.');
  });
export type LeadInput = z.infer<typeof leadSchema>;

export function toLeadRow(v: LeadInput) {
  return {
    source: v.source,
    customer_id: v.customerId,
    vehicle_id: v.customerId ? v.vehicleId : null,
    contact_first_name: v.firstName!,
    contact_last_name: v.lastName,
    contact_phone_e164: v.phone ? toE164(v.phone) : null,
    contact_email: v.email || null,
    vehicle_year: v.year ? Number(v.year) : null,
    vehicle_make: v.make,
    vehicle_model: v.model,
    size_class_id: v.sizeId,
    service_id: v.serviceId,
    request_text: v.request,
    notes: v.notes,
  };
}

export const leadVehicle = (l: { vehicle_year: number | null; vehicle_make: string | null; vehicle_model: string | null; vehicle_description?: string | null }) =>
  [l.vehicle_year, l.vehicle_make, l.vehicle_model].filter(Boolean).join(' ') || l.vehicle_description || '';

// --- Quotes ------------------------------------------------------------------------------------

export const QUOTE_STATUSES = [
  { value: 'draft', label: 'Draft', tone: 'neutral' },
  { value: 'sent', label: 'Sent', tone: 'attention' },
  { value: 'accepted', label: 'Accepted', tone: 'positive' },
  { value: 'declined', label: 'Declined', tone: 'neutral' },
  { value: 'expired', label: 'Expired', tone: 'neutral' },
  { value: 'converted', label: 'Booked', tone: 'positive' },
] as const satisfies readonly { value: string; label: string; tone: StatusTone }[];

// A sent quote past its date reads as expired before the daily job stores it.
export function quoteStatus(status: string, validUntil: string | null, today: string) {
  const v = status === 'sent' && validUntil && validUntil < today ? 'expired' : status;
  return QUOTE_STATUSES.find((s) => s.value === v) ?? QUOTE_STATUSES[0];
}

export type QuoteLine = { serviceId: string | null; name: string; description: string | null; quantity: number; priceCents: number; durationMin: number | null };

const lineSchema = z.object({
  serviceId: z.string().optional().transform((v) => v || null).pipe(z.uuid().nullable()),
  name: z.string().trim().min(1, 'Name every line.').max(80, 'Line names must be 80 characters or fewer.'),
  description: z.string().trim().max(500, 'Descriptions must be 500 characters or fewer.').optional().transform((v) => v || null),
  quantity: z.coerce.number().int('Quantities are whole numbers.').min(1, 'Quantities are 1 to 99.').max(99, 'Quantities are 1 to 99.'),
  price: z.string().transform((v, ctx) => {
    const cents = parseMoney(v);
    if (cents === null) ctx.addIssue({ code: 'custom', message: 'Enter prices like 180 or 180.00.' });
    return cents ?? 0;
  }),
  durationMin: z.coerce.number().int().min(0).max(4320).optional().nullable(),
});

export function parseLines(json: string): { ok: true; lines: QuoteLine[] } | { ok: false; message: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, message: 'The line items couldn’t be read. Refresh and try again.' };
  }
  const r = z.array(lineSchema).min(1, 'Add at least one line item.').max(50, 'Up to 50 line items.').safeParse(raw);
  if (!r.success) return { ok: false, message: r.error.issues[0]!.message };
  return {
    ok: true,
    lines: r.data.map((l) => ({ serviceId: l.serviceId, name: l.name, description: l.description, quantity: l.quantity, priceCents: l.price, durationMin: l.durationMin ?? null })),
  };
}

export const quoteTotals = (lines: Pick<QuoteLine, 'quantity' | 'priceCents'>[], discountCents: number) => {
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.priceCents, 0);
  return { subtotal, discount: discountCents, total: subtotal - discountCents };
};

export const quoteDuration = (lines: Pick<QuoteLine, 'quantity' | 'durationMin'>[]) => lines.reduce((s, l) => s + (l.durationMin ?? 0) * l.quantity, 0);

// The JSON the database accepts for items (public.save_quote).
export const toItemsPayload = (lines: QuoteLine[]) =>
  lines.map((l) => ({ service_id: l.serviceId, name: l.name, description: l.description, quantity: l.quantity, price_cents: l.priceCents, duration_min: l.durationMin }));

// --- History wording (activity_events for leads and quotes) ----------------------------------

const CHANNEL_WORD: Record<string, string> = { phone: 'Called', text: 'Texted', email: 'Emailed', in_person: 'Spoke in person', other: 'Contacted' };

export function pipelineHistoryLine(e: { kind: string; from_status: string | null; to_status: string | null; actor_type: string; metadata: Record<string, unknown> }) {
  const who = e.actor_type === 'customer' ? 'Customer' : e.actor_type === 'owner' ? 'You' : 'System';
  const note = typeof e.metadata.note === 'string' ? ` — “${e.metadata.note}”` : '';
  switch (e.kind) {
    case 'lead_created':
      return 'Lead added';
    case 'lead_status_changed':
      return `${who} moved it to ${leadStatus(e.to_status ?? 'new').label}${e.metadata.lost_reason ? ` (${LOST_REASONS.find((r) => r.value === e.metadata.lost_reason)?.label ?? ''})` : ''}`;
    case 'lead_note':
      return `Note${note}`;
    case 'lead_contacted':
      return `${CHANNEL_WORD[String(e.metadata.channel)] ?? 'Contacted'}${note}`;
    case 'lead_customer_linked':
      return e.metadata.new_customer ? 'Customer record created' : 'Linked to an existing customer';
    case 'follow_up_done':
      return `Follow-up done${note}`;
    case 'quote_status_changed': {
      const to = e.to_status ?? '';
      if (to === 'sent') return 'Quote sent';
      if (to === 'draft') return 'Quote withdrawn (link disabled)';
      if (to === 'accepted') return `${who === 'Customer' ? 'Customer accepted' : 'Accepted'} the quote`;
      if (to === 'declined') return `${who === 'Customer' ? 'Customer declined' : 'Declined'} the quote`;
      if (to === 'expired') return 'Quote expired';
      if (to === 'converted') return 'Booked from the quote';
      return `Quote ${to}`;
    }
    case 'appointment_created':
      return 'Booking created';
    default:
      return e.kind.replaceAll('_', ' ');
  }
}
