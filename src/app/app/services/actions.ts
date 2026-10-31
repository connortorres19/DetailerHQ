'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { listSizeClasses } from '@/data/customers';
import { requireBusiness } from '@/data/session';
import { idSchema } from '@/domain/customer';
import { failed, formValues, type FormState } from '@/domain/forms';
import { categorySchema, parseServiceForm, type ServiceInput } from '@/domain/service';
import { callWorkflow } from '@/data/workflow';

const NOT_FOUND = 'We couldn’t find that service. It may belong to another account or have been removed.';

function parseId(value: string, back = '/app/services') {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) redirect(back);
  return parsed.data;
}

function dbFailure(error: PostgrestError, formData?: FormData): FormState {
  if (error.code === '23503') return failed('That category or vehicle size isn’t in your account. Refresh and try again.', formData);
  if (error.code === '23514' || error.code === '22P02') return failed('Some of the details aren’t valid. Check them and try again.', formData);
  if (error.code === '42501') return failed('Your account can’t make changes right now.', formData);
  console.error('[services]', error);
  return failed('Something went wrong. Please try again.', formData);
}

// The service and its whole size grid are saved by ONE database call (public.save_service,
// migration 9): one transaction, so a failure anywhere leaves nothing partially saved.
const toPayload = (v: ServiceInput) => ({
  p_service: {
    name: v.name,
    description: v.description,
    category_id: v.categoryId,
    price_type: v.priceType,
    base_price_cents: v.basePriceCents,
    base_duration_min: v.baseDurationMin,
    is_addon: v.isAddon,
    is_bookable: v.isBookable,
  },
  p_prices: v.sizes.map((s) => ({ size_class_id: s.sizeClassId, price_cents: s.priceCents, duration_min: s.durationMin })),
});

// Validates the form server-side against the business's own vehicle sizes (read through RLS).
async function validate(formData: FormData) {
  const sizes = await listSizeClasses();
  const result = parseServiceForm(formData, sizes.map((s) => s.id));
  if (!result.ok) return { error: failed('Check the highlighted fields.', formData, result.fieldErrors) } as const;
  return { data: result.data } as const;
}

// Database reasons → owner-facing messages, on the field they concern.
function saveFailure(result: { kind: string; code: string | undefined; message: string; detail?: string }, formData: FormData): FormState {
  switch (result.detail) {
    case 'duplicate_size':
      return failed('Each vehicle size can only be priced once. Check the size grid.', formData, { sizes: 'Each vehicle size can only be priced once.' });
    case 'size_not_in_business':
      return failed('One of those vehicle sizes isn’t in your account. Refresh and try again.', formData, { sizes: 'Unknown vehicle size.' });
    case 'service_not_found':
    case 'service_not_in_business':
      return failed(NOT_FOUND, formData);
  }
  if (result.code === '23503') return failed('That category or vehicle size isn’t in your account. Refresh and try again.', formData);
  if (result.code === '23514' || result.kind === 'invalid_input') return failed('Some of the details aren’t valid. Check them and try again.', formData);
  return failed(result.message, formData);
}

// ---- Services ------------------------------------------------------------------------

export async function createService(_: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/services/new');
  const v = await validate(formData);
  if (v.error) return v.error;
  // null = create (the generated type marks the uuid parameter non-null; the function accepts null).
  const result = await callWorkflow('save_service', { p_service_id: null as unknown as string, ...toPayload(v.data) });
  if (!result.ok) return saveFailure(result, formData);
  revalidatePath('/app', 'layout');
  redirect('/app/services?saved=created');
}

export async function updateService(serviceId: string, _: FormState, formData: FormData): Promise<FormState> {
  const id = parseId(serviceId);
  await requireBusiness(`/app/services/${id}`);
  const v = await validate(formData);
  if (v.error) return v.error;
  const result = await callWorkflow('save_service', { p_service_id: id, ...toPayload(v.data) });
  if (!result.ok) return saveFailure(result, formData);
  revalidatePath('/app', 'layout');
  redirect('/app/services?saved=updated');
}

async function setArchived(serviceId: string, archived: boolean) {
  const id = parseId(serviceId);
  await requireBusiness('/app/services');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('services')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) console.error('[services] archive', error);
  if (error || !data) redirect('/app/services?saved=missing');
  revalidatePath('/app', 'layout');
  redirect(`/app/services?saved=${archived ? 'archived' : 'restored'}`);
}

// Archive, never delete: past requests and appointments keep their service lines.
export async function archiveService(serviceId: string) {
  await setArchived(serviceId, true);
}

export async function restoreService(serviceId: string) {
  await setArchived(serviceId, false);
}

// Moves a service up or down among the active services in its category.
export async function moveService(serviceId: string, direction: 'up' | 'down') {
  const id = parseId(serviceId);
  await requireBusiness('/app/services');
  const supabase = await createClient();
  const { data: service } = await supabase.from('services').select('id, category_id').eq('id', id).is('archived_at', null).maybeSingle();
  if (!service) redirect('/app/services?saved=missing');
  let siblings = supabase.from('services').select('id').is('archived_at', null).order('sort_order').order('name');
  siblings = service.category_id ? siblings.eq('category_id', service.category_id) : siblings.is('category_id', null);
  const { data: list } = await siblings;
  const ids = (list ?? []).map((s) => s.id);
  const from = ids.indexOf(id);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from >= 0 && to >= 0 && to < ids.length) {
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    for (const [index, sid] of ids.entries()) await supabase.from('services').update({ sort_order: index + 1 }).eq('id', sid);
  }
  revalidatePath('/app/services');
  redirect('/app/services');
}

// ---- Categories ----------------------------------------------------------------------

export async function createCategory(_: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness('/app/services');
  const parsed = categorySchema.safeParse({ name: formData.get('name') ?? '' });
  if (!parsed.success) return failed(parsed.error.issues[0]!.message, formData, { name: parsed.error.issues[0]!.message });
  const supabase = await createClient();
  const { data: last } = await supabase.from('service_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from('service_categories').insert({ business_id: business.id, name: parsed.data.name, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) return dbFailure(error, formData);
  revalidatePath('/app/services');
  return { status: 'success', message: `Category “${parsed.data.name}” added.` };
}

export async function renameCategory(categoryId: string, _: FormState, formData: FormData): Promise<FormState> {
  const id = parseId(categoryId);
  await requireBusiness('/app/services');
  const parsed = categorySchema.safeParse({ name: formData.get('name') ?? '' });
  if (!parsed.success) return failed(parsed.error.issues[0]!.message, formData, { name: parsed.error.issues[0]!.message });
  const supabase = await createClient();
  const { data, error } = await supabase.from('service_categories').update({ name: parsed.data.name }).eq('id', id).select('id').maybeSingle();
  if (error) return dbFailure(error, formData);
  if (!data) return failed('We couldn’t find that category.', formData);
  revalidatePath('/app/services');
  return { status: 'success', message: 'Category renamed.', values: formValues(formData) };
}

// Only empty categories can be deleted; the foreign key from services enforces it too.
export async function deleteCategory(categoryId: string) {
  const id = parseId(categoryId);
  await requireBusiness('/app/services');
  const supabase = await createClient();
  const { data, error } = await supabase.from('service_categories').delete().eq('id', id).select('id').maybeSingle();
  revalidatePath('/app/services');
  if (error?.code === '23503') redirect('/app/services?saved=category-in-use');
  if (error || !data) redirect('/app/services?saved=missing');
  redirect('/app/services?saved=category-deleted');
}

export async function moveCategory(categoryId: string, direction: 'up' | 'down') {
  const id = parseId(categoryId);
  await requireBusiness('/app/services');
  const supabase = await createClient();
  const { data: list } = await supabase.from('service_categories').select('id').order('sort_order').order('name');
  const ids = (list ?? []).map((c) => c.id);
  const from = ids.indexOf(id);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from >= 0 && to >= 0 && to < ids.length) {
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    for (const [index, cid] of ids.entries()) await supabase.from('service_categories').update({ sort_order: index + 1 }).eq('id', cid);
  }
  revalidatePath('/app/services');
  redirect('/app/services');
}
