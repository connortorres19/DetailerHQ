'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { bookingErrorMessage, contactSchema, selectionSchema, slotsSchema, toRequestPayload, type Slots } from '@/domain/booking';
import type { FormState } from '@/domain/forms';
import { invalid } from '@/domain/forms';
import { callPublic, clientIpHash, statusTokenFor } from '@/lib/booking/server';

// Public server actions. They accept ids and a start time only — never prices, durations or a
// business id. The database derives the business from the slug and prices, times and checks
// everything again (public_api, migration 11).

const slotQuery = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  serviceIds: z.array(z.uuid()).min(1).max(10),
  sizeId: z.uuid(),
  from: z.iso.date(),
});

export type SlotsResult = { ok: true; slots: Slots } | { ok: false; message: string };

export async function loadSlots(input: z.input<typeof slotQuery>): Promise<SlotsResult> {
  const q = slotQuery.safeParse(input);
  if (!q.success) return { ok: false, message: 'Choose a service and vehicle size first.' };
  const result = await callPublic<unknown>('get_available_slots', [q.data.slug, q.data.serviceIds, q.data.sizeId, q.data.from, 14, await clientIpHash()]);
  if (!result.ok) return { ok: false, message: bookingErrorMessage(result.error) };
  return { ok: true, slots: slotsSchema.parse(result.data) };
}

export async function submitBooking(slug: string, _: FormState, formData: FormData): Promise<FormState> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return { status: 'error', message: 'This booking page isn’t available.' };
  let selection: unknown;
  try {
    selection = JSON.parse(String(formData.get('selection') ?? ''));
  } catch {
    selection = null;
  }
  const s = selectionSchema.safeParse(selection);
  if (!s.success) return { status: 'error', message: 'Your choices couldn’t be read. Please go back and choose again.' };
  const c = contactSchema.safeParse(Object.fromEntries(formData));
  if (!c.success) return invalid(c.error, formData, 'Check the highlighted details.');

  const { token, hash } = statusTokenFor(s.data.idempotencyKey);
  const result = await callPublic<{ request_number: number; status: string; replayed: boolean }>('submit_booking_request', [
    slug,
    JSON.stringify(toRequestPayload(s.data, c.data)),
    s.data.idempotencyKey,
    hash,
    await clientIpHash(),
  ]);
  if (!result.ok) {
    const timeTaken = result.error.message === 'time_unavailable';
    return { status: 'error', message: bookingErrorMessage(result.error), values: { reason: timeTaken ? 'time' : 'other' } };
  }
  // A replay (double click, retried connection) returns the original request; the link is the same.
  redirect(`/r/${token}?new=1`);
}
