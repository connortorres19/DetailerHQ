import 'server-only';
import { cache } from 'react';
import type { Business } from '@/data/session';
import type { BillingSummary } from '@/domain/billing';
import { createClient } from '@/lib/supabase/server';

// The signed-in owner's billing state for banners (RLS: their own business only).
export const getBillingSummary = cache(async (business: Business): Promise<BillingSummary> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('business_billing')
    .select('plan, subscription_status, trial_ends_at, current_period_end, cancel_at_period_end, past_due_since, founding_slot, founding_access_revoked_at')
    .maybeSingle();
  return {
    account_status: business.account_status,
    plan: data?.plan ?? null,
    subscription_status: data?.subscription_status ?? null,
    trial_ends_at: data?.trial_ends_at ?? null,
    current_period_end: data?.current_period_end ?? null,
    cancel_at_period_end: data?.cancel_at_period_end ?? false,
    past_due_since: data?.past_due_since ?? null,
    founding_slot: data?.founding_slot ?? null,
    founding_access_revoked_at: data?.founding_access_revoked_at ?? null,
  };
});
