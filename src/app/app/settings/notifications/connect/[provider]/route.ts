import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getBusiness, getUser } from '@/data/session';
import { emailConfig, providerConfigured } from '@/lib/email/config';
import { sign } from '@/lib/email/crypto';
import { authorizeUrl, OAUTH_COOKIE, pkce, type OAuthProvider } from '@/lib/email/oauth';

// GET /app/settings/notifications/connect/<google|microsoft> — starts OAuth. The state, PKCE
// verifier, user and business go into a short-lived, signed, httpOnly cookie that the callback
// checks; the provider only ever sees the random state and the PKCE challenge.

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const back = new URL('/app/settings/notifications', request.nextUrl.origin);
  if (provider !== 'google' && provider !== 'microsoft') return NextResponse.redirect(back);
  const [user, business] = await Promise.all([getUser(), getBusiness()]);
  if (!user || !business) return NextResponse.redirect(new URL('/sign-in?next=/app/settings/notifications', request.nextUrl.origin));
  if (!providerConfigured(provider)) {
    back.searchParams.set('email', 'not_configured');
    return NextResponse.redirect(back);
  }
  const state = randomBytes(24).toString('base64url');
  const { verifier, challenge } = pkce();
  const res = NextResponse.redirect(authorizeUrl(provider as OAuthProvider, state, challenge));
  res.cookies.set(OAUTH_COOKIE, sign('oauth', { state, verifier, provider, uid: user.id, bid: business.id, exp: Date.now() + 10 * 60_000 }), {
    httpOnly: true,
    secure: emailConfig()!.siteUrl.startsWith('https://'),
    sameSite: 'lax', // sent on the provider's top-level redirect back
    path: '/app/settings/notifications',
    maxAge: 600,
  });
  return res;
}
