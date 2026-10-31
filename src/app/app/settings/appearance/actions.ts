'use server';

import { revalidatePath } from 'next/cache';
import { failed, type FormState } from '@/domain/forms';
import { themeSchema } from '@/domain/theme';
import { requireUser } from '@/data/session';
import { createClient } from '@/lib/supabase/server';

// Saves the signed-in user's dashboard theme (their own row only: RLS on user_preferences).
export async function saveTheme(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser('/app/settings/appearance');
  const parsed = themeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed('Choose an appearance.');
  const supabase = await createClient();
  const { error } = await supabase.from('user_preferences').upsert({ user_id: user.id, theme: parsed.data.theme }, { onConflict: 'user_id' });
  if (error) {
    console.error('[appearance] save', error);
    return failed('That didn’t save. Please try again.');
  }
  revalidatePath('/app', 'layout');
  return { status: 'success', message: 'Appearance saved. It follows you on every device you sign in on.', values: { theme: parsed.data.theme, at: String(Date.now()) } };
}
