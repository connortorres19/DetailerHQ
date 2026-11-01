import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getBusiness, getUser } from '@/data/session';
import { emailConfig, providerConfigured } from '@/lib/email/config';
import { byteaHex, encryptCredentials, verify } from '@/lib/email/crypto';
import { exchangeCode, forgetAccessToken, mailboxAddress, OAUTH_COOKIE, OAuthError, type OAuthProvider } from '@/lib/email/oauth';
import { processDue } from '@/lib/email/worker';
import { createClient } from '@/lib/supabase/server';

// GET /app/settings/notifications/callback/<google|microsoft> — the provider sends the owner back.
// Accepted only with the signed cookie from the start route: same state (CSRF), same provider, same
// signed-in user and business, not expired; the code is exchanged with the PKCE verifier. The
// refresh token is encrypted before it's stored; then a test email verifies the connection.
type State = { state: string; verifier: string; provider: string; uid: string; bid: string; exp: number };

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const back = new URL('/app/settings/notifications', request.nextUrl.origin);
  const done = (result: string) => {
    back.searchParams.set('email', result);
    const res = NextResponse.redirect(back);
    res.cookies.set(OAUTH_COOKIE, '', { path: '/app/settings/notifications', maxAge: 0 });
    return res;
  };
  const q = request.nextUrl.searchParams;
  const saved = verify<State>('oauth', request.cookies.get(OAUTH_COOKIE)?.value);
  const given = Buffer.from(q.get('state') ?? '');
  const [user, business] = await Promise.all([getUser(), getBusiness()]);
  if (
    !emailConfig() ||
    (provider !== 'google' && provider !== 'microsoft') ||
    !providerConfigured(provider) || // OAuth sign-in is off unless EMAIL_OAUTH_ENABLED=1
    !saved ||
    saved.exp < Date.now() ||
    saved.provider !== provider ||
    given.length !== Buffer.from(saved.state).length ||
    !timingSafeEqual(given, Buffer.from(saved.state)) ||
    !user ||
    !business ||
    saved.uid !== user.id ||
    saved.bid !== business.id
  )
    return done('invalid_state');
  if (q.get('error')) return done(q.get('error') === 'access_denied' ? 'denied' : 'provider_error');
  const code = q.get('code');
  if (!code) return done('provider_error');

  try {
    const p = provider as OAuthProvider;
    const tokens = await exchangeCode(p, code, saved.verifier);
    if (!tokens.refresh_token) return done('no_offline_access');
    const mailbox = await mailboxAddress(p, tokens);
    const supabase = await createClient();
    forgetAccessToken(business.id); // a token cached for the previous connection must never be reused
    const secret = encryptCredentials(business.id, p, { refreshToken: tokens.refresh_token });
    const { error } = await supabase.rpc('save_email_connection', { p_provider: p, p_from: mailbox.address, p_from_name: business.name, p_secret: byteaHex(secret) });
    if (error) return done('save_failed');
    // Verify: a real test email through the new connection, to the owner.
    const test = await supabase.rpc('queue_test_email');
    if (test.error || !test.data) return done('test_failed');
    await processDue({ only: test.data });
    const { data } = await supabase.from('email_connections').select('status').single();
    return done(data?.status === 'verified' ? 'connected' : 'test_failed');
  } catch (e) {
    return done(e instanceof OAuthError && e.kind === 'auth' ? 'denied' : 'provider_error');
  }
}
