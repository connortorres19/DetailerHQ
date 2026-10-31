'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireBusiness } from '@/data/session';
import { callWorkflow } from '@/data/workflow';
import { bookingRulesSchema, parseWeek, timeOffSchema } from '@/domain/availability';
import { idSchema } from '@/domain/customer';
import { failed, invalid, type FormState } from '@/domain/forms';

// The whole week is saved by one database call (public.save_weekly_hours): either every
// window is saved or none is. Overlaps are rejected here first and again by the database.
export async function saveHours(_: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/availability');
  const week = parseWeek(String(formData.get('windows') ?? '[]'));
  if (!week.ok) return { status: 'error', message: 'Check your working hours.', fieldErrors: week.errors };

  const result = await callWorkflow('save_weekly_hours', { p_windows: week.windows });
  if (!result.ok) {
    const message =
      result.detail === 'overlapping_hours'
        ? 'Two windows on the same day overlap. Adjust them and save again.'
        : result.code === '23514' || result.detail === 'invalid_hours'
          ? 'Each window must end after it starts.'
          : result.message;
    return failed(message);
  }
  revalidatePath('/app', 'layout');
  return { status: 'success', message: 'Working hours saved.' };
}

export async function saveBookingRules(_: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness('/app/availability');
  const parsed = bookingRulesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('booking_settings')
    .update({
      min_notice_min: v.minNoticeMin,
      horizon_days: v.horizonDays,
      buffer_min: v.bufferMin,
      slot_interval_min: v.slotIntervalMin,
      max_jobs_per_day: v.maxJobsPerDay,
      cancel_cutoff_hours: v.cancelCutoffHours,
    })
    .eq('business_id', business.id)
    .select('business_id')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[availability] rules', error);
    return failed(error?.code === '23514' ? 'One of the values is out of range.' : 'That didn’t save. Please try again.', formData);
  }
  revalidatePath('/app', 'layout');
  return { status: 'success', message: 'Booking rules saved.' };
}

// Local dates/times are converted to exact instants by the database in the business's time
// zone (public.add_time_off), so DST days come out the right length.
export async function addTimeOff(_: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/availability');
  const parsed = timeOffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const v = parsed.data;

  const result = await callWorkflow('add_time_off', {
    p_start_date: v.startDate,
    p_end_date: v.endDate,
    p_start_time: v.startTime ?? undefined,
    p_end_time: v.endTime ?? undefined,
    p_label: v.label ?? undefined,
  });
  if (!result.ok) {
    const message =
      result.detail === 'time_off_ends_before_start'
        ? 'The blocked time must end after it starts.'
        : result.detail === 'invalid_time_off'
          ? 'Check the dates and times.'
          : result.message;
    return failed(message, formData);
  }
  revalidatePath('/app', 'layout');
  // A fresh nonce remounts the form so it clears after each block is added.
  return { status: 'success', message: 'Time blocked.', values: { nonce: crypto.randomUUID() } };
}

export async function deleteTimeOff(timeOffId: string) {
  const parsed = idSchema.safeParse(timeOffId);
  if (!parsed.success) redirect('/app/availability');
  await requireBusiness('/app/availability');
  const supabase = await createClient();
  const { data, error } = await supabase.from('time_off').delete().eq('id', parsed.data).select('id').maybeSingle();
  if (error) console.error('[availability] delete time off', error);
  revalidatePath('/app', 'layout');
  redirect(`/app/availability?saved=${error || !data ? 'missing' : 'unblocked'}#blocked`);
}
