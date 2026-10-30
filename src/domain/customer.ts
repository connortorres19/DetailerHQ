import { z } from 'zod';
import { optionalEmail, optionalPhone } from './business';

// Mirrors the customers / vehicles table checks (migration 20261030120100). The database
// stays the final authority; these give owners field-level messages first.

const optionalText = (max: number, label = 'This') =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .transform((v) => v || null);

export const CONTACT_PREFERENCES = [
  { value: 'text', label: 'Text' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
] as const;

export const LEAD_SOURCES = [
  { value: 'repeat', label: 'Repeat customer' },
  { value: 'referral', label: 'Referral' },
  { value: 'phone', label: 'Phone call' },
  { value: 'text', label: 'Text message' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'google', label: 'Google' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'booking_page', label: 'Booking page' },
  { value: 'other', label: 'Other' },
] as const;

// '' (the "not set" option) → null; otherwise one of the database enum values.
const enumOrNull = <const T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal('')], { message: 'Choose one of the options.' })
    .transform((v) => (v === '' ? null : (v as T[number])));

export const customerSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Enter a first name.').max(60, 'Use 60 characters or fewer.'),
    lastName: optionalText(60, 'Last name'),
    phone: optionalPhone,
    email: optionalEmail,
    preferredContact: enumOrNull(['call', 'text', 'email']),
    source: enumOrNull(['booking_page', 'phone', 'text', 'instagram', 'facebook', 'google', 'referral', 'walk_in', 'repeat', 'other']),
    addressLine1: optionalText(120, 'Address'),
    city: optionalText(60, 'City'),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === '' || /^[A-Z]{2}$/.test(v), 'Use the 2-letter state code, e.g. TX.')
      .transform((v) => v || null),
    postalCode: z
      .string()
      .trim()
      .refine((v) => v === '' || /^[0-9]{5}(-[0-9]{4})?$/.test(v), 'Enter a 5-digit ZIP code.')
      .transform((v) => v || null),
    notes: optionalText(2000, 'Notes'),
  })
  .transform((v, ctx) => {
    // customers check: a phone number or an email is required.
    if (!v.phone && !v.email) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Add a phone number or an email so you can reach them.' });
      return z.NEVER;
    }
    return v;
  });

export type CustomerInput = z.infer<typeof customerSchema>;

export const toCustomerRow = (v: CustomerInput) => ({
  first_name: v.firstName,
  last_name: v.lastName,
  phone_e164: v.phone,
  email: v.email,
  preferred_contact: v.preferredContact,
  source: v.source,
  address_line1: v.addressLine1,
  city: v.city,
  state: v.state,
  postal_code: v.postalCode,
  notes: v.notes,
});

const currentYear = new Date().getFullYear();

export const vehicleSchema = z.object({
  year: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d{4}$/.test(v) && Number(v) >= 1900 && Number(v) <= currentYear + 2), 'Enter a 4-digit year.')
    .transform((v) => (v ? Number(v) : null)),
  make: z.string().trim().min(1, 'Enter the make, e.g. Toyota.').max(40, 'Use 40 characters or fewer.'),
  model: z.string().trim().min(1, 'Enter the model, e.g. Tacoma.').max(40, 'Use 40 characters or fewer.'),
  trim: optionalText(40, 'Trim'),
  color: optionalText(30, 'Color'),
  sizeClassId: z
    .string()
    .transform((v) => v || null)
    .pipe(z.uuid('Choose a size.').nullable()),
  plate: z
    .string()
    .trim()
    .toUpperCase()
    .max(10, 'Use 10 characters or fewer.')
    .transform((v) => v || null),
  notes: optionalText(1000, 'Notes'),
});

export type VehicleInput = z.infer<typeof vehicleSchema>;

export const toVehicleRow = (v: VehicleInput) => ({
  year: v.year,
  make: v.make,
  model: v.model,
  trim: v.trim,
  color: v.color,
  size_class_id: v.sizeClassId,
  plate: v.plate,
  notes: v.notes,
});

export const idSchema = z.uuid();

// Search text is used inside a PostgREST `or=(…)` filter, so characters with meaning in that
// grammar are removed before building it (RLS still limits results to the owner's business).
export function searchTerms(raw: string | undefined) {
  const text = (raw ?? '').replace(/[,()*%\\:"]/g, ' ').trim().slice(0, 60);
  const digits = text.replace(/\D/g, '');
  return { text, digits };
}

export const customerName = (c: { first_name: string; last_name: string | null }) => [c.first_name, c.last_name].filter(Boolean).join(' ');

export const vehicleName = (v: { year: number | null; make: string; model: string; trim?: string | null }) =>
  [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');
