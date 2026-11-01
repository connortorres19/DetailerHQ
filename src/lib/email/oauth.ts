import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { emailConfig, type EmailConfig } from './config';

// Google (Gmail / Workspace) and Microsoft (Outlook / Microsoft 365) OAuth for sending only.
// Google: `gmail.send` — a "sensitive" scope (no reading mail; no CASA assessment).
// Microsoft: delegated `Mail.Send` + `offline_access`. Authorization code flow with PKCE (S256);
// the state is signed and bound to the user and business (routes in app/app/settings/notifications).
// In EMAIL_TRANSPORT=mock (local only) the same flow runs against /api/dev/email-mock.

export type OAuthProvider = 'google' | 'microsoft';

/** The signed, httpOnly cookie holding state + PKCE verifier between start and callback. */
export const OAUTH_COOKIE = 'dhq_email_oauth';

type Endpoints = { auth: string; token: string; revoke?: string; send: string; me?: string; scope: string };

export function endpoints(p: OAuthProvider, c: EmailConfig = emailConfig()!): Endpoints {
  const mock = c.mock ? `${c.siteUrl}/api/dev/email-mock/${p}` : null;
  if (p === 'google')
    return {
      auth: mock ? `${mock}/auth` : 'https://accounts.google.com/o/oauth2/v2/auth',
      token: mock ? `${mock}/token` : 'https://oauth2.googleapis.com/token',
      revoke: mock ? `${mock}/revoke` : 'https://oauth2.googleapis.com/revoke',
      send: mock ? `${mock}/send` : 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      scope: 'openid email https://www.googleapis.com/auth/gmail.send',
    };
  return {
    auth: mock ? `${mock}/auth` : 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: mock ? `${mock}/token` : 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    send: mock ? `${mock}/send` : 'https://graph.microsoft.com/v1.0/me/sendMail',
    me: mock ? `${mock}/me` : 'https://graph.microsoft.com/v1.0/me',
    scope: 'openid email offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read',
  };
}

const client = (p: OAuthProvider, c: EmailConfig) =>
  c.mock
    ? { id: 'mock-client', secret: 'mock-secret' }
    : p === 'google'
      ? { id: c.GOOGLE_CLIENT_ID!, secret: c.GOOGLE_CLIENT_SECRET! }
      : { id: c.MICROSOFT_CLIENT_ID!, secret: c.MICROSOFT_CLIENT_SECRET! };

export const redirectUri = (p: OAuthProvider, c: EmailConfig = emailConfig()!) => `${c.siteUrl}/app/settings/notifications/callback/${p}`;

export function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function authorizeUrl(p: OAuthProvider, state: string, challenge: string) {
  const c = emailConfig()!;
  const e = endpoints(p, c);
  const q = new URLSearchParams({
    client_id: client(p, c).id,
    redirect_uri: redirectUri(p, c),
    response_type: 'code',
    scope: e.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...(p === 'google' ? { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false' } : { prompt: 'select_account', response_mode: 'query' }),
  });
  return `${e.auth}?${q}`;
}

export class OAuthError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'transient' | 'permanent',
  ) {
    super(message);
  }
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; id_token?: string; scope?: string };

async function tokenRequest(p: OAuthProvider, body: Record<string, string>): Promise<TokenResponse> {
  const c = emailConfig()!;
  const { id, secret } = client(p, c);
  let res: Response;
  try {
    res = await fetch(endpoints(p, c).token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new OAuthError('The email provider didn’t respond.', 'transient');
  }
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string };
  if (!res.ok) {
    // invalid_grant: revoked, expired or password changed. Never include tokens in messages.
    if (json.error === 'invalid_grant' || res.status === 400 || res.status === 401) throw new OAuthError(`Access was revoked or expired (${json.error ?? res.status}).`, 'auth');
    throw new OAuthError(`The email provider returned ${res.status}.`, res.status >= 500 || res.status === 429 ? 'transient' : 'permanent');
  }
  return json;
}

export async function exchangeCode(p: OAuthProvider, code: string, verifier: string) {
  return tokenRequest(p, { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri(p) });
}

// Short-lived access tokens are kept in memory only (never stored, never logged).
const accessCache = new Map<string, { token: string; expires: number }>();

export async function accessToken(p: OAuthProvider, businessId: string, refreshToken: string, onRotate: (rt: string) => Promise<void>) {
  const cached = accessCache.get(`${businessId}:${p}`);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const t = await tokenRequest(p, { grant_type: 'refresh_token', refresh_token: refreshToken, ...(p === 'microsoft' ? { scope: endpoints(p).scope } : {}) });
  accessCache.set(`${businessId}:${p}`, { token: t.access_token, expires: Date.now() + (t.expires_in ?? 3000) * 1000 });
  if (t.refresh_token && t.refresh_token !== refreshToken) await onRotate(t.refresh_token); // Microsoft rotates them
  return t.access_token;
}

export const forgetAccessToken = (businessId: string) => {
  for (const k of accessCache.keys()) if (k.startsWith(`${businessId}:`)) accessCache.delete(k);
};

/** The mailbox the owner signed in with (the only address we may send from). */
export async function mailboxAddress(p: OAuthProvider, t: TokenResponse): Promise<{ address: string; name: string | null }> {
  if (p === 'google') {
    const claims = JSON.parse(Buffer.from((t.id_token ?? '').split('.')[1] ?? '', 'base64url').toString('utf8') || '{}') as { email?: string; email_verified?: boolean; name?: string };
    if (!claims.email || claims.email_verified === false) throw new OAuthError('Google didn’t share a verified email address.', 'permanent');
    return { address: claims.email.toLowerCase(), name: claims.name ?? null };
  }
  const res = await fetch(endpoints('microsoft').me!, { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new OAuthError('Microsoft didn’t share the mailbox address.', 'permanent');
  const me = (await res.json()) as { mail?: string | null; userPrincipalName?: string; displayName?: string };
  const address = (me.mail ?? me.userPrincipalName ?? '').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new OAuthError('This Microsoft account has no mailbox address.', 'permanent');
  return { address, name: me.displayName ?? null };
}

/** Best effort: Google can revoke the grant; Microsoft grants are removed in the account's app settings. */
export async function revoke(p: OAuthProvider, refreshToken: string) {
  const url = endpoints(p).revoke;
  if (!url) return;
  await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refreshToken }), signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
}
