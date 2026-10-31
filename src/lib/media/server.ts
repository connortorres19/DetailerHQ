import 'server-only';
import { createClient } from '@/lib/supabase/server';

export const MEDIA_BUCKET = 'business-media';

type Client = Awaited<ReturnType<typeof createClient>>;

// Deletes images nothing uses any more (replaced, removed, discarded, or abandoned uploads) — the
// database marks them, the owner's own session deletes the files (Storage RLS allows only files the
// database marked), and only then are the rows forgotten. Best effort: anything left is retried
// on the next run, and a file is never orphaned because a row is removed only once its file is gone.
export async function sweepMedia(supabase?: Client) {
  const client = supabase ?? (await createClient());
  const { data: paths, error } = await client.rpc('media_garbage');
  if (error || !paths?.length) return;
  for (let i = 0; i < paths.length; i += 100) {
    await client.storage.from(MEDIA_BUCKET).remove(paths.slice(i, i + 100));
  }
  await client.rpc('purge_media');
}
