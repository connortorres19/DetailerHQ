'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { requireUser } from '@/data/session';
import { authMessage, emailSchema, newPasswordSchema, safeNext, signInSchema, signUpSchema } from '@/domain/auth';
import { failed, invalid, type FormState } from '@/domain/forms';

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return failed(authMessage(error.code), formData);
  redirect(safeNext(formData.get('next')));
}

// Open registration is built but off: it needs AUTH_SIGNUP_MODE=open here AND sign-ups
// enabled in Supabase, which also enforces invite-only on its side.
export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  if (env.AUTH_SIGNUP_MODE !== 'open') return failed(authMessage('signup_disabled'), formData);
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL}/onboarding` },
  });
  if (error) return failed(authMessage(error.code), formData);
  redirect(`/auth/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}

// Always answers the same way, so the form can't be used to find out who has an account.
export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) return failed('Enter a valid email address.', formData, { email: 'Enter a valid email address.' });

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
  });
  if (error?.code === 'over_email_send_rate_limit' || error?.code === 'over_request_rate_limit') {
    return failed(authMessage(error.code), formData);
  }
  return { status: 'success', message: 'If an account exists for that email, we’ve sent a link to reset the password.' };
}

// Used after accepting an invite (first password) and after a reset link (new password).
export async function setPassword(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return failed(authMessage(error.code));
  redirect(safeNext(formData.get('next'), '/app'));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/sign-in?signed-out=1');
}
