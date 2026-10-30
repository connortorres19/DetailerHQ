'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/data/session';
import { callWorkflow } from '@/data/workflow';
import { onboardingSchema } from '@/domain/business';
import { failed, invalid, type FormState } from '@/domain/forms';

// One call to public.create_business (Phase 1): business, owner membership, booking settings,
// schedule capacity and default vehicle sizes, then activation if the email is confirmed.
export async function createBusiness(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser('/onboarding');
  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const v = parsed.data;

  const result = await callWorkflow('create_business', {
    p_name: v.name,
    p_slug: v.slug,
    p_timezone: v.timezone,
    p_service_mode: v.serviceMode,
    p_capacity: v.serviceMode === 'mobile' ? undefined : v.capacity,
    p_phone_e164: v.phone ?? undefined,
    p_email: v.email ?? undefined,
  });

  if (!result.ok) {
    if (result.code === '23505') {
      return failed('That booking link is taken.', formData, { slug: 'That link is already in use. Try another.' });
    }
    if (result.code === '23514') {
      return failed('Check the highlighted fields.', formData, { slug: 'That link can’t be used. Try another.' });
    }
    if (result.kind === 'invalid_state') redirect('/app'); // this account already has a business
    return failed(result.message, formData);
  }
  redirect('/app');
}
