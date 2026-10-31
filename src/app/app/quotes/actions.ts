'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { TIME_UNAVAILABLE } from '@/domain/appointments';
import { slotsSchema } from '@/domain/booking';
import { isClock, isIsoDate, localTimestamp } from '@/domain/bookings';
import { toE164 } from '@/domain/business';
import { failed, formValues, type FormState } from '@/domain/forms';
import { parseLines, toItemsPayload } from '@/domain/leads';
import { parseMoney } from '@/domain/service';
import { requireBusiness } from '@/data/session';
import { callWorkflow } from '@/data/workflow';
import { quoteLinkKey } from '@/lib/booking/server';
import { createClient } from '@/lib/supabase/server';

// Quotes (Phase 5). Every change is one database function call (owners can't write quotes
// directly since migration 14): drafts are saved with their items in one transaction; sending
// freezes prices and issues the link; booking an accepted quote runs the Phase 4 engine under the
// capacity lock, once.

const id = z.uuid();
const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

const quoteSchema = z
  .object({
    leadId: z.string().optional().transform((v) => v || null).pipe(z.uuid().nullable()),
    customerMode: z.enum(['existing', 'new']),
    customerId: z.string().optional().default(''),
    firstName: optional(60),
    lastName: optional(60),
    phone: z.string().trim().optional().default(''),
    email: z.string().trim().toLowerCase().optional().default(''),
    vehicleMode: z.enum(['existing', 'new']),
    vehicleId: z.string().optional().default(''),
    year: z.string().trim().optional().default(''),
    make: optional(40),
    model: optional(40),
    sizeId: z.string().optional().default(''),
    validUntil: z.string().optional().default(''),
    discount: z.string().trim().optional().default(''),
    proposedDate: z.string().optional().default(''),
    proposedTime: z.string().optional().default(''),
    notes: z.string().trim().max(2000, 'Notes for the customer: 2,000 characters or fewer.').optional().transform((v) => v || null),
    terms: z.string().trim().max(2000, 'Terms: 2,000 characters or fewer.').optional().transform((v) => v || null),
    internalNotes: z.string().trim().max(2000, 'Internal notes: 2,000 characters or fewer.').optional().transform((v) => v || null),
    lines: z.string(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.customerMode === 'existing' && !id.safeParse(v.customerId).success) issue('customerId', 'Choose a customer, or add a new one.');
    if (v.customerMode === 'new') {
      if (!v.firstName) issue('firstName', 'Enter a first name.');
      if (v.phone && !toE164(v.phone)) issue('phone', 'Enter a 10-digit US phone number.');
      if (v.email && !z.email().safeParse(v.email).success) issue('email', 'Enter a valid email address.');
      if (!v.phone && !v.email) issue('phone', 'Enter a phone number or an email address.');
    }
    if (v.vehicleMode === 'existing' && !id.safeParse(v.vehicleId).success) issue('vehicleId', 'Choose a vehicle, or add one.');
    if (v.vehicleMode === 'new') {
      if (!v.make) issue('make', 'Enter the make.');
      if (!v.model) issue('model', 'Enter the model.');
      if (v.year && !/^\d{4}$/.test(v.year)) issue('year', 'Enter a 4-digit year.');
    }
    if (v.validUntil && !isIsoDate(v.validUntil)) issue('validUntil', 'Choose a date.');
    if (v.discount && parseMoney(v.discount) === null) issue('discount', 'Enter an amount like 25 or 25.00.');
    if ((v.proposedDate || v.proposedTime) && !(isIsoDate(v.proposedDate) && isClock(v.proposedTime))) issue('proposedDate', 'Choose both a date and a time, or leave both empty.');
  });

const SAVE_MESSAGES: Record<string, string> = {
  'discount is more than the subtotal': 'The discount is more than the subtotal.',
  'unknown service or vehicle size': 'One of the services or the vehicle size wasn’t found. Choose again.',
  'only draft quotes can be edited': 'This quote has been sent, so its prices are frozen. Withdraw it to edit.',
};

export async function saveQuote(quoteId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness('/app/quotes');
  const raw = Object.fromEntries(formData);
  const v = quoteSchema.safeParse(raw);
  const echo = formValues(formData);
  if (!v.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of v.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { ...failed('Check the highlighted fields.', formData, fieldErrors), values: echo };
  }
  const lines = parseLines(v.data.lines);
  if (!lines.ok) return { ...failed(lines.message, formData, { lines: lines.message }), values: echo };
  if (quoteId && !id.safeParse(quoteId).success) return failed('Quote not found.');
  const d = v.data;

  const result = await callWorkflow('save_quote', {
    p_quote_id: (quoteId ?? null) as unknown as string,
    p_quote: {
      lead_id: d.leadId,
      valid_until: d.validUntil || null,
      notes: d.notes,
      terms: d.terms,
      internal_notes: d.internalNotes,
      discount_cents: d.discount ? parseMoney(d.discount) : 0,
      proposed_start: d.proposedDate ? localTimestamp(d.proposedDate, d.proposedTime, business.timezone) : null,
    },
    p_customer_id: (d.customerMode === 'existing' ? d.customerId : null) as unknown as string,
    p_customer: (d.customerMode === 'new' ? { first_name: d.firstName, last_name: d.lastName ?? '', phone_e164: d.phone ? toE164(d.phone) : '', email: d.email } : null) as never,
    p_vehicle_id: (d.customerMode === 'existing' && d.vehicleMode === 'existing' ? d.vehicleId : null) as unknown as string,
    p_vehicle: (d.vehicleMode === 'new' || d.customerMode === 'new'
      ? { year: d.year ? Number(d.year) : null, make: d.make ?? '', model: d.model ?? '', size_class_id: id.safeParse(d.sizeId).success ? d.sizeId : null }
      : null) as never,
    p_items: toItemsPayload(lines.lines) as never,
  });
  if (!result.ok) {
    const raw = result.reason ?? '';
    const message = result.kind === 'not_found' ? 'That customer, vehicle, lead or quote wasn’t found.' : (SAVE_MESSAGES[raw] ?? (result.kind === 'invalid_state' ? SAVE_MESSAGES['only draft quotes can be edited']! : 'Some details weren’t accepted. Check prices, quantities and contact details.'));
    return { ...failed(message, formData), values: echo };
  }
  revalidatePath('/app', 'layout');
  redirect(`/app/quotes/${result.data}?saved=1`);
}

// Sending: a random nonce kept with the quote; the link token is an HMAC of it under the server
// secret, and only the token's SHA-256 is stored. Re-sending keeps the existing link.
export async function sendQuote(quoteId: string): Promise<FormState> {
  await requireBusiness('/app/quotes');
  if (!id.safeParse(quoteId).success) return failed('Quote not found.');
  // The database makes the link token; the server only supplies its link key.
  const result = await callWorkflow('send_quote', { p_quote_id: quoteId, p_link_key: `\\x${quoteLinkKey().toString('hex')}` });
  if (!result.ok)
    return failed(
      result.detail === 'valid_until'
        ? 'Set an expiry date from today on before sending.'
        : result.reason === 'add at least one line item'
          ? 'Add at least one line item before sending.'
          : result.kind === 'invalid_state'
            ? 'Only drafts can be sent.'
            : result.message,
    );
  revalidatePath('/app', 'layout');
  redirect(`/app/quotes/${quoteId}?sent=1`);
}

export async function withdrawQuote(quoteId: string): Promise<FormState> {
  await requireBusiness('/app/quotes');
  if (!id.safeParse(quoteId).success) return failed('Quote not found.');
  const result = await callWorkflow('withdraw_quote', { p_quote_id: quoteId });
  if (!result.ok) return failed(result.kind === 'invalid_state' ? 'Only a sent quote that hasn’t been answered can be withdrawn.' : result.message);
  revalidatePath('/app', 'layout');
  return { status: 'success', message: 'Quote withdrawn — the link no longer works. It’s a draft again.', values: { at: String(Date.now()) } };
}

export async function deleteQuote(quoteId: string): Promise<FormState> {
  await requireBusiness('/app/quotes');
  if (!id.safeParse(quoteId).success) return failed('Quote not found.');
  const result = await callWorkflow('delete_quote', { p_quote_id: quoteId });
  if (!result.ok) return failed('Only drafts can be deleted.');
  revalidatePath('/app', 'layout');
  redirect('/app/quotes?deleted=1');
}

export async function saveQuoteNotes(quoteId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/quotes');
  const notes = String(formData.get('internalNotes') ?? '').trim();
  if (!id.safeParse(quoteId).success || notes.length > 2000) return failed('Use 2,000 characters or fewer.', formData);
  const supabase = await createClient();
  const { error } = await supabase.from('quotes').update({ internal_notes: notes || null }).eq('id', quoteId);
  if (error) return failed('That didn’t save.', formData);
  revalidatePath('/app', 'layout');
  return { status: 'success', message: 'Internal notes saved.', values: { ...formValues(formData), at: String(Date.now()) } };
}

const convertSchema = z.object({
  date: z.string().refine(isIsoDate, 'Choose a date.'),
  slot: z.string().optional().default(''),
  time: z.string().optional().default(''),
  hours: z.string().optional().default(''),
  minutes: z.string().optional().default(''),
  location: z.enum(['mobile', 'shop']),
  addressLine1: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().max(60).optional().default(''),
  state: z.string().trim().toUpperCase().optional().default(''),
  postalCode: z.string().trim().optional().default(''),
});

export async function convertQuote(quoteId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness('/app/quotes');
  const v = convertSchema.safeParse(Object.fromEntries(formData));
  if (!id.safeParse(quoteId).success) return failed('Quote not found.');
  if (!v.success) return failed(v.error.issues[0]!.message, formData);
  const d = v.data;
  const start = d.slot && !Number.isNaN(Date.parse(d.slot)) ? d.slot : isClock(d.time) ? localTimestamp(d.date, d.time, business.timezone) : null;
  if (!start) return failed('Choose a start time.', formData);
  if (d.location === 'mobile' && !d.addressLine1) return failed('Enter the street address for a mobile job.', formData);
  const duration = d.hours || d.minutes ? Number(d.hours || 0) * 60 + Number(d.minutes || 0) : null;
  const result = await callWorkflow('convert_quote', {
    p_quote_id: quoteId,
    p_starts_at: start,
    p_location_type: d.location,
    p_address: (d.location === 'mobile' ? { line1: d.addressLine1, city: d.city, state: d.state, postal_code: d.postalCode } : null) as never,
    ...(duration ? { p_duration_min: duration } : {}),
  });
  if (!result.ok) {
    const message =
      result.detail && TIME_UNAVAILABLE[result.detail]
        ? TIME_UNAVAILABLE[result.detail]!
        : result.detail === 'duration'
          ? 'Set how long the job takes (15 minutes to 72 hours).'
          : result.kind === 'invalid_state'
            ? 'This quote is already booked, or hasn’t been accepted.'
            : result.kind === 'capacity_exceeded'
              ? 'That time was just taken. Choose another.'
              : 'Some details weren’t accepted. Check the address and time.';
    return failed(message, formData);
  }
  revalidatePath('/app', 'layout');
  redirect(`/app/bookings/${result.data}?created=1`);
}

export async function quoteSlots(durationMin: number, date: string): Promise<{ ok: true; slots: string[] } | { ok: false; message: string }> {
  await requireBusiness('/app/quotes');
  if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 4320 || !isIsoDate(date)) return { ok: false, message: 'Set the job length and a date.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('owner_slots_for_duration', { p_duration_min: durationMin, p_from: date, p_days: 1 });
  if (error) return { ok: false, message: 'Open times couldn’t be listed.' };
  return { ok: true, slots: slotsSchema.parse(data).days.find((x) => x.date === date)?.slots ?? [] };
}
