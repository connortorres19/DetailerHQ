import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Only the app and auth routes. The marketing site stays static and session-free.
export const config = {
  matcher: [
    '/app/:path*',
    '/onboarding/:path*',
    '/sign-in',
    '/sign-up',
    '/forgot-password',
    '/auth/:path*',
  ],
};
