'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { findDuplicates } from '@/data/customers';
import { requireBusiness } from '@/data/session';
import { customerName, customerSchema, idSchema, toCustomerRow, toVehicleRow, vehicleSchema } from '@/domain/customer';
import { formatPhone } from '@/domain/business';
import { failed, invalid, type FormState } from '@/domain/forms';

export type CustomerFormState = FormState & { duplicates?: { id: string; name: string; contact: string; archived: boolean }[] };

const NOT_FOUND = 'We couldn’t find that record. It may belong to another account or have been removed.';

// Database errors that can reach an owner, in their words. Anything else is logged.
function dbFailure(error: PostgrestError, formData?: FormData): FormState {
  if (error.code === '23503' || error.code === 'PGRST116') return failed(NOT_FOUND, formData);
  if (error.code === '23514' || error.code === '22P02') return failed('Some of the details aren’t valid. Check them and try again.', formData);
  if (error.code === '42501') return failed('Your account can’t make changes right now.', formData);
  console.error('[customers]', error);
  return failed('Something went wrong. Please try again.', formData);
}

function parseId(value: string) {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) redirect('/app/customers');
  return parsed.data;
}

// ---- Customers -----------------------------------------------------------------------

export async function createCustomer(_: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const { business } = await requireBusiness('/app/customers/new');
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  // Warn about likely duplicates in this business (§7.4) unless the owner confirmed.
  if (formData.get('confirmDuplicate') !== '1') {
    const matches = await findDuplicates(parsed.data.phone, parsed.data.email);
    if (matches.length) {
      return {
        ...failed('A customer with this phone number or email already exists.', formData),
        duplicates: matches.map((c) => ({
          id: c.id,
          name: customerName(c),
          contact: [formatPhone(c.phone_e164), c.email].filter(Boolean).join(' · '),
          archived: Boolean(c.archived_at),
        })),
      };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('customers')
    .insert({ business_id: business.id, ...toCustomerRow(parsed.data) })
    .select('id')
    .single();
  if (error) return dbFailure(error, formData);
  revalidatePath('/app', 'layout');
  redirect(`/app/customers/${data.id}?saved=created`);
}

export async function updateCustomer(customerId: string, _: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const id = parseId(customerId);
  await requireBusiness(`/app/customers/${id}/edit`);
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  const supabase = await createClient();
  const { data, error } = await supabase.from('customers').update(toCustomerRow(parsed.data)).eq('id', id).select('id').maybeSingle();
  if (error) return dbFailure(error, formData);
  if (!data) return failed(NOT_FOUND, formData);
  revalidatePath('/app', 'layout');
  redirect(`/app/customers/${id}?saved=updated`);
}

async function setCustomerArchived(customerId: string, archived: boolean) {
  const id = parseId(customerId);
  await requireBusiness(`/app/customers/${id}`);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('customers')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[customers] archive', error);
    redirect(`/app/customers/${id}?saved=error`);
  }
  if (!data) redirect('/app/customers?missing=1');
  revalidatePath('/app', 'layout');
  redirect(`/app/customers/${id}?saved=${archived ? 'archived' : 'restored'}`);
}

// Archive, never delete (owner decision): history stays intact and it can be undone.
export async function archiveCustomer(customerId: string) {
  await setCustomerArchived(customerId, true);
}

export async function restoreCustomer(customerId: string) {
  await setCustomerArchived(customerId, false);
}

// ---- Vehicles ------------------------------------------------------------------------

export async function createVehicle(customerId: string, _: FormState, formData: FormData): Promise<FormState> {
  const id = parseId(customerId);
  const { business } = await requireBusiness(`/app/customers/${id}/vehicles/new`);
  const parsed = vehicleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  // The composite foreign key (business_id, customer_id) rejects a customer from another business.
  const supabase = await createClient();
  const { error } = await supabase.from('vehicles').insert({ business_id: business.id, customer_id: id, ...toVehicleRow(parsed.data) });
  if (error) return dbFailure(error, formData);
  revalidatePath('/app', 'layout');
  redirect(`/app/customers/${id}?saved=vehicle-added`);
}

export async function updateVehicle(customerId: string, vehicleId: string, _: FormState, formData: FormData): Promise<FormState> {
  const id = parseId(customerId);
  const vid = parseId(vehicleId);
  await requireBusiness(`/app/customers/${id}`);
  const parsed = vehicleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vehicles')
    .update(toVehicleRow(parsed.data))
    .eq('id', vid)
    .eq('customer_id', id)
    .select('id')
    .maybeSingle();
  if (error) return dbFailure(error, formData);
  if (!data) return failed(NOT_FOUND, formData);
  revalidatePath('/app', 'layout');
  redirect(`/app/customers/${id}?saved=vehicle-updated`);
}

async function setVehicleArchived(customerId: string, vehicleId: string, archived: boolean) {
  const id = parseId(customerId);
  const vid = parseId(vehicleId);
  await requireBusiness(`/app/customers/${id}`);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vehicles')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', vid)
    .eq('customer_id', id)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[vehicles] archive', error);
    redirect(`/app/customers/${id}?saved=error`);
  }
  if (!data) redirect('/app/customers?missing=1');
  revalidatePath('/app', 'layout');
  redirect(`/app/customers/${id}?saved=${archived ? 'vehicle-archived' : 'vehicle-restored'}`);
}

export async function archiveVehicle(customerId: string, vehicleId: string) {
  await setVehicleArchived(customerId, vehicleId, true);
}

export async function restoreVehicle(customerId: string, vehicleId: string) {
  await setVehicleArchived(customerId, vehicleId, false);
}
