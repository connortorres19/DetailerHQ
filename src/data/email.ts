import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export type EmailHealth = { status: 'none' | 'pending' | 'verified' | 'needs_attention'; failed: number; held: number };

// For the dashboard reminder: is email connected, and is anything failing? (RLS: own business.)
export const getEmailHealth = cache(async (): Promise<EmailHealth> => {
  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [conn, failed, held] = await Promise.all([
    supabase.from('email_connections').select('status').maybeSingle(),
    supabase.from('email_outbox').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since),
    supabase.from('email_outbox').select('id', { count: 'exact', head: true }).eq('status', 'held'),
  ]);
  return { status: conn.data?.status ?? 'none', failed: failed.count ?? 0, held: held.count ?? 0 };
});
