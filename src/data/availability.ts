import 'server-only';
import { createClient } from '@/lib/supabase/server';

// Owner reads for Phase 4B, all through RLS (the owner's own business only).
export async function getAvailability() {
  const supabase = await createClient();
  const [rules, timeOff, settings, resource] = await Promise.all([
    supabase.from('availability_rules').select('id, weekday, start_time, end_time').order('weekday').order('start_time'),
    supabase.from('time_off').select('id, during, all_day, label').order('during'),
    supabase
      .from('booking_settings')
      .select('booking_mode, min_notice_min, horizon_days, buffer_min, slot_interval_min, max_jobs_per_day, cancel_cutoff_hours')
      .single(),
    supabase.from('schedule_resources').select('capacity').eq('kind', 'general').eq('active', true).maybeSingle(),
  ]);
  for (const r of [rules, timeOff, settings, resource]) {
    if (r.error) throw new Error(`Could not load availability: ${r.error.message}`);
  }
  return {
    rules: rules.data ?? [],
    // Current and upcoming blocks only; past ones stay in the table but aren't listed.
    timeOff: (timeOff.data ?? [])
      .map((t) => ({ id: t.id, all_day: t.all_day, label: t.label, ...parseRange(t.during as unknown as string) }))
      .filter((t) => t.end.getTime() > Date.now()),
    settings: settings.data!,
    capacity: resource.data?.capacity ?? 1,
  };
}

// tstzrange text, e.g. ["2026-11-10 18:00:00+00","2026-11-10 19:30:00+00")
export function parseRange(range: string) {
  const [lower = '', upper = ''] = range.replace(/^[[(]|[\])]$/g, '').split(',').map((s) => s.replace(/"/g, '').trim());
  const toDate = (s: string) => new Date(s.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
  return { start: toDate(lower), end: toDate(upper) };
}

export async function getBookingMode() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('booking_settings').select('booking_mode').single();
  if (error) throw new Error(`Could not load booking mode: ${error.message}`);
  return data.booking_mode;
}
