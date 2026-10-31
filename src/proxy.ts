import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// The app, auth and public booking routes (CSP nonce + no-store; the booking preview needs the
// owner's session). The marketing site stays static and session-free.
export const config = {
  matcher: [
    '/app/:path*',
    '/book/:path*',
    '/r/:path*',
    '/q/:path*',
    '/onboarding/:path*',
    '/sign-in',
    '/sign-up',
    '/forgot-password',
    '/auth/:path*',
  ],
};
