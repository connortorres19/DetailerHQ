import 'server-only';
import type { PublicService } from '@/domain/booking';
import { searchTerms } from '@/domain/customer';
import { createClient } from '@/lib/supabase/server';
import { parseRange } from '@/data/availability';

// Reads for owner-created appointments (Phase 4E), all through RLS as the owner.

// Services the owner can book directly: active, with a saved price (quote-only excluded), whether
// or not they're offered online. Same shape as the booking page uses, so the estimate is identical.
export async function getOwnerMenu() {
  const supabase = await createClient();
  const [services, sizes] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, description, category_id, price_type, base_price_cents, base_duration_min, is_addon, sort_order, service_prices(size_class_id, price_cents, duration_min)')
      .is('archived_at', null)
      .neq('price_type', 'quote_required')
      .order('sort_order')
      .order('name'),
    supabase.from('vehicle_size_classes').select('id, name, examples').is('archived_at', null).order('sort_order'),
  ]);
  if (services.error) throw new Error(`Could not load services: ${services.error.message}`);
  if (sizes.error) throw new Error(`Could not load vehicle sizes: ${sizes.error.message}`);
  const menu: PublicService[] = (services.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category_id: s.category_id,
    price_type: s.price_type,
    price_cents: s.base_price_cents,
    duration_min: s.base_duration_min,
    is_addon: s.is_addon,
    by_size: s.service_prices ?? [],
  }));
  return { services: menu, sizes: sizes.data ?? [] };
}

export type CustomerChoice = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: { line1: string | null; city: string | null; state: string | null; postalCode: string | null };
  vehicles: { id: string; label: string; sizeId: string | null }[];
};

const CUSTOMER_COLUMNS =
  'id, first_name, last_name, phone_e164, email, address_line1, city, state, postal_code, vehicles(id, year, make, model, color, size_class_id, archived_at)';

type CustomerRow = {
  id: string; first_name: string; last_name: string | null; phone_e164: string | null; email: string | null;
  address_line1: string | null; city: string | null; state: string | null; postal_code: string | null;
  vehicles: { id: string; year: number | null; make: string; model: string; color: string | null; size_class_id: string | null; archived_at: string | null }[];
};

const toChoice = (c: CustomerRow): CustomerChoice => ({
  id: c.id,
  name: [c.first_name, c.last_name].filter(Boolean).join(' '),
  phone: c.phone_e164,
  email: c.email,
  address: { line1: c.address_line1, city: c.city, state: c.state, postalCode: c.postal_code },
  vehicles: c.vehicles
    .filter((v) => !v.archived_at)
    .map((v) => ({ id: v.id, label: [v.year, v.make, v.model, v.color ? `(${v.color})` : null].filter(Boolean).join(' '), sizeId: v.size_class_id })),
});

// Name, phone or email search over active customers (same matching as the customer list).
export async function searchCustomerChoices(q: string): Promise<CustomerChoice[]> {
  const { text, digits } = searchTerms(q);
  if (!text && digits.length < 3) return [];
  const supabase = await createClient();
  const filters = text ? [`first_name.ilike.%${text}%`, `last_name.ilike.%${text}%`, `email.ilike.%${text}%`] : [];
  const [first, ...rest] = (text ?? '').split(/\s+/);
  if (first && rest.length) filters.push(`and(first_name.ilike.%${first}%,last_name.ilike.%${rest.join(' ')}%)`);
  if (digits.length >= 3) filters.push(`phone_e164.like.%${digits}%`);
  const { data, error } = await supabase.from('customers').select(CUSTOMER_COLUMNS).is('archived_at', null).or(filters.join(',')).order('first_name').limit(8);
  if (error) throw new Error(`Could not search customers: ${error.message}`);
  return ((data ?? []) as unknown as CustomerRow[]).map(toChoice);
}

export async function getCustomerChoice(id: string): Promise<CustomerChoice | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('customers').select(CUSTOMER_COLUMNS).eq('id', id).is('archived_at', null).maybeSingle();
  if (error) throw new Error(`Could not load the customer: ${error.message}`);
  return data ? toChoice(data as unknown as CustomerRow) : null;
}

// An active calendar hold of this business (for "book this hold").
export async function getCalendarHold(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('schedule_blocks')
    .select('id, during, expires_at, note')
    .eq('id', id)
    .eq('kind', 'hold')
    .is('booking_request_id', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`Could not load the hold: ${error.message}`);
  if (!data) return null;
  const { start, end } = parseRange(String(data.during));
  return { id: data.id, start: start.toISOString(), end: end.toISOString(), expiresAt: data.expires_at!, note: data.note };
}

// A customer's appointments, newest first (customer page history).
export async function listCustomerAppointments(customerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('appointments')
    .select('id, booking_request_id, starts_at, ends_at, status, source, estimated_total_cents, vehicle:vehicles(year, make, model), appointment_items(name)')
    .eq('customer_id', customerId)
    .order('starts_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Could not load appointments: ${error.message}`);
  return data ?? [];
}
