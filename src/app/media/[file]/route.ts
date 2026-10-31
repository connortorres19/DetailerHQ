import { NextResponse, type NextRequest } from 'next/server';
import { isMediaFile } from '@/domain/branding';
import { MEDIA_BUCKET } from '@/lib/media/server';
import { createClient } from '@/lib/supabase/server';

// GET /media/<id>.webp — business images, same-origin (CSP img-src 'self').
// No key is held here: a signed-in owner reads with their own session (their business's images,
// including unpublished drafts); everyone else reads with the publishable key, and Storage RLS
// only lets that through for images in the published look of a public booking page. An unknown,
// private or removed image is a plain 404 either way.

const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' } });

export async function GET(_request: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!isMediaFile(file)) return notFound();

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const signedIn = Boolean(claims?.claims?.sub);
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(file);
  if (error || !data) return notFound();

  return new NextResponse(data.stream(), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(data.size),
      // Image names are never reused (a replacement is a new image), so caching is safe; public
      // copies expire quickly so a removed image disappears soon. Owners' views are never shared.
      'Cache-Control': signedIn ? 'private, no-store' : 'public, max-age=300, s-maxage=300',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
