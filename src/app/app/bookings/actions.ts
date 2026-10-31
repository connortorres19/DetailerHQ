'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { HOLD_HOURS, isClock, isIsoDate, localTimestamp } from '@/domain/bookings';
import { slotsSchema } from '@/domain/booking';
import { failed, type FormState } from '@/domain/forms';
import { getBooking } from '@/data/bookings';
import { requireBusiness } from '@/data/session';
import { callWorkflow, type WorkflowResult } from '@/data/workflow';
import { createClient } from '@/lib/supabase/server';

// Owner booking actions (Phase 4D). Every change is one call to an authorized workflow function
// (public.* SECURITY INVOKER → app.*_impl): membership, state rules, the capacity lock and the
// capacity trigger are all enforced in the database, in one transaction. Ids arrive bound from
// the server-rendered page; the database derives the business from them and refuses other
// businesses' ids as "not found". Prices and durations are never accepted from the browser.

const id = z.uuid();
// Optional text: absent (e.g. an unticked "show a message" field) or blank both mean null.
const text = (max: number) =>
  z.string().trim().max(max, `Use ${max} characters or fewer.`).optional().transform((v) => v || null);

// `at` lets the page show the most recent result when several actions ran in one visit.
function done(message: string): FormState {
  revalidatePath('/app', 'layout');
  return { status: 'success', message, values: { at: String(Date.now()) } };
}

function refused(result: Extract<WorkflowResult<unknown>, { ok: false }>, overrides: Partial<Record<string, string>> = {}, formData?: FormData): FormState {
  revalidatePath('/app', 'layout');
  const message =
    overrides[result.kind] ??
    (result.kind === 'invalid_state' ? 'This booking has changed since you opened it. Refresh to see its current state.' : result.message);
  return failed(message, formData);
}

// --- Requests ---------------------------------------------------------------------------------

export async function approveBooking(requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/bookings');
  const choice = String(formData.get('customer') ?? 'new');
  const vehicle = String(formData.get('vehicle') ?? 'new');
  if (!id.safeParse(requestId).success) return failed('Booking not found.');
  const customerId = choice === 'new' ? null : id.safeParse(choice).success ? choice : undefined;
  const vehicleId = vehicle === 'new' || customerId === null ? null : id.safeParse(vehicle).success ? vehicle : undefined;
  if (customerId === undefined || vehicleId === undefined) return failed('Choose who this booking is for.');

  const result = await callWorkflow('approve_request', {
    p_request_id: requestId,
    ...(customerId ? { p_customer_id: customerId } : {}),
    ...(vehicleId ? { p_vehicle_id: vehicleId } : {}),
  });
  if (!result.ok)
    return refused(result, {
      capacity_exceeded: 'That time is already fully booked. Propose another time, or decline the request.',
      not_found: 'That booking, customer or vehicle wasn’t found.',
    });
  return done('Booking confirmed. The customer sees it on their booking link.');
}

const declineSchema = z.object({ reason: text(500), share: z.string().optional(), message: text(500) });

export async function declineBooking(requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/bookings');
  const v = declineSchema.safeParse(Object.fromEntries(formData));
  if (!id.safeParse(requestId).success) return failed('Booking not found.');
  if (!v.success) return failed(v.error.issues[0]!.message, formData);
  // The internal reason stays private; a message reaches the customer only when the owner asks.
  const message = v.data.share === 'on' ? v.data.message : null;
  if (v.data.share === 'on' && !message) return failed('Write the message for the customer, or untick “Show a message”.', formData);
  const result = await callWorkflow('decline_request', {
    p_request_id: requestId,
    ...(message ? { p_customer_message: message } : {}),
    ...(v.data.reason ? { p_internal_reason: v.data.reason } : {}),
  });
  if (!result.ok) return refused(result, {}, formData);
  return done('Request declined.');
}

// Open start times for this booking's own services and vehicle size on one local date, from the
// same availability engine as the public page (read again from the database, never from the
// browser).
export async function bookingSlots(bookingId: string, date: string): Promise<{ ok: true; slots: string[] } | { ok: false; message: string }> {
  await requireBusiness('/app/bookings');
  if (!id.safeParse(bookingId).success || !isIsoDate(date)) return { ok: false, message: 'Choose a date.' };
  const booking = await getBooking(bookingId);
  if (!booking) return { ok: false, message: 'Booking not found.' };
  const serviceIds = booking.row.items.map((i) => i.serviceId).filter((s): s is string => Boolean(s));
  const sizeId = (booking.request?.vehicle_size_class_id as string | undefined) ?? booking.appointment?.vehicle?.size_class_id ?? null;
  if (!serviceIds.length || !sizeId) return { ok: false, message: 'Open times can’t be listed for this booking. Enter a time instead.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('preview_available_slots', { p_service_ids: serviceIds, p_size_class_id: sizeId, p_from: date, p_days: 1 });
  if (error) return { ok: false, message: 'Open times can’t be listed for these services any more. Enter a time instead.' };
  const parsed = slotsSchema.parse(data);
  return { ok: true, slots: parsed.days.find((d) => d.date === date)?.slots ?? [] };
}

const proposeSchema = z.object({
  date: z.string().refine(isIsoDate, 'Choose a date.'),
  slot: z.string().min(1, 'Choose one of the open times.'),
  message: text(500),
  answerHours: z.enum(['12', '24', '48', '72']),
});

export async function proposeTime(requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/bookings');
  const v = proposeSchema.safeParse(Object.fromEntries(formData));
  if (!id.safeParse(requestId).success) return failed('Booking not found.');
  if (!v.success) return failed(v.error.issues[0]!.message, formData);
  // "Still available": the chosen time must be one the engine lists right now (hours, breaks,
  // blocked time, buffer, notice, capacity). The capacity trigger re-checks inside the write.
  const open = await bookingSlots(requestId, v.data.date);
  if (!open.ok) return failed(open.message, formData);
  if (!open.slots.includes(v.data.slot)) return failed('That time is no longer open. Choose another.', formData);
  const result = await callWorkflow('propose_time', {
    p_request_id: requestId,
    p_start: v.data.slot,
    p_expires_hours: Number(v.data.answerHours),
    ...(v.data.message ? { p_message: v.data.message } : {}),
  });
  if (!result.ok)
    return refused(result, { capacity_exceeded: 'That time was just taken. Choose another.' }, formData);
  return done('New time proposed. The customer can accept or decline it on their booking link.');
}

export async function retractProposal(requestId: string): Promise<FormState> {
  await requireBusiness('/app/bookings');
  if (!id.safeParse(requestId).success) return failed('Booking not found.');
  const result = await callWorkflow('retract_proposal', { p_request_id: requestId });
  if (!result.ok) return refused(result);
  return done('Proposal withdrawn. The request is pending again.');
}

export async function holdRequest(requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/bookings');
  const hours = String(formData.get('hours') ?? '');
  if (!id.safeParse(requestId).success) return failed('Booking not found.');
  if (!HOLD_HOURS.some((h) => h.value === hours)) return failed('Choose how long to hold the time.');
  const result = await callWorkflow('place_hold', { p_request_id: requestId, p_hours: Number(hours) });
  if (!result.ok)
    return refused(result, { capacity_exceeded: 'That time is already fully booked, so it can’t be held.' });
  return done('Time held. It’s not a confirmation — the customer still sees “pending”.');
}

export async function releaseRequestHold(requestId: string): Promise<FormState> {
  await requireBusiness('/app/bookings');
  if (!id.safeParse(requestId).success) return failed('Booking not found.');
  const result = await callWorkflow('release_hold', { p_request_id: requestId });
  if (!result.ok) return refused(result);
  return done('Hold released.');
}

export async function closeDuplicate(requestId: string, duplicateOfId: string): Promise<FormState> {
  await requireBusiness('/app/bookings');
  if (!id.safeParse(requestId).success || !id.safeParse(duplicateOfId).success) return failed('Booking not found.');
  const result = await callWorkflow('close_duplicate', { p_request_id: requestId, p_duplicate_of: duplicateOfId });
  if (!result.ok) return refused(result);
  return done('Closed as a duplicate.');
}

// --- Appointments -------------------------------------------------------------------------------

const cancelSchema = z.object({ reason: text(500), share: z.string().optional(), message: text(500) });

export async function cancelBooking(appointmentId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/bookings');
  const v = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!id.safeParse(appointmentId).success) return failed('Booking not found.');
  if (!v.success) return failed(v.error.issues[0]!.message, formData);
  const message = v.data.share === 'on' ? v.data.message : null;
  const result = await callWorkflow('cancel_appointment', {
    p_appointment_id: appointmentId,
    ...(v.data.reason ? { p_reason: v.data.reason } : {}),
    ...(message ? { p_customer_message: message } : {}),
  });
  if (!result.ok) return refused(result, {}, formData);
  return done('Appointment cancelled. The time is free again.');
}

const rescheduleSchema = z.object({
  date: z.string().refine(isIsoDate, 'Choose a date.'),
  slot: z.string().optional().default(''),
  time: z.string().optional().default(''),
});

export async function rescheduleBooking(appointmentId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness('/app/bookings');
  const v = rescheduleSchema.safeParse(Object.fromEntries(formData));
  if (!id.safeParse(appointmentId).success) return failed('Booking not found.');
  if (!v.success) return failed(v.error.issues[0]!.message, formData);
  // Either an open time from the list (an ISO instant) or a time the owner types, read by the
  // database in the business's own zone (never the zone bound from the browser).
  const start = v.data.slot ? (Number.isNaN(Date.parse(v.data.slot)) ? null : v.data.slot) : isClock(v.data.time) ? localTimestamp(v.data.date, v.data.time, business.timezone) : null;
  if (!start) return failed('Choose a new start time.', formData);
  const result = await callWorkflow('reschedule_appointment', { p_appointment_id: appointmentId, p_starts_at: start });
  if (!result.ok)
    return refused(result, { capacity_exceeded: 'That time is already fully booked. Nothing was changed.' }, formData);
  return done('Appointment rescheduled.');
}

export async function completeBooking(appointmentId: string): Promise<FormState> {
  await requireBusiness('/app/bookings');
  if (!id.safeParse(appointmentId).success) return failed('Booking not found.');
  const result = await callWorkflow('complete_appointment', { p_appointment_id: appointmentId });
  if (!result.ok)
    return refused(result, { invalid_state: 'This can be marked completed once the job has started (or it has already changed — refresh).' });
  return done('Marked completed.');
}

export async function noShowBooking(appointmentId: string): Promise<FormState> {
  await requireBusiness('/app/bookings');
  if (!id.safeParse(appointmentId).success) return failed('Booking not found.');
  const result = await callWorkflow('mark_no_show', { p_appointment_id: appointmentId });
  if (!result.ok)
    return refused(result, { invalid_state: 'A no-show can be recorded once the start time has passed.' });
  return done('Marked as a no-show. The time is free again.');
}

// --- Calendar holds ---------------------------------------------------------------------------

const holdSchema = z.object({
  date: z.string().refine(isIsoDate, 'Choose a date.'),
  start: z.string().refine(isClock, 'Choose a start time.'),
  end: z.string().refine((v) => isClock(v) || v === '24:00', 'Choose an end time.'),
  hours: z.string().refine((v) => HOLD_HOURS.some((h) => h.value === v), 'Choose how long to hold it.'),
  note: text(200),
});

export async function placeCalendarHold(_: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness('/app/calendar');
  const v = holdSchema.safeParse(Object.fromEntries(formData));
  if (!v.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of v.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return failed('Check the highlighted fields.', formData, fieldErrors);
  }
  if (v.data.end !== '24:00' && v.data.end <= v.data.start) return failed('The hold must end after it starts.', formData, { end: 'Must be after the start.' });
  const nextDay = new Date(`${v.data.date}T12:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const ends = v.data.end === '24:00' ? localTimestamp(nextDay.toISOString().slice(0, 10), '00:00', business.timezone) : localTimestamp(v.data.date, v.data.end, business.timezone);
  const result = await callWorkflow('place_calendar_hold', {
    p_starts_at: localTimestamp(v.data.date, v.data.start, business.timezone),
    p_ends_at: ends,
    p_hours: Number(v.data.hours),
    ...(v.data.note ? { p_note: v.data.note } : {}),
  });
  if (!result.ok)
    return refused(
      result,
      {
        capacity_exceeded: 'That time is already fully booked. Holds never replace confirmed appointments.',
        invalid_input: result.message === 'Some of the details aren’t valid.' ? 'Holds must be in the future and 15 minutes to 72 hours long.' : result.message,
      },
      formData,
    );
  return done('Time held.');
}

export async function releaseCalendarHold(blockId: string): Promise<FormState> {
  await requireBusiness('/app/calendar');
  if (!id.safeParse(blockId).success) return failed('Hold not found.');
  const result = await callWorkflow('release_calendar_hold', { p_block_id: blockId });
  if (!result.ok) return refused(result);
  return done('Hold released.');
}
