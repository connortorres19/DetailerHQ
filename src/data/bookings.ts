import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { displayStatus, FILTERS, sortRank, type DisplayStatus, type Filter } from '@/domain/bookings';

// Owner reads for booking management (Phase 4D), all through RLS: an owner only ever sees their
// own business's requests, appointments, holds and history. Changes go through the authorized
// workflow functions (src/app/app/bookings/actions.ts), never direct writes.

const LIMIT = 300;

const REQUEST_COLUMNS =
  'id, number, status, requested_start, requested_end, estimated_total_cents, estimate_is_minimum, estimated_duration_min, ' +
  'contact_first_name, contact_last_name, contact_phone_e164, contact_email, preferred_contact, vehicle_year, vehicle_make, vehicle_model, vehicle_color, ' +
  'vehicle_size_class_id, vehicle_notes, customer_notes, location_type, service_address_line1, service_city, service_state, service_postal_code, ' +
  'proposed_start, proposed_end, proposal_message, proposal_expires_at, decline_message, decline_reason, duplicate_of_id, customer_id, vehicle_id, created_at, ' +
  'booking_request_items(service_id, name, price_type, price_cents, duration_min, is_addon)';

const APPOINTMENT_COLUMNS =
  'id, number, status, starts_at, ends_at, estimated_total_cents, recorded_total_cents, booking_request_id, location_type, service_address_line1, service_city, ' +
  'service_state, service_postal_code, cancelled_by, cancel_reason, customer_message, created_at, ' +
  'customer:customers(id, first_name, last_name, phone_e164, email), vehicle:vehicles(id, year, make, model, color, size_class_id), ' +
  'appointment_items(service_id, name, estimated_price_cents, duration_min)';

type Item = { serviceId: string | null; name: string; priceType: 'fixed' | 'starting_at' | 'quote_required'; priceCents: number; durationMin: number; isAddon: boolean };

export type BookingRow = {
  id: string; // request id when there is one, else the appointment id
  requestId: string | null;
  appointmentId: string | null;
  number: number;
  status: DisplayStatus;
  start: string;
  end: string;
  durationMin: number;
  name: string;
  phone: string | null;
  email: string | null;
  vehicle: string;
  sizeName: string | null;
  items: Item[];
  totalCents: number;
  isMinimum: boolean;
  notes: string | null;
  proposal: { start: string; end: string; expiresAt: string } | null;
};

type RequestRow = Record<string, unknown> & {
  id: string; number: number; status: 'pending' | 'time_proposed' | 'approved' | 'declined' | 'withdrawn' | 'expired' | 'proposal_declined' | 'closed_duplicate';
  requested_start: string; requested_end: string; estimated_total_cents: number; estimate_is_minimum: boolean; estimated_duration_min: number;
  contact_first_name: string; contact_last_name: string | null; contact_phone_e164: string | null; contact_email: string | null;
  vehicle_year: number | null; vehicle_make: string; vehicle_model: string; vehicle_color: string | null; vehicle_size_class_id: string;
  customer_notes: string | null; proposed_start: string | null; proposed_end: string | null; proposal_expires_at: string | null;
  booking_request_items: { service_id: string | null; name: string; price_type: Item['priceType']; price_cents: number; duration_min: number; is_addon: boolean }[];
};
type AppointmentRow = Record<string, unknown> & {
  id: string; number: number; status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'; starts_at: string; ends_at: string;
  estimated_total_cents: number; booking_request_id: string | null;
  customer: { id: string; first_name: string; last_name: string | null; phone_e164: string | null; email: string | null } | null;
  vehicle: { id: string; year: number | null; make: string; model: string; color: string | null; size_class_id: string | null } | null;
  appointment_items: { service_id: string | null; name: string; estimated_price_cents: number; duration_min: number }[];
};

const vehicleText = (v: { year: number | null; make: string; model: string } | null) =>
  v ? [v.year, v.make, v.model].filter(Boolean).join(' ') : '';

async function sizeNames() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('vehicle_size_classes').select('id, name');
  if (error) throw new Error(`Could not load vehicle sizes: ${error.message}`);
  return new Map((data ?? []).map((s) => [s.id, s.name]));
}

function toRow(r: RequestRow | null, a: AppointmentRow | null, sizes: Map<string, string>, now: Date): BookingRow {
  const requestItems = (r?.booking_request_items ?? []).map((i) => ({
    serviceId: i.service_id, name: i.name, priceType: i.price_type, priceCents: i.price_cents, durationMin: i.duration_min, isAddon: i.is_addon,
  }));
  const items: Item[] = r
    ? requestItems.sort((x, y) => Number(x.isAddon) - Number(y.isAddon))
    : (a?.appointment_items ?? []).map((i) => ({ serviceId: i.service_id, name: i.name, priceType: 'fixed', priceCents: i.estimated_price_cents, durationMin: i.duration_min, isAddon: false }));
  const start = a?.starts_at ?? r!.requested_start;
  const end = a?.ends_at ?? r!.requested_end;
  const status = displayStatus(r ? { status: r.status, requested_start: r.requested_start, proposal_expires_at: r.proposal_expires_at } : null, a, now);
  return {
    id: r?.id ?? a!.id,
    requestId: r?.id ?? null,
    appointmentId: a?.id ?? null,
    number: r?.number ?? a!.number,
    status,
    start,
    end,
    durationMin: Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000),
    name: a?.customer ? [a.customer.first_name, a.customer.last_name].filter(Boolean).join(' ') : [r!.contact_first_name, r!.contact_last_name].filter(Boolean).join(' '),
    phone: a?.customer?.phone_e164 ?? r?.contact_phone_e164 ?? null,
    email: a?.customer?.email ?? r?.contact_email ?? null,
    vehicle: a?.vehicle ? vehicleText(a.vehicle) : r ? vehicleText({ year: r.vehicle_year, make: r.vehicle_make, model: r.vehicle_model }) : '',
    sizeName: sizes.get((a?.vehicle?.size_class_id ?? r?.vehicle_size_class_id) as string) ?? null,
    items,
    totalCents: a?.estimated_total_cents ?? r!.estimated_total_cents,
    isMinimum: r?.estimate_is_minimum ?? false,
    notes: r?.customer_notes ?? null,
    proposal:
      status === 'proposed' && r?.proposed_start && r.proposed_end && r.proposal_expires_at
        ? { start: r.proposed_start, end: r.proposed_end, expiresAt: r.proposal_expires_at }
        : null,
  };
}

// The inbox: requests and appointments merged into one list per booking, filtered and sorted.
export async function listBookings(filter: Filter) {
  const supabase = await createClient();
  const now = new Date();
  const [requests, appointments, sizes] = await Promise.all([
    supabase.from('booking_requests').select(REQUEST_COLUMNS).order('requested_start', { ascending: false }).limit(LIMIT),
    supabase.from('appointments').select(APPOINTMENT_COLUMNS).order('starts_at', { ascending: false }).limit(LIMIT),
    sizeNames(),
  ]);
  if (requests.error) throw new Error(`Could not load requests: ${requests.error.message}`);
  if (appointments.error) throw new Error(`Could not load appointments: ${appointments.error.message}`);

  const reqs = (requests.data ?? []) as unknown as RequestRow[];
  const appts = (appointments.data ?? []) as unknown as AppointmentRow[];
  const byRequest = new Map(appts.filter((a) => a.booking_request_id).map((a) => [a.booking_request_id!, a]));
  const rows = [
    ...reqs.map((r) => toRow(r, byRequest.get(r.id) ?? null, sizes, now)),
    ...appts.filter((a) => !a.booking_request_id || !reqs.some((r) => r.id === a.booking_request_id)).map((a) => toRow(null, a, sizes, now)),
  ];

  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.value, f.statuses ? rows.filter((r) => (f.statuses as readonly DisplayStatus[]).includes(r.status)).length : rows.length]),
  ) as Record<Filter, number>;
  const statuses = FILTERS.find((f) => f.value === filter)!.statuses as readonly DisplayStatus[] | null;
  const list = rows
    .filter((r) => !statuses || statuses.includes(r.status))
    .sort((x, y) => {
      const [a1, a2] = sortRank(x.status, new Date(x.start), now);
      const [b1, b2] = sortRank(y.status, new Date(y.start), now);
      return a1 - b1 || a2 - b2;
    });
  return { rows: list, counts, truncated: reqs.length >= LIMIT || appts.length >= LIMIT };
}

// One booking with everything the detail view needs. Null if it doesn't exist or belongs to
// another business (RLS makes both look the same).
export async function getBooking(id: string) {
  const supabase = await createClient();
  const now = new Date();
  const { data: reqData, error: reqError } = await supabase.from('booking_requests').select(REQUEST_COLUMNS).eq('id', id).maybeSingle();
  if (reqError) throw new Error(`Could not load the booking: ${reqError.message}`);
  let request = reqData as unknown as (RequestRow & Record<string, unknown>) | null;

  let appointment: (AppointmentRow & Record<string, unknown>) | null = null;
  const apptQuery = request
    ? supabase.from('appointments').select(APPOINTMENT_COLUMNS).eq('booking_request_id', request.id).maybeSingle()
    : supabase.from('appointments').select(APPOINTMENT_COLUMNS).eq('id', id).maybeSingle();
  const { data: apptData, error: apptError } = await apptQuery;
  if (apptError) throw new Error(`Could not load the appointment: ${apptError.message}`);
  appointment = apptData as unknown as AppointmentRow | null;
  if (!request && appointment?.booking_request_id) {
    const { data } = await supabase.from('booking_requests').select(REQUEST_COLUMNS).eq('id', appointment.booking_request_id).maybeSingle();
    request = data as unknown as RequestRow | null;
  }
  if (!request && !appointment) return null;

  const filters = [request ? `booking_request_id.eq.${request.id}` : null, appointment ? `appointment_id.eq.${appointment.id}` : null].filter(Boolean).join(',');
  const [sizes, history, hold, duplicateOf] = await Promise.all([
    sizeNames(),
    supabase.from('activity_events').select('id, kind, from_status, to_status, actor_type, metadata, created_at').or(filters).order('created_at'),
    request
      ? supabase.from('schedule_blocks').select('id, expires_at').eq('booking_request_id', request.id).eq('kind', 'hold').gt('expires_at', now.toISOString()).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    request?.duplicate_of_id
      ? supabase.from('booking_requests').select('id, number, status').eq('id', request.duplicate_of_id as string).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (history.error) throw new Error(`Could not load the history: ${history.error.message}`);

  const row = toRow(request, appointment, sizes, now);
  const phone = row.phone;
  const email = row.email;
  // Possible existing customers with the same phone or email (never merged automatically).
  let matches: { id: string; first_name: string; last_name: string | null; phone_e164: string | null; email: string | null; vehicles: { id: string; year: number | null; make: string; model: string; archived_at: string | null }[] }[] = [];
  if (phone || email) {
    const or = [phone ? `phone_e164.eq.${phone}` : null, email ? `email.eq."${email.replaceAll('"', '')}"` : null].filter(Boolean).join(',');
    const { data, error } = await supabase
      .from('customers')
      .select('id, first_name, last_name, phone_e164, email, vehicles(id, year, make, model, archived_at)')
      .is('archived_at', null)
      .or(or)
      .limit(5);
    if (error) throw new Error(`Could not check for existing customers: ${error.message}`);
    const linked = appointment?.customer?.id ?? (request?.customer_id as string | null);
    matches = (data ?? []).filter((c) => c.id !== linked);
  }

  return {
    row,
    request,
    appointment,
    history: history.data ?? [],
    holdExpiresAt: (hold.data as { expires_at: string } | null)?.expires_at ?? null,
    duplicateOf: duplicateOf.data as { id: string; number: number; status: string } | null,
    matches,
  };
}

export type CalendarEntry = {
  id: string;
  kind: 'appointment' | 'pending' | 'proposal' | 'hold' | 'request_hold';
  start: string;
  end: string;
  title: string;
  detail: string;
  status: DisplayStatus | null;
  href: string | null;
  holdId: string | null;
  expiresAt: string | null;
};

// Calendar data for [from, to): appointments, active holds and proposals, and pending requests.
export async function getCalendar(from: Date, to: Date) {
  const supabase = await createClient();
  const now = new Date();
  const [appointments, requests, blocks, sizes] = await Promise.all([
    supabase.from('appointments').select(APPOINTMENT_COLUMNS).lt('starts_at', to.toISOString()).gt('ends_at', from.toISOString()).neq('status', 'cancelled').order('starts_at'),
    supabase
      .from('booking_requests')
      .select(REQUEST_COLUMNS)
      .in('status', ['pending', 'time_proposed'])
      .lt('requested_start', to.toISOString())
      .gt('requested_end', from.toISOString()),
    supabase
      .from('schedule_blocks')
      .select('id, kind, during, expires_at, note, booking_request_id')
      .in('kind', ['hold', 'proposal'])
      .gt('expires_at', now.toISOString()),
    sizeNames(),
  ]);
  for (const r of [appointments, requests, blocks]) if (r.error) throw new Error(`Could not load the calendar: ${r.error.message}`);

  const entries: CalendarEntry[] = [];
  for (const a of (appointments.data ?? []) as unknown as AppointmentRow[]) {
    const row = toRow(null, a, sizes, now);
    entries.push({
      id: a.id, kind: 'appointment', start: a.starts_at, end: a.ends_at, title: row.name,
      detail: [row.items.map((i) => i.name).join(', '), row.vehicle].filter(Boolean).join(' · '),
      status: row.status, href: `/app/bookings/${a.booking_request_id ?? a.id}`, holdId: null, expiresAt: null,
    });
  }
  const reqs = (requests.data ?? []) as unknown as RequestRow[];
  for (const r of reqs) {
    const row = toRow(r, null, sizes, now);
    if (row.status !== 'pending') continue;
    entries.push({
      id: r.id, kind: 'pending', start: r.requested_start, end: r.requested_end, title: row.name,
      detail: [row.items.filter((i) => !i.isAddon).map((i) => i.name).join(', '), row.vehicle].filter(Boolean).join(' · '),
      status: 'pending', href: `/app/bookings/${r.id}`, holdId: null, expiresAt: null,
    });
  }
  for (const b of blocks.data ?? []) {
    const [lower, upper] = String(b.during).replace(/^[[(]|[\])]$/g, '').split(',').map((s) => new Date(s.replace(/"/g, '').trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')));
    if (!lower || !upper || upper <= from || lower >= to) continue;
    const req = b.booking_request_id ? reqs.find((r) => r.id === b.booking_request_id) : null;
    const name = req ? [req.contact_first_name, req.contact_last_name].filter(Boolean).join(' ') : null;
    entries.push({
      id: b.id,
      kind: b.kind === 'proposal' ? 'proposal' : b.booking_request_id ? 'request_hold' : 'hold',
      start: lower.toISOString(),
      end: upper.toISOString(),
      title: b.kind === 'proposal' ? `Proposed to ${name ?? 'customer'}` : b.booking_request_id ? `Held for ${name ?? 'a request'}` : 'Hold',
      detail: b.note ?? '',
      status: null,
      href: b.booking_request_id ? `/app/bookings/${b.booking_request_id}` : null,
      holdId: b.booking_request_id ? null : b.id,
      expiresAt: b.expires_at,
    });
  }
  return entries.sort((x, y) => x.start.localeCompare(y.start));
}

// Active calendar holds (not tied to a request), soonest first.
export async function listCalendarHolds() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('schedule_blocks')
    .select('id, during, expires_at, note')
    .eq('kind', 'hold')
    .is('booking_request_id', null)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at');
  if (error) throw new Error(`Could not load holds: ${error.message}`);
  return data ?? [];
}
