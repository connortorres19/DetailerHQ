import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { env } from '@/lib/env';

const SIGNED_IN_ONLY = ['/app', '/onboarding', '/auth/set-password', '/auth/reset-password'];
const SIGNED_OUT_ONLY = ['/sign-in', '/sign-up', '/forgot-password'];

const matches = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // React `style` attributes need inline styles; scripts stay nonce-only.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// Refreshes the Supabase session cookie, gates signed-in/out routes, and sets the CSP and
// no-store headers for every app and auth response. Pages and actions still check access
// themselves; the proxy is the first line, not the only one.
export async function updateSession(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.assign(cacheHeaders, headers);
      },
    },
  });

  // Must run before anything else so a refreshed token is written to this response.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  let redirectTo: URL | null = null;
  if (!signedIn && matches(path, SIGNED_IN_ONLY)) {
    redirectTo = new URL('/sign-in', request.url);
    redirectTo.searchParams.set('next', path + request.nextUrl.search);
  } else if (signedIn && matches(path, SIGNED_OUT_ONLY)) {
    redirectTo = new URL('/app', request.url);
  }

  if (redirectTo) {
    const redirect = NextResponse.redirect(redirectTo);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    response = redirect;
  }

  Object.entries(cacheHeaders).forEach(([key, value]) => response.headers.set(key, value));
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Content-Security-Policy', csp);
  return response;
}
