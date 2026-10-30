import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/domain/auth';

const TYPES: EmailOtpType[] = ['invite', 'email', 'signup', 'recovery', 'email_change'];

// Email links land here (supabase/templates/*.html). The token hash is verified on the server,
// which sets the session cookie; then the owner continues to `next`.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNext(searchParams.get('next'), '/app');

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // A business created before the email was confirmed becomes active now (D-14).
      // No-op without a business; the database checks everything itself.
      if (type === 'email' || type === 'signup' || type === 'invite') await supabase.rpc('activate_business');
      return NextResponse.redirect(new URL(next, request.url));
    }
  }
  return NextResponse.redirect(new URL('/sign-in?error=link', request.url));
}
