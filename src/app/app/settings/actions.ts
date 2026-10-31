'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { requireBusiness } from '@/data/session';
import { callWorkflow } from '@/data/workflow';
import { authMessage, changeEmailSchema, changePasswordSchema } from '@/domain/auth';
import { businessProfileSchema, capacitySchema } from '@/domain/business';
import { failed, invalid, type FormState } from '@/domain/forms';

export async function updateBusinessProfile(_: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness('/app/settings');
  const parsed = businessProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('businesses')
    .update({
      name: v.name,
      phone_e164: v.phone,
      email: v.email,
      service_area_text: v.serviceAreaText,
      shop_address_line1: v.shopAddressLine1,
      shop_city: v.shopCity,
      shop_state: v.shopState,
      shop_postal_code: v.shopPostalCode,
    })
    .eq('id', business.id)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[settings] profile', error);
    return failed(error?.code === '23514' ? 'Some of the details aren’t valid.' : 'That didn’t save. Please try again.', formData);
  }
  revalidatePath('/app', 'layout');
  return { status: 'success', message: 'Business details saved.' };
}

// Through public.set_capacity (D-26): mobile-only businesses stay at 1; shops 1–20.
export async function updateCapacity(_: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/settings');
  const parsed = capacitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  const result = await callWorkflow('set_capacity', { p_capacity: parsed.data.capacity });
  if (!result.ok) {
    const message =
      result.kind === 'invalid_input'
        ? 'Mobile-only businesses take one job at a time.'
        : result.kind === 'capacity_exceeded'
          ? 'More jobs than that are already booked at the same time. Move some before lowering this.'
          : result.message;
    return failed(message, formData, { capacity: message });
  }
  revalidatePath('/app', 'layout');
  return { status: 'success', message: 'Capacity saved.' };
}

// Supabase emails both the current and the new address (double_confirm_changes = true);
// the change applies once both links are opened.
export async function changeEmail(_: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireBusiness('/app/settings/account');
  const parsed = changeEmailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  if (parsed.data.email === user.email.toLowerCase()) return failed('That’s already your email.', formData, { email: 'That’s already your email.' });

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.email },
    { emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL}/app/settings/account` },
  );
  if (error) return failed(authMessage(error.code), formData);
  return { status: 'success', message: `We sent confirmation links to ${user.email} and ${parsed.data.email}. Your email changes once both are opened.` };
}

// Re-authentication before a password change (PRODUCT_PLAN §9.6): the current password is
// checked first, so an unattended signed-in browser can't be used to take over the account.
export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireBusiness('/app/settings/account');
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  const supabase = await createClient();
  const check = await supabase.auth.signInWithPassword({ email: user.email, password: parsed.data.currentPassword });
  if (check.error) {
    const message = check.error.code === 'invalid_credentials' ? 'That isn’t your current password.' : authMessage(check.error.code);
    return failed(message, formData, { currentPassword: message });
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return failed(authMessage(error.code), formData, error.code === 'same_password' ? { password: authMessage(error.code) } : undefined);
  return { status: 'success', message: 'Password changed.' };
}

// Booking mode (D-28). The database refuses instant booking until the business has a bookable,
// set-price service and working hours (trigger in migration 10); its reasons become messages.
export async function updateBookingMode(_: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness('/app/settings');
  const mode = formData.get('bookingMode');
  if (mode !== 'approval' && mode !== 'instant') return failed('Choose how customers book.', formData);

  const supabase = await createClient();
  const { data, error } = await supabase.from('booking_settings').update({ booking_mode: mode }).eq('business_id', business.id).select('booking_mode').maybeSingle();
  if (error || !data) {
    const message =
      error?.details === 'instant_needs_services'
        ? 'Instant booking needs at least one service customers can book online, with a set price. Add one in Services first.'
        : error?.details === 'instant_needs_hours'
          ? 'Instant booking needs your working hours. Set them in Availability first.'
          : 'That didn’t save. Please try again.';
    if (error && !error.details?.startsWith('instant_')) console.error('[settings] booking mode', error);
    return failed(message, formData);
  }
  revalidatePath('/app', 'layout');
  return { status: 'success', message: mode === 'instant' ? 'Instant booking is on.' : 'Approval required is on.' };
}
