import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Business } from '@/data/session';
import { dayRange, weekRange } from '@/domain/time';

const ACTIVE = ['scheduled', 'in_progress', 'completed'] as const;

// Everything on the Today screen, read through RLS as the owner. Requests and appointments
// stay empty until booking arrives in Phase 4; the queries are real either way.
export async function getToday(business: Business) {
  const supabase = await createClient();
  const today = dayRange(business.timezone);
  const week = weekRange(business.timezone);

  const [pending, schedule, weekJobs, customers, services, hours] = await Promise.all([
    supabase.from('booking_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase
      .from('appointments')
      .select('id, booking_request_id, starts_at, ends_at, status, location_type, service_address_line1, customer:customers(first_name, last_name), vehicle:vehicles(year, make, model)')
      .gte('starts_at', today.start.toISOString())
      .lt('starts_at', today.end.toISOString())
      .in('status', ACTIVE)
      .order('starts_at'),
    supabase
      .from('appointments')
      .select('estimated_total_cents')
      .gte('starts_at', week.start.toISOString())
      .lt('starts_at', week.end.toISOString())
      .in('status', ACTIVE),
    supabase.from('customers').select('id', { count: 'exact', head: true }).is('archived_at', null),
    supabase.from('services').select('id', { count: 'exact', head: true }).is('archived_at', null),
    supabase.from('availability_rules').select('id', { count: 'exact', head: true }),
  ]);

  for (const result of [pending, schedule, weekJobs, customers, services, hours]) {
    if (result.error) throw new Error(`Could not load Today: ${result.error.message}`);
  }

  return {
    pendingRequests: pending.count ?? 0,
    schedule: schedule.data ?? [],
    week: {
      jobs: weekJobs.data?.length ?? 0,
      bookedCents: (weekJobs.data ?? []).reduce((sum, a) => sum + a.estimated_total_cents, 0),
    },
    activeCustomers: customers.count ?? 0,
    activeServices: services.count ?? 0,
    hourWindows: hours.count ?? 0,
  };
}
