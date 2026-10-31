'use server';

import { revalidatePath } from 'next/cache';
import { onlineCancellationSchema } from '@/domain/booking';
import { failed, type FormState } from '@/domain/forms';
import { callWorkflow } from '@/data/workflow';
import { requireBusiness } from '@/data/session';
import { createClient } from '@/lib/supabase/server';

const LIVE_MESSAGES: Record<string, string> = {
  publish_needs_activation: 'Confirm your email address first — check your inbox for the link.',
  publish_needs_hours: 'Add your working hours in Availability first.',
  publish_needs_services: 'Add at least one service customers can book online (Services) first.',
};

// Live / offline goes through public.set_booking_page_live (prerequisites checked in the database).
export async function setLive(live: boolean): Promise<FormState> {
  await requireBusiness('/app/booking-page');
  const result = await callWorkflow('set_booking_page_live', { p_live: live });
  revalidatePath('/app', 'layout');
  if (!result.ok) return failed((result.detail && LIVE_MESSAGES[result.detail]) || result.message);
  return { status: 'success', message: live ? 'Your booking page is live.' : 'Your booking page is offline.' };
}

export async function saveOnlineCancellation(_: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness('/app/booking-page');
  const v = onlineCancellationSchema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('booking_settings')
    .update({ customer_can_cancel: v.onlineCancellation })
    .eq('business_id', business.id)
    .select('business_id')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[booking-page] save online cancellation', error);
    return failed('That didn’t save. Please try again.', formData);
  }
  revalidatePath('/app', 'layout');
  return { status: 'success', message: v.onlineCancellation ? 'Customers can cancel online.' : 'Customers contact you to cancel.' };
}
