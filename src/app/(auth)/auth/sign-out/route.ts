import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST only, so a link or prefetch can't sign the owner out. Server Actions in the app use
// `signOut` from ../../actions; this route serves plain forms.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/sign-in?signed-out=1', request.url), { status: 303 });
}
