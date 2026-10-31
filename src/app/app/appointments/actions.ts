'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { appointmentSchema, TIME_UNAVAILABLE, toCreateArgs } from '@/domain/appointments';
import { slotsSchema } from '@/domain/booking';
import { isIsoDate } from '@/domain/bookings';
import { failed, formValues, type FormState } from '@/domain/forms';
import { searchCustomerChoices, type CustomerChoice } from '@/data/appointments';
import { requireBusiness } from '@/data/session';
import { callWorkflow } from '@/data/workflow';
import { createClient } from '@/lib/supabase/server';

// Owner-created appointments (Phase 4E). One call to public.create_owner_appointment does
// everything in one transaction under the capacity lock: new customer/vehicle if asked, hold
// conversion, saved pricing, the full availability check, the insert. The browser sends ids, a
// size, a start time and contact details — never a price, duration or business id.

export async function createAppointment(_: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/appointments/new');
  const raw = { ...Object.fromEntries(formData), addonIds: formData.getAll('addonIds').map(String) };
  const parsed = appointmentSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ...failed('Check the highlighted fields.', formData, fieldErrors), values: { ...formValues(formData), addonIds: raw.addonIds.join(',') } };
  }

  const result = await callWorkflow('create_owner_appointment', toCreateArgs(parsed.data) as never);
  if (!result.ok) {
    const message =
      result.message === 'Some of the details aren’t valid.' && result.detail && TIME_UNAVAILABLE[result.detail]
        ? TIME_UNAVAILABLE[result.detail]!
        : result.kind === 'capacity_exceeded'
          ? 'That time was just taken. Choose another.'
          : result.kind === 'invalid_state'
            ? 'This hold has expired. Choose a time instead.'
            : result.kind === 'not_found'
              ? 'That customer, vehicle or hold wasn’t found. Choose again.'
              : result.kind === 'invalid_input'
                ? 'Some details weren’t accepted. Check the phone number, email and vehicle, and that the service has a set price.'
                : result.message;
    return { ...failed(message, formData), values: { ...formValues(formData), addonIds: raw.addonIds.join(',') } };
  }
  revalidatePath('/app', 'layout');
  redirect(`/app/bookings/${result.data}?created=1`);
}

export async function findCustomers(q: string): Promise<CustomerChoice[]> {
  await requireBusiness('/app/appointments/new');
  return searchCustomerChoices(String(q ?? '').slice(0, 80));
}

const slotQuery = z.object({ serviceIds: z.array(z.uuid()).min(1).max(10), sizeId: z.uuid(), date: z.string().refine(isIsoDate) });

// Open start times for one local date (the same engine as the booking page, all active services).
export async function ownerSlots(input: z.input<typeof slotQuery>): Promise<{ ok: true; slots: string[] } | { ok: false; message: string }> {
  await requireBusiness('/app/appointments/new');
  const q = slotQuery.safeParse(input);
  if (!q.success) return { ok: false, message: 'Choose a service, size and date.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('owner_available_slots', { p_service_ids: q.data.serviceIds, p_size_class_id: q.data.sizeId, p_from: q.data.date, p_days: 1 });
  if (error) return { ok: false, message: 'Open times couldn’t be listed for this choice.' };
  return { ok: true, slots: slotsSchema.parse(data).days.find((d) => d.date === q.data.date)?.slots ?? [] };
}
