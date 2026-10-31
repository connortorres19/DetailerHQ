import 'server-only';
import { createClient } from '@/lib/supabase/server';

// Owner reads for services, size pricing and categories — RLS limits every query to the
// signed-in owner's business (members_* policies, Phase 1).

const SERVICE_FIELDS =
  'id, name, description, category_id, price_type, base_price_cents, base_duration_min, is_addon, is_bookable, sort_order, archived_at, prices:service_prices(size_class_id, price_cents, duration_min)';

export async function listServices(archived: boolean) {
  const supabase = await createClient();
  let query = supabase.from('services').select(SERVICE_FIELDS).order('sort_order').order('name');
  query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load services: ${error.message}`);
  return data ?? [];
}

export async function getService(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('services').select(SERVICE_FIELDS).eq('id', id).maybeSingle();
  if (error) throw new Error(`Could not load service: ${error.message}`);
  return data;
}

export async function listCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('service_categories')
    .select('id, name, sort_order, services(count)')
    .order('sort_order')
    .order('name');
  if (error) throw new Error(`Could not load categories: ${error.message}`);
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, sort_order: c.sort_order, serviceCount: c.services[0]?.count ?? 0 }));
}

export async function countActiveServices() {
  const supabase = await createClient();
  const { count, error } = await supabase.from('services').select('id', { count: 'exact', head: true }).is('archived_at', null);
  if (error) throw new Error(`Could not count services: ${error.message}`);
  return count ?? 0;
}
