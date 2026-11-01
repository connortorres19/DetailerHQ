import { createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { NextResponse, type NextRequest } from 'next/server';
import { emailConfig } from '@/lib/email/config';

// LOCAL DEVELOPMENT AND TESTS ONLY (EMAIL_TRANSPORT=mock on a localhost site; 404 otherwise).
// A stand-in for Google's and Microsoft's OAuth and send APIs, so the real client code (PKCE,
// token exchange, refresh, rotation, revocation, Gmail raw MIME, Graph sendMail) runs end to end
// without real accounts. Messages are delivered to the local dev mail sink (SMTP :2525).
//   /<google|microsoft>/auth      consent page (Allow / Deny, with the mailbox address)
//   /<google|microsoft>/token     authorization_code (checks PKCE) and refresh_token grants
//   /google/revoke, /microsoft/me, /<p>/send
//   /control  {"action": "revoke-all"}  — simulate the owner revoking access at the provider
// Recipients containing "+busy" get a 503 (retry), "+bounce" a 400 (permanent).

type Grant = { provider: string; email: string; challenge?: string; revoked?: boolean };
const store = globalThis as unknown as { mockOAuth?: { codes: Map<string, Grant>; refresh: Map<string, Grant>; access: Map<string, Grant> } };
const s = (store.mockOAuth ??= { codes: new Map(), refresh: new Map(), access: new Map() });

const enabled = () => Boolean(emailConfig()?.mock);
const notFound = () => new NextResponse('Not found', { status: 404 });
const sink = () => nodemailer.createTransport({ host: '127.0.0.1', port: 2525, secure: false, ignoreTLS: true });
const esc = (v: string) => v.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!enabled()) return notFound();
  const [provider, action] = (await params).path;
  const q = request.nextUrl.searchParams;
  if (action === 'auth') {
    const redirect = q.get('redirect_uri') ?? '';
    const hidden = ['redirect_uri', 'state', 'code_challenge', 'scope'].map((k) => `<input type="hidden" name="${k}" value="${esc(q.get(k) ?? '')}">`).join('');
    const html = `<!doctype html><meta charset="utf-8"><title>Mock ${esc(provider!)} sign-in</title>
<body style="font-family:sans-serif;max-width:420px;margin:40px auto">
<h1>Mock ${provider === 'google' ? 'Google' : 'Microsoft'} sign-in</h1>
<p>DetailerHQ (local test) wants to <strong>send email on your behalf</strong>.</p><p>Scopes: <code>${esc(q.get('scope') ?? '')}</code></p>
<form method="post" action="/api/dev/email-mock/${esc(provider!)}/consent">${hidden}
<label>Mailbox <input name="email" value="owner@${provider === 'google' ? 'gmail' : 'outlook'}.example.com"></label>
<p><button name="decision" value="allow">Allow</button> <button name="decision" value="deny">Deny</button></p></form>
<p><small>redirect: ${esc(redirect)}</small></p></body>`;
    return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  if (provider === 'microsoft' && action === 'me') {
    const g = s.access.get((request.headers.get('authorization') ?? '').replace('Bearer ', ''));
    if (!g || g.revoked) return NextResponse.json({ error: 'InvalidAuthenticationToken' }, { status: 401 });
    return NextResponse.json({ mail: g.email, userPrincipalName: g.email, displayName: 'Mock Owner' });
  }
  return notFound();
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!enabled()) return notFound();
  const [provider, action] = (await params).path;
  if (provider === 'control') {
    const body = (await request.json().catch(() => ({}))) as { action?: string; email?: string };
    if (body.action === 'revoke-all') {
      for (const m of [s.refresh, s.access]) for (const g of m.values()) if (!body.email || g.email === body.email) g.revoked = true;
    }
    return NextResponse.json({ ok: true });
  }
  if (action === 'consent') {
    const f = await request.formData();
    const redirect = new URL(String(f.get('redirect_uri')));
    redirect.searchParams.set('state', String(f.get('state') ?? ''));
    if (f.get('decision') !== 'allow') {
      redirect.searchParams.set('error', 'access_denied');
      return NextResponse.redirect(redirect, 303);
    }
    const code = randomBytes(16).toString('hex');
    s.codes.set(code, { provider: provider!, email: String(f.get('email')), challenge: String(f.get('code_challenge')) });
    redirect.searchParams.set('code', code);
    return NextResponse.redirect(redirect, 303);
  }
  if (action === 'token') {
    const f = new URLSearchParams(await request.text());
    let grant: Grant | undefined;
    if (f.get('grant_type') === 'authorization_code') {
      grant = s.codes.get(f.get('code') ?? '');
      s.codes.delete(f.get('code') ?? '');
      const verifier = f.get('code_verifier') ?? '';
      if (!grant || createHash('sha256').update(verifier).digest('base64url') !== grant.challenge) return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
    } else if (f.get('grant_type') === 'refresh_token') {
      grant = s.refresh.get(f.get('refresh_token') ?? '');
      if (!grant || grant.revoked) return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
    } else return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 });
    const access = randomBytes(16).toString('hex');
    const refresh = randomBytes(16).toString('hex');
    s.access.set(access, { ...grant });
    // Microsoft rotates refresh tokens; Google keeps them.
    if (provider === 'microsoft' || f.get('grant_type') === 'authorization_code') {
      s.refresh.set(refresh, { ...grant });
      if (f.get('grant_type') === 'refresh_token') s.refresh.get(f.get('refresh_token')!)!.revoked = true;
    }
    const idToken = `e30.${Buffer.from(JSON.stringify({ email: grant.email, email_verified: true, name: 'Mock Owner' })).toString('base64url')}.x`;
    return NextResponse.json({
      access_token: access,
      expires_in: 3600,
      token_type: 'Bearer',
      ...(provider === 'microsoft' || f.get('grant_type') === 'authorization_code' ? { refresh_token: refresh } : {}),
      ...(provider === 'google' ? { id_token: idToken } : {}),
    });
  }
  if (action === 'revoke') {
    const f = new URLSearchParams(await request.text());
    const g = s.refresh.get(f.get('token') ?? '');
    if (g) g.revoked = true;
    return new NextResponse(null, { status: 200 });
  }
  if (action === 'send') {
    const g = s.access.get((request.headers.get('authorization') ?? '').replace('Bearer ', ''));
    if (!g || g.revoked) return NextResponse.json({ error: { code: 'unauthenticated' } }, { status: 401 });
    const body = (await request.json()) as { raw?: string; message?: { subject: string; body: { content: string }; toRecipients: { emailAddress: { address: string } }[]; internetMessageHeaders?: { name: string; value: string }[] } };
    if (provider === 'google') {
      const raw = Buffer.from(body.raw ?? '', 'base64url').toString('utf8');
      const to = raw.match(/^To: (.+)$/im)?.[1]?.trim() ?? '';
      if (to.includes('+busy')) return NextResponse.json({ error: { code: 503 } }, { status: 503 });
      if (to.includes('+bounce')) return NextResponse.json({ error: { code: 400, message: 'Invalid To header' } }, { status: 400 });
      await sink().sendMail({ envelope: { from: g.email, to: to.replace(/^.*</, '').replace(/>.*$/, '') }, raw });
      return NextResponse.json({ id: `mock-gmail-${randomBytes(6).toString('hex')}` });
    }
    const m = body.message!;
    const to = m.toRecipients[0]!.emailAddress.address;
    if (to.includes('+busy')) return NextResponse.json({ error: { code: 'ServiceUnavailable' } }, { status: 503 });
    if (to.includes('+bounce')) return NextResponse.json({ error: { code: 'ErrorInvalidRecipients' } }, { status: 400 });
    await sink().sendMail({ from: g.email, to, subject: m.subject, html: m.body.content, headers: Object.fromEntries((m.internetMessageHeaders ?? []).map((h) => [h.name, h.value])) });
    return new NextResponse(null, { status: 202, headers: { 'request-id': `mock-graph-${randomBytes(6).toString('hex')}` } });
  }
  return notFound();
}
