'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isIsoDate, localTimestamp } from '@/domain/bookings';
import { failed, formValues, type FormState } from '@/domain/forms';
import { leadSchema, toLeadRow } from '@/domain/leads';
import { requireBusiness } from '@/data/session';
import { callWorkflow } from '@/data/workflow';
import { createClient } from '@/lib/supabase/server';

// Leads (Phase 5). Owners edit their own leads directly under RLS (business_id from the session,
// never the form); history, contact logs, follow-up completion and customer conversion go through
// database functions.

const id = z.uuid();
const fieldErrors = (error: z.ZodError) => {
  const out: Record<string, string> = {};
  for (const i of error.issues) out[String(i.path[0])] ??= i.message;
  return out;
};

export async function saveLead(leadId: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness('/app/leads');
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed('Check the highlighted fields.', formData, fieldErrors(parsed.error));
  const row = toLeadRow(parsed.data);
  const supabase = await createClient();
  const result = leadId
    ? id.safeParse(leadId).success
      ? await supabase.from('leads').update(row).eq('id', leadId).select('id').maybeSingle()
      : { data: null, error: null }
    : await supabase.from('leads').insert({ ...row, business_id: business.id }).select('id').single();
  if (result.error || !result.data) {
    if (result.error) console.error('[leads] save', result.error);
    return failed(result.error?.code === '23503' ? 'That customer or vehicle wasn’t found.' : 'That didn’t save. Check the details and try again.', formData);
  }
  revalidatePath('/app', 'layout');
  redirect(`/app/leads/${result.data.id}?saved=1`);
}

const statusSchema = z.object({
  status: z.enum(['new', 'contacted', 'quote_sent', 'booked', 'lost']),
  lostReason: z.string().optional().transform((v) => v || null),
});

export async function setLeadStatus(leadId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/leads');
  const v = statusSchema.safeParse(Object.fromEntries(formData));
  if (!id.safeParse(leadId).success || !v.success) return failed('Choose a status.');
  if (v.data.status === 'lost' && !v.data.lostReason) return failed('Choose why the lead was lost.', formData, { lostReason: 'Choose a reason.' });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .update({ status: v.data.status, lost_reason: v.data.status === 'lost' ? (v.data.lostReason as never) : null })
    .eq('id', leadId)
    .select('id')
    .maybeSingle();
  if (error || !data) return failed('That didn’t save. Please try again.');
  revalidatePath('/app', 'layout');
  return { status: 'success', message: 'Status updated.', values: { at: String(Date.now()) } };
}

const activitySchema = z.object({
  kind: z.enum(['note', 'contacted']),
  channel: z.string().optional().transform((v) => v || null),
  note: z.string().trim().max(1000, 'Use 1,000 characters or fewer.').optional().transform((v) => v || null),
});

export async function logLeadActivity(leadId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/leads');
  const v = activitySchema.safeParse(Object.fromEntries(formData));
  if (!id.safeParse(leadId).success || !v.success) return failed(v.success ? 'Lead not found.' : v.error.issues[0]!.message, formData);
  if (v.data.kind === 'note' && !v.data.note) return failed('Write the note first.', formData);
  const result = await callWorkflow('log_lead_activity', {
    p_lead_id: leadId,
    p_kind: v.data.kind,
    ...(v.data.note ? { p_note: v.data.note } : {}),
    ...(v.data.kind === 'contacted' && v.data.channel ? { p_channel: v.data.channel } : {}),
  });
  if (!result.ok) return failed(result.message, formData);
  revalidatePath('/app', 'layout');
  return { status: 'success', message: v.data.kind === 'note' ? 'Note added.' : 'Contact logged.', values: { at: String(Date.now()) } };
}

const followUpSchema = z.object({
  date: z.string().refine(isIsoDate, 'Choose a date.'),
  time: z.string().optional().transform((v) => (v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '09:00')),
  note: z.string().trim().max(300, 'Use 300 characters or fewer.').optional().transform((v) => v || null),
});

// Follow-ups are private fields: set directly (RLS), completed through the function (history).
export async function setFollowUp(kind: 'lead' | 'quote', recordId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness('/app/follow-ups');
  const v = followUpSchema.safeParse(Object.fromEntries(formData));
  if (!id.safeParse(recordId).success) return failed('Not found.');
  if (!v.success) return failed(v.error.issues[0]!.message, formData);
  const supabase = await createClient();
  const patch = { next_follow_up_at: localTimestamp(v.data.date, v.data.time, business.timezone), follow_up_note: v.data.note };
  const { data, error } = kind === 'lead'
    ? await supabase.from('leads').update(patch).eq('id', recordId).select('id').maybeSingle()
    : await supabase.from('quotes').update(patch).eq('id', recordId).select('id').maybeSingle();
  if (error || !data) return failed('That didn’t save. Please try again.', formData);
  revalidatePath('/app', 'layout');
  return { status: 'success', message: 'Follow-up set.', values: { at: String(Date.now()) } };
}

export async function completeFollowUp(kind: 'lead' | 'quote', recordId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/follow-ups');
  if (!id.safeParse(recordId).success) return failed('Not found.');
  const note = String(formData.get('note') ?? '').trim().slice(0, 300);
  const result = await callWorkflow('complete_follow_up', {
    p_lead_id: kind === 'lead' ? recordId : (null as unknown as string),
    p_quote_id: kind === 'quote' ? recordId : (null as unknown as string),
    ...(note ? { p_note: note } : {}),
  });
  if (!result.ok) return failed(result.kind === 'invalid_state' ? 'There’s no follow-up to complete.' : result.message);
  revalidatePath('/app', 'layout');
  return { status: 'success', message: 'Follow-up done.', values: { at: String(Date.now()) } };
}

export async function convertLeadToCustomer(leadId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/leads');
  const existing = String(formData.get('customerId') ?? '');
  if (!id.safeParse(leadId).success || (existing && !id.safeParse(existing).success)) return failed('Not found.');
  const result = await callWorkflow('convert_lead_to_customer', { p_lead_id: leadId, ...(existing ? { p_customer_id: existing } : {}) });
  if (!result.ok)
    return failed(result.kind === 'invalid_input' ? 'Add a phone number or email to the lead first.' : result.message, formData);
  revalidatePath('/app', 'layout');
  return { status: 'success', message: 'Customer record ready.', values: { at: String(Date.now()), customerId: String(result.data) } };
}

export async function updateLeadNotes(leadId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/leads');
  const notes = String(formData.get('notes') ?? '').trim();
  if (!id.safeParse(leadId).success || notes.length > 2000) return failed('Use 2,000 characters or fewer.', formData);
  const supabase = await createClient();
  const { error } = await supabase.from('leads').update({ notes: notes || null }).eq('id', leadId);
  if (error) return failed('That didn’t save.', formData);
  revalidatePath('/app', 'layout');
  return { status: 'success', message: 'Notes saved.', values: { ...formValues(formData), at: String(Date.now()) } };
}
