import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { searchTerms } from '@/domain/customer';

// Owner reads/writes for customers and vehicles go straight to the tables with the owner's
// session: RLS limits every query to their business (members_* policies, Phase 1). There is
// no business_id filter to forget — rows from other businesses are simply invisible.

export const PAGE_SIZE = 50;

export async function listCustomers({ q, archived, page }: { q?: string; archived: boolean; page: number }) {
  const supabase = await createClient();
  let query = supabase
    .from('customers')
    .select('id, first_name, last_name, phone_e164, email, archived_at, created_at, vehicles(id, year, make, model, archived_at)', { count: 'exact' })
    .order('first_name')
    .order('last_name', { nullsFirst: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);

  const { text, digits } = searchTerms(q);
  if (text) {
    const filters = [`first_name.ilike.%${text}%`, `last_name.ilike.%${text}%`, `email.ilike.%${text}%`];
    const [first, ...rest] = text.split(/\s+/);
    if (first && rest.length) filters.push(`and(first_name.ilike.%${first}%,last_name.ilike.%${rest.join(' ')}%)`);
    if (digits.length >= 3) filters.push(`phone_e164.like.%${digits}%`);
    query = query.or(filters.join(','));
  }

  const { data, count, error } = await query;
  if (error) throw new Error(`Could not load customers: ${error.message}`);
  return { customers: data ?? [], total: count ?? 0 };
}

export async function getCustomer(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('customers')
    .select('*, vehicles(*, size_class:vehicle_size_classes(name))')
    .eq('id', id)
    .order('created_at', { referencedTable: 'vehicles' })
    .maybeSingle();
  if (error) throw new Error(`Could not load customer: ${error.message}`);
  return data;
}

export async function getVehicle(customerId: string, vehicleId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vehicles')
    .select('*, customer:customers(id, first_name, last_name)')
    .eq('id', vehicleId)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error) throw new Error(`Could not load vehicle: ${error.message}`);
  return data;
}

export async function listSizeClasses() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vehicle_size_classes')
    .select('id, name, examples')
    .is('archived_at', null)
    .order('sort_order');
  if (error) throw new Error(`Could not load vehicle sizes: ${error.message}`);
  return data ?? [];
}

// Possible duplicates within this business (same phone or email), for the create warning.
export async function findDuplicates(phone: string | null, email: string | null, exceptId?: string) {
  if (!phone && !email) return [];
  const supabase = await createClient();
  const filters = [phone ? `phone_e164.eq.${phone}` : null, email ? `email.eq.${email}` : null].filter(Boolean).join(',');
  let query = supabase.from('customers').select('id, first_name, last_name, phone_e164, email, archived_at').or(filters).limit(5);
  if (exceptId) query = query.neq('id', exceptId);
  const { data, error } = await query;
  if (error) throw new Error(`Could not check duplicates: ${error.message}`);
  return data ?? [];
}

// Ids (among `customers`) sharing a phone or email with another active customer of this business.
// Public bookings always create new records (D-28); this is how the owner spots possible duplicates.
export async function duplicateIds(customers: { id: string; phone_e164: string | null; email: string | null }[]) {
  const phones = [...new Set(customers.map((c) => c.phone_e164).filter((v): v is string => Boolean(v)))];
  const emails = [...new Set(customers.map((c) => c.email).filter((v): v is string => Boolean(v)))];
  if (!phones.length && !emails.length) return new Set<string>();
  const supabase = await createClient();
  const filters = [
    phones.length ? `phone_e164.in.(${phones.map((p) => `"${p}"`).join(',')})` : null,
    emails.length ? `email.in.(${emails.map((e) => `"${e.replaceAll('"', '')}"`).join(',')})` : null,
  ].filter(Boolean);
  const { data, error } = await supabase.from('customers').select('id, phone_e164, email').is('archived_at', null).or(filters.join(','));
  if (error) throw new Error(`Could not check duplicates: ${error.message}`);
  const all = data ?? [];
  return new Set(
    customers
      .filter((c) => all.some((o) => o.id !== c.id && ((c.phone_e164 && o.phone_e164 === c.phone_e164) || (c.email && o.email === c.email))))
      .map((c) => c.id),
  );
}
