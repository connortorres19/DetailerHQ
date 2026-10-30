import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export type Business = Database['public']['Tables']['businesses']['Row'];
export type SessionUser = { id: string; email: string };

// The signed-in user, from verified JWT claims (never getSession() on the server — §9.6).
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : '' };
});

export async function requireUser(next = '/app'): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return user;
}

// The owner's business, read through RLS (memberships → businesses). One business per owner.
export const getBusiness = cache(async (): Promise<Business | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('memberships')
    .select('business:businesses(*)')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load business: ${error.message}`);
  return (data?.business as Business | null) ?? null;
});

// Pages inside /app: signed in AND has a business, else onboarding.
export async function requireBusiness(next = '/app'): Promise<{ user: SessionUser; business: Business }> {
  const user = await requireUser(next);
  const business = await getBusiness();
  if (!business) redirect('/onboarding');
  return { user, business };
}
