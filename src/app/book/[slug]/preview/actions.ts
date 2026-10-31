'use server';

import { z } from 'zod';
import { slotsSchema } from '@/domain/booking';
import { createClient } from '@/lib/supabase/server';
import type { SlotsResult } from '../actions';

const query = z.object({ serviceIds: z.array(z.uuid()).min(1).max(10), sizeId: z.uuid(), from: z.iso.date() });

// Owner preview: the same slot engine, for the signed-in owner's own business (any state).
export async function previewSlots(input: { slug: string; serviceIds: string[]; sizeId: string; from: string }): Promise<SlotsResult> {
  const q = query.safeParse(input);
  if (!q.success) return { ok: false, message: 'Choose a service and vehicle size first.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('preview_available_slots', {
    p_service_ids: q.data.serviceIds,
    p_size_class_id: q.data.sizeId,
    p_from: q.data.from,
    p_days: 14,
  });
  if (error) return { ok: false, message: 'Times couldn’t be loaded for the preview.' };
  return { ok: true, slots: slotsSchema.parse(data) };
}
