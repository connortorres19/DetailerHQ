import { z } from 'zod';
import { STATES } from './booking.ts';
import { toE164 } from './business.ts';

// Owner-created appointments (Phase 4E). The database prices, times and checks every one of
// these again; this only gives the owner field-level messages first.

export const SOURCES = [
  { value: 'phone', label: 'Phone call' },
  { value: 'text', label: 'Text message' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'in_person', label: 'In person' },
  { value: 'other', label: 'Other' },
] as const;
export type Source = (typeof SOURCES)[number]['value'];

export const SOURCE_LABEL: Record<string, string> = {
  booking_page: 'Booking page',
  ...Object.fromEntries(SOURCES.map((s) => [s.value, s.label])),
};

const optional = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer.`).optional().transform((v) => v || null);
const uuidOrBlank = z.string().optional().transform((v) => v || null).pipe(z.uuid().nullable());

export const appointmentSchema = z
  .object({
    source: z.enum(['phone', 'text', 'walk_in', 'in_person', 'other'], { message: 'Choose how they contacted you.' }),
    customerMode: z.enum(['existing', 'new']),
    customerId: uuidOrBlank,
    firstName: optional(60, 'First name'),
    lastName: optional(60, 'Last name'),
    phone: z.string().trim().optional().default(''),
    email: z.string().trim().toLowerCase().optional().default(''),
    vehicleMode: z.enum(['existing', 'new']),
    vehicleId: uuidOrBlank,
    year: z.string().trim().optional().default(''),
    make: optional(40, 'Make'),
    model: optional(40, 'Model'),
    color: optional(30, 'Color'),
    // Checked with everything else below, so every missing detail is reported in one go.
    sizeId: z.string().optional().default(''),
    serviceId: z.string().optional().default(''),
    addonIds: z.array(z.uuid()).max(9).default([]),
    holdId: uuidOrBlank,
    date: z.string().optional().default(''),
    slot: z.string().optional().default(''),
    location: z.enum(['mobile', 'shop']),
    addressLine1: optional(120, 'Street address'),
    city: optional(60, 'City'),
    state: z.string().trim().toUpperCase().optional().default(''),
    postalCode: z.string().trim().optional().default(''),
    notes: optional(2000, 'Notes'),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (!z.uuid().safeParse(v.sizeId).success) issue('sizeId', 'Choose a vehicle size.');
    if (!z.uuid().safeParse(v.serviceId).success) issue('serviceId', 'Choose a service.');
    if (v.customerMode === 'existing' && !v.customerId) issue('customerId', 'Choose a customer, or add a new one.');
    if (v.customerMode === 'new') {
      if (!v.firstName) issue('firstName', 'Enter a first name.');
      if (v.phone && !toE164(v.phone)) issue('phone', 'Enter a 10-digit US phone number.');
      if (v.email && !z.email().safeParse(v.email).success) issue('email', 'Enter a valid email address.');
      if (!v.phone && !v.email) issue('phone', 'Enter a phone number or an email address.');
    }
    if (v.vehicleMode === 'existing' && !v.vehicleId) issue('vehicleId', 'Choose a vehicle, or add a new one.');
    if (v.vehicleMode === 'new') {
      if (!v.make) issue('make', 'Enter the make, e.g. Toyota.');
      if (!v.model) issue('model', 'Enter the model, e.g. Tacoma.');
      if (v.year && !(/^\d{4}$/.test(v.year) && Number(v.year) >= 1900 && Number(v.year) <= new Date().getFullYear() + 2)) issue('year', 'Enter a 4-digit year.');
    }
    if (!v.holdId && (!v.slot || Number.isNaN(Date.parse(v.slot)))) issue('slot', 'Choose a start time.');
    if (v.location === 'mobile' && !v.addressLine1) issue('addressLine1', 'Enter the street address for a mobile job.');
    if (v.state && !STATES.test(v.state)) issue('state', 'Enter the 2-letter state, e.g. TX.');
    if (v.postalCode && !/^\d{5}$/.test(v.postalCode)) issue('postalCode', 'Enter a 5-digit ZIP code.');
  });

export type AppointmentInput = z.infer<typeof appointmentSchema>;

// Arguments for public.create_owner_appointment. No price, duration or business id: the
// database derives them.
export function toCreateArgs(v: AppointmentInput) {
  const newCustomer = v.customerMode === 'new';
  const newVehicle = v.vehicleMode === 'new';
  const address = v.location === 'mobile' && (v.addressLine1 || v.city || v.state || v.postalCode)
    ? { line1: v.addressLine1 ?? '', city: v.city ?? '', state: v.state, postal_code: v.postalCode }
    : null;
  return {
    p_customer_id: newCustomer ? null : v.customerId,
    p_customer: newCustomer ? { first_name: v.firstName ?? '', last_name: v.lastName ?? '', phone_e164: v.phone ? toE164(v.phone) : '', email: v.email } : null,
    p_vehicle_id: newVehicle ? null : v.vehicleId,
    p_vehicle: newVehicle ? { year: v.year ? Number(v.year) : null, make: v.make ?? '', model: v.model ?? '', color: v.color ?? '' } : null,
    p_size_class_id: v.sizeId,
    p_service_ids: [v.serviceId, ...v.addonIds],
    p_starts_at: v.holdId ? null : v.slot,
    p_location_type: v.location,
    p_address: address,
    p_source: v.source,
    p_internal_notes: v.notes,
    p_hold_id: v.holdId,
  };
}

export const TIME_UNAVAILABLE: Record<string, string> = {
  'fully booked': 'That time is already fully booked (including the buffer between jobs).',
  'outside working hours': 'The job doesn’t fit inside your working hours that day.',
  'time off': 'That time overlaps time you’ve blocked off.',
  'daily limit reached': 'You’ve reached your daily job limit for that day.',
  'too soon': 'That’s sooner than your minimum notice. Lower it in Availability → Booking rules if you need to.',
  'too far ahead': 'That’s beyond how far ahead you take bookings.',
  'spans more than one day': 'A job can’t run past midnight.',
};
