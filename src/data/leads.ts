import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { LEAD_STATUSES, quoteStatus } from '@/domain/leads';
import { searchTerms } from '@/domain/customer';
import { callPublic, clientIpHash, isWellFormedToken, sha256, type PublicError } from '@/lib/booking/server';
import { createClient } from '@/lib/supabase/server';

// Leads, quotes and follow-ups (Phase 5). Owner reads go through RLS (own business only); the
// customer's quote page goes through the restricted booking_api role by token hash.

const LEAD_COLUMNS =
  'id, status, source, lost_reason, contact_first_name, contact_last_name, contact_phone_e164, contact_email, customer_id, vehicle_id, ' +
  'vehicle_description, vehicle_year, vehicle_make, vehicle_model, size_class_id, service_id, request_text, notes, next_follow_up_at, ' +
  'follow_up_note, last_contacted_at, created_at, updated_at, service:services(name), size:vehicle_size_classes(name)';

export type LeadRow = {
  id: string; status: string; source: string; lost_reason: string | null; contact_first_name: string; contact_last_name: string | null;
  contact_phone_e164: string | null; contact_email: string | null; customer_id: string | null; vehicle_id: string | null;
  vehicle_description: string | null; vehicle_year: number | null; vehicle_make: string | null; vehicle_model: string | null;
  size_class_id: string | null; service_id: string | null; request_text: string | null; notes: string | null;
  next_follow_up_at: string | null; follow_up_note: string | null; last_contacted_at: string | null; created_at: string; updated_at: string;
  service: { name: string } | null; size: { name: string } | null;
};

export async function listLeads({ status, q }: { status: string; q?: string }) {
  const supabase = await createClient();
  let query = supabase.from('leads').select(LEAD_COLUMNS).order('created_at', { ascending: false }).limit(300);
  const { text, digits } = searchTerms(q);
  if (text) {
    const filters = [`contact_first_name.ilike.%${text}%`, `contact_last_name.ilike.%${text}%`, `contact_email.ilike.%${text}%`,
      `vehicle_make.ilike.%${text}%`, `vehicle_model.ilike.%${text}%`, `request_text.ilike.%${text}%`];
    if (digits.length >= 3) filters.push(`contact_phone_e164.like.%${digits}%`);
    query = query.or(filters.join(','));
  }
  const { data, error } = await query;
  if (error) throw new Error(`Could not load leads: ${error.message}`);
  const rows = (data ?? []) as unknown as LeadRow[];
  const norm = (s: string) => (s === 'follow_up_due' ? 'contacted' : s);
  const counts = Object.fromEntries([['all', rows.length], ...LEAD_STATUSES.map((s) => [s.value, rows.filter((r) => norm(r.status) === s.value).length])]);
  return { rows: status === 'all' ? rows : rows.filter((r) => norm(r.status) === status), counts: counts as Record<string, number> };
}

const HISTORY = 'id, kind, from_status, to_status, actor_type, metadata, created_at';

export async function getLead(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('leads').select(LEAD_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`Could not load the lead: ${error.message}`);
  if (!data) return null;
  const lead = data as unknown as LeadRow;
  const [history, quotes, customer] = await Promise.all([
    supabase.from('activity_events').select(HISTORY).eq('lead_id', id).order('created_at'),
    supabase.from('quotes').select('id, number, status, total_cents, valid_until, created_at').eq('lead_id', id).order('created_at', { ascending: false }),
    lead.customer_id
      ? supabase.from('customers').select('id, first_name, last_name, vehicles(id, year, make, model)').eq('id', lead.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (history.error || quotes.error) throw new Error('Could not load the lead history.');
  return { lead, history: history.data ?? [], quotes: quotes.data ?? [], customer: customer.data };
}

const QUOTE_COLUMNS =
  'id, number, status, lead_id, customer_id, vehicle_id, vehicle_text, valid_until, notes, terms, internal_notes, subtotal_cents, ' +
  'discount_cents, total_cents, token_nonce, link_version, sent_at, decided_at, proposed_start, next_follow_up_at, follow_up_note, created_at, updated_at, ' +
  'customer:customers(id, first_name, last_name, phone_e164, email, address_line1, city, state, postal_code), vehicle:vehicles(id, year, make, model, size_class_id), ' +
  'quote_items(id, service_id, name, description, quantity, price_cents, duration_min, created_at)';

export type QuoteRow = {
  id: string; number: number; status: string; lead_id: string | null; customer_id: string | null; vehicle_id: string | null;
  vehicle_text: string | null; valid_until: string | null; notes: string | null; terms: string | null; internal_notes: string | null;
  subtotal_cents: number; discount_cents: number; total_cents: number; token_nonce: string | null; link_version: number | null; sent_at: string | null;
  decided_at: string | null; proposed_start: string | null; next_follow_up_at: string | null; follow_up_note: string | null;
  created_at: string; updated_at: string;
  customer: { id: string; first_name: string; last_name: string | null; phone_e164: string | null; email: string | null; address_line1: string | null; city: string | null; state: string | null; postal_code: string | null } | null;
  vehicle: { id: string; year: number | null; make: string; model: string; size_class_id: string | null } | null;
  quote_items: { id: string; service_id: string | null; name: string; description: string | null; quantity: number; price_cents: number; duration_min: number | null; created_at: string }[];
};

export async function listQuotes({ status, today }: { status: string; today: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('quotes').select(QUOTE_COLUMNS).order('created_at', { ascending: false }).limit(300);
  if (error) throw new Error(`Could not load quotes: ${error.message}`);
  const rows = ((data ?? []) as unknown as QuoteRow[]).map((q) => ({ ...q, display: quoteStatus(q.status, q.valid_until, today) }));
  const counts: Record<string, number> = { all: rows.length };
  for (const r of rows) counts[r.display.value] = (counts[r.display.value] ?? 0) + 1;
  return { rows: status === 'all' ? rows : rows.filter((r) => r.display.value === status), counts };
}

export async function getQuote(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('quotes').select(QUOTE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(`Could not load the quote: ${error.message}`);
  if (!data) return null;
  const quote = data as unknown as QuoteRow;
  quote.quote_items.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.name.localeCompare(b.name));
  const [history, appointment, lead] = await Promise.all([
    supabase.from('activity_events').select(HISTORY).eq('quote_id', id).order('created_at'),
    supabase.from('appointments').select('id, starts_at, status').eq('quote_id', id).maybeSingle(),
    quote.lead_id ? supabase.from('leads').select('id, contact_first_name, contact_last_name, status').eq('id', quote.lead_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  return { quote, history: history.data ?? [], appointment: appointment.data, lead: lead.data };
}

// The dashboard's follow-up view.
export async function getFollowUps() {
  const supabase = await createClient();
  const [leadFollowUps, quoteFollowUps, awaiting, accepted, uncontacted] = await Promise.all([
    supabase.from('leads').select('id, contact_first_name, contact_last_name, status, next_follow_up_at, follow_up_note').not('next_follow_up_at', 'is', null).order('next_follow_up_at'),
    supabase.from('quotes').select('id, number, status, next_follow_up_at, follow_up_note, customer:customers(first_name, last_name)').not('next_follow_up_at', 'is', null).order('next_follow_up_at'),
    supabase.from('quotes').select('id, number, sent_at, valid_until, total_cents, customer:customers(first_name, last_name)').eq('status', 'sent').order('valid_until'),
    supabase.from('quotes').select('id, number, decided_at, total_cents, customer:customers(first_name, last_name)').eq('status', 'accepted').order('decided_at'),
    supabase.from('leads').select('id, contact_first_name, contact_last_name, source, created_at, request_text').eq('status', 'new').is('last_contacted_at', null).order('created_at'),
  ]);
  for (const r of [leadFollowUps, quoteFollowUps, awaiting, accepted, uncontacted]) if (r.error) throw new Error(`Could not load follow-ups: ${r.error.message}`);
  return {
    leadFollowUps: leadFollowUps.data ?? [],
    quoteFollowUps: (quoteFollowUps.data ?? []) as unknown as { id: string; number: number; status: string; next_follow_up_at: string; follow_up_note: string | null; customer: { first_name: string; last_name: string | null } | null }[],
    awaiting: (awaiting.data ?? []) as unknown as { id: string; number: number; sent_at: string; valid_until: string | null; total_cents: number; customer: { first_name: string; last_name: string | null } | null }[],
    accepted: (accepted.data ?? []) as unknown as { id: string; number: number; decided_at: string; total_cents: number; customer: { first_name: string; last_name: string | null } | null }[],
    uncontacted: uncontacted.data ?? [],
  };
}

export async function countFollowUpsDue(endOfToday: string) {
  const supabase = await createClient();
  const [leads, quotes, accepted] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).lte('next_follow_up_at', endOfToday),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).lte('next_follow_up_at', endOfToday),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('status', 'accepted'),
  ]);
  return { due: (leads.count ?? 0) + (quotes.count ?? 0), acceptedToBook: accepted.count ?? 0 };
}

export async function listForCustomer(customerId: string) {
  const supabase = await createClient();
  const [leads, quotes] = await Promise.all([
    supabase.from('leads').select('id, status, source, request_text, created_at').eq('customer_id', customerId).order('created_at', { ascending: false }),
    supabase.from('quotes').select('id, number, status, total_cents, valid_until, decided_at, created_at').eq('customer_id', customerId).order('created_at', { ascending: false }),
  ]);
  return { leads: leads.data ?? [], quotes: quotes.data ?? [] };
}

// --- The customer's quote page ---------------------------------------------------------------

export const publicQuoteSchema = z.object({
  number: z.number(),
  status: z.string(),
  business: z.object({ name: z.string(), phone: z.string().nullable(), timezone: z.string(), slug: z.string().nullable() }),
  customer_first_name: z.string().nullable(),
  vehicle: z.string().nullable(),
  items: z.array(z.object({ name: z.string(), description: z.string().nullable(), quantity: z.number(), price_cents: z.number() })),
  subtotal_cents: z.number(),
  discount_cents: z.number(),
  total_cents: z.number(),
  valid_until: z.string().nullable(),
  notes: z.string().nullable(),
  terms: z.string().nullable(),
  proposed_start: z.string().nullable(),
  sent_at: z.string().nullable(),
  decided_at: z.string().nullable(),
  already: z.boolean().optional(),
});
export type PublicQuote = z.infer<typeof publicQuoteSchema>;

export const getPublicQuote = cache(async (token: string): Promise<{ ok: true; quote: PublicQuote } | { ok: false; error: PublicError | null }> => {
  if (!isWellFormedToken(token)) return { ok: false, error: null };
  const result = await callPublic<unknown>('get_quote', [sha256(token), await clientIpHash()]);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, quote: publicQuoteSchema.parse(result.data) };
});

// Options for lead forms: every active service (quote-only ones too) and vehicle sizes.
export async function leadFormOptions() {
  const supabase = await createClient();
  const [services, sizes] = await Promise.all([
    supabase.from('services').select('id, name, is_addon').is('archived_at', null).order('sort_order').order('name'),
    supabase.from('vehicle_size_classes').select('id, name').is('archived_at', null).order('sort_order'),
  ]);
  return {
    services: (services.data ?? []).filter((s) => !s.is_addon).map((s) => ({ value: s.id, label: s.name })),
    sizes: (sizes.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  };
}

// The service catalog for the quote builder (every active service; quote-only ones start at $0).
export async function quoteCatalog() {
  const supabase = await createClient();
  const [services, sizes] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, description, category_id, price_type, base_price_cents, base_duration_min, is_addon, service_prices(size_class_id, price_cents, duration_min)')
      .is('archived_at', null)
      .order('sort_order')
      .order('name'),
    supabase.from('vehicle_size_classes').select('id, name, examples').is('archived_at', null).order('sort_order'),
  ]);
  if (services.error || sizes.error) throw new Error('Could not load the service catalog.');
  return {
    services: (services.data ?? []).map((s) => ({
      id: s.id, name: s.name, description: s.description, category_id: s.category_id, price_type: s.price_type,
      price_cents: s.base_price_cents, duration_min: s.base_duration_min, is_addon: s.is_addon, by_size: s.service_prices ?? [],
    })),
    sizes: sizes.data ?? [],
  };
}
