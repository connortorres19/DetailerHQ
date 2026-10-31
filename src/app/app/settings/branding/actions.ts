'use server';

import { revalidatePath } from 'next/cache';
import { brandingFormSchema, SOCIAL_NETWORKS, toDraft } from '@/domain/branding';
import { failed, type FormState } from '@/domain/forms';
import { requireBusiness } from '@/data/session';
import { callWorkflow } from '@/data/workflow';
import { sweepMedia } from '@/lib/media/server';

// Field names in the form for each draft key the database may name in a refusal.
const FIELD_FOR: Record<string, string> = {
  primary_color: 'primaryColor',
  secondary_color: 'secondaryColor',
  accent_color: 'accentColor',
  website_url: 'website',
  intro_text: 'intro',
  cancellation_policy_text: 'cancellation',
  reschedule_policy_text: 'rescheduling',
  prep_instructions: 'prep',
  ...Object.fromEntries(SOCIAL_NETWORKS.map((n) => [`social_${n.key}`, `social_${n.key}`])),
};

async function save(formData: FormData): Promise<FormState | null> {
  const parsed = brandingFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    return failed('Check the highlighted fields.', formData, fieldErrors);
  }
  const draft = toDraft(parsed.data);
  if (!draft.ok) return failed(draft.message, formData);
  const result = await callWorkflow('save_branding_draft', { p_draft: draft.draft });
  if (!result.ok) {
    const field = result.detail ? FIELD_FOR[result.detail] : undefined;
    if (field) return failed('Check the highlighted fields.', formData, { [field]: sentence(result.reason ?? 'This isn’t valid.') });
    if (result.detail && /asset|gallery|service_photos/.test(result.detail))
      return failed('One of the images was removed or changed. Refresh the page and try again.', formData);
    return failed(result.message, formData);
  }
  return null;
}

const sentence = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? '' : '.') : s);

export async function saveBranding(_: FormState, formData: FormData): Promise<FormState> {
  await requireBusiness('/app/settings/branding');
  const error = await save(formData);
  if (error) return error;
  await sweepMedia();
  revalidatePath('/app/settings/branding');
  return { status: 'success', message: 'Draft saved. Customers still see your published page until you publish.', values: { at: String(Date.now()) } };
}

// Publish = save what's on screen, then make it live (images, colours, links and wording).
export async function publishBranding(_: FormState, formData: FormData): Promise<FormState> {
  const { business } = await requireBusiness('/app/settings/branding');
  const error = await save(formData);
  if (error) return error;
  const result = await callWorkflow('publish_branding', {});
  if (!result.ok) {
    if (result.detail && /asset|gallery|service_photos/.test(result.detail))
      return failed('One of the images was removed or changed. Refresh the page and try again.', formData);
    return failed(result.kind === 'invalid_state' ? 'There’s nothing new to publish.' : result.message, formData);
  }
  await sweepMedia();
  revalidatePath('/app/settings/branding');
  revalidatePath(`/book/${business.slug}`);
  return { status: 'success', message: 'Published. Your booking page now shows these changes.', values: { at: String(Date.now()), published: '1' } };
}

// Throw away unpublished changes: back to what customers see.
export async function discardBranding(): Promise<FormState> {
  await requireBusiness('/app/settings/branding');
  const result = await callWorkflow('discard_branding_draft', {});
  if (!result.ok) return failed(result.message);
  await sweepMedia();
  revalidatePath('/app/settings/branding');
  return { status: 'success', message: 'Unpublished changes discarded.', values: { at: String(Date.now()), discarded: '1' } };
}
