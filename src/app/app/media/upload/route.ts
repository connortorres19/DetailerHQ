import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { MAX_UPLOAD_BYTES, MEDIA_KINDS, mediaUrl } from '@/domain/branding';
import { describeDbError } from '@/data/workflow';
import { env } from '@/lib/env';
import { processImage } from '@/lib/media/process';
import { MEDIA_BUCKET, sweepMedia } from '@/lib/media/server';
import { createClient } from '@/lib/supabase/server';

// POST /app/media/upload — multipart: file, kind (logo | cover | gallery | service), serviceId?.
// A route handler (not a server action) so the browser can report upload progress.
//
// 1. The owner's session reserves a slot (public.begin_media_upload: membership, limits).
// 2. The image is decoded and re-encoded to WebP here (lib/media/process).
// 3. The owner's session stores it in the reserved slot (Storage RLS allows nothing else).
// 4. public.finish_media_upload checks the stored object and puts the image in the draft.
// Any failure after step 1 cancels the slot and deletes what was stored.

const fields = z.object({ kind: z.enum(MEDIA_KINDS), serviceId: z.uuid().optional() });

const fail = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: NextRequest) {
  // Same-origin only (the session cookie is SameSite=Lax already; this is belt and braces).
  const origin = request.headers.get('origin');
  if (!origin || (origin !== new URL(env.NEXT_PUBLIC_SITE_URL).origin && origin !== request.nextUrl.origin)) return fail(403, 'Upload refused.');
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) return fail(413, 'That image is over 10 MB. Choose a smaller one.');

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail(401, 'Your session ended. Sign in again.');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'The upload couldn’t be read. Try again.');
  }
  const file = form.get('file');
  const parsed = fields.safeParse({ kind: form.get('kind'), serviceId: form.get('serviceId') || undefined });
  if (!parsed.success || !(file instanceof File)) return fail(400, 'The upload couldn’t be read. Try again.');
  const { kind, serviceId } = parsed.data;
  if (kind === 'service' && !serviceId) return fail(400, 'Choose a service for this photo.');
  if (file.size > MAX_UPLOAD_BYTES) return fail(413, 'That image is over 10 MB. Choose a smaller one.');

  // Process first, so nothing is reserved for a file we'd refuse.
  const image = await processImage(Buffer.from(await file.arrayBuffer()), kind);
  if (!image.ok) return fail(422, image.message);

  const begin = await supabase.rpc('begin_media_upload', { p_kind: kind });
  if (begin.error || !begin.data) {
    const e = begin.error ? describeDbError(begin.error) : null;
    const message =
      begin.error?.message === 'the gallery holds up to 12 photos'
        ? 'The gallery holds up to 12 photos. Remove one first.'
        : begin.error?.details === 'limit'
          ? 'You’ve reached the image limit. Remove some images first.'
          : e?.kind === 'rate_limited'
            ? 'Too many uploads at once. Wait a moment and try again.'
            : (e?.message ?? 'The upload failed. Try again.');
    return fail(e?.kind === 'forbidden' ? 403 : 409, message);
  }
  const id = begin.data;
  const path = `${id}.webp`;

  const cancel = async () => {
    const { data: p } = await supabase.rpc('cancel_media_upload', { p_asset: id });
    if (p) await supabase.storage.from(MEDIA_BUCKET).remove([p]);
    await supabase.rpc('purge_media');
  };

  const stored = await supabase.storage.from(MEDIA_BUCKET).upload(path, image.data, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' });
  if (stored.error) {
    await cancel();
    return fail(502, 'The image couldn’t be saved. Try again.');
  }
  const finish = await supabase.rpc('finish_media_upload', { p_asset: id, p_width: image.width, p_height: image.height, p_service_id: serviceId ?? undefined });
  if (finish.error) {
    await cancel();
    return fail(409, finish.error.code === 'DH003' ? 'That service wasn’t found. Refresh and try again.' : 'The image couldn’t be saved. Try again.');
  }
  // The replaced image (if any) is no longer used by the draft or published look.
  await sweepMedia(supabase);
  return NextResponse.json({ ok: true, id, url: mediaUrl(id), width: image.width, height: image.height }, { headers: { 'Cache-Control': 'no-store' } });
}
