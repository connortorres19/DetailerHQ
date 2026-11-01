#!/usr/bin/env node
// Checks the Google (Gmail) OAuth setup for the hidden "Sign in with Google" option — read-only,
// never prints secrets. Not needed for SMTP (the supported way to connect Gmail); kept for later.
//
//   npm run email:check-google            (configuration + a live credentials check with Google)
//   npm run email:check-google -- --offline
//
// Reads .env.local (or the environment), shows the exact redirect URI and scopes to register in
// Google Cloud Console (taken from src/lib/email/oauth.ts, the code that uses them), and asks
// Google's token endpoint to redeem a deliberately invalid code. Google's answer tells us whether
// the client ID/secret are right and the redirect URI is registered — without signing anyone in.
import { existsSync, readFileSync } from 'node:fs';

const offline = process.argv.includes('--offline');
const envFile = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const get = (name) => process.env[name] ?? envFile.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim() ?? '';

let problems = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const bad = (m, fix) => {
  problems += 1;
  console.log(`  ✗ ${m}${fix ? `\n      → ${fix}` : ''}`);
};

// The values the app actually uses (single source of truth: the code).
const oauthSource = readFileSync('src/lib/email/oauth.ts', 'utf8');
const scope = oauthSource.match(/send: mock[^\n]*gmail[^\n]*\n\s*scope: '([^']+)'/)?.[1] ?? '';
const callbackPath = oauthSource.match(/redirectUri = [^`]*`\$\{c\.siteUrl\}([^$`]+)\$\{p\}`/)?.[1];
const site = (get('NEXT_PUBLIC_SITE_URL') || 'http://localhost:3000').replace(/\/$/, '');
const redirect = `${site}${callbackPath ?? '/app/settings/notifications/callback/'}google`;

console.log('\nGoogle (Gmail) OAuth for DetailerHQ\n');
console.log('Register these in Google Cloud Console:');
console.log(`  Authorized redirect URI:  ${redirect}`);
if (site !== 'http://localhost:3000') console.log('  (Also add http://localhost:3000/app/settings/notifications/callback/google for local testing.)');
console.log(`  Scopes:                   ${scope.split(' ').join('  ·  ')}`);
console.log('  Authorized JavaScript origins: not needed (the sign-in is handled by the server).\n');

console.log('Checks:');
if (!scope.includes('https://www.googleapis.com/auth/gmail.send') || /gmail\.(readonly|modify|compose|insert)|mail\.google\.com/.test(scope))
  bad('The Gmail scope in src/lib/email/oauth.ts is not send-only.', 'Only gmail.send should be requested (no inbox access).');
else ok('Send-only scope (gmail.send): a "sensitive" scope — no paid security assessment needed');

const id = get('GOOGLE_CLIENT_ID');
const secret = get('GOOGLE_CLIENT_SECRET');
if (!id) bad('GOOGLE_CLIENT_ID is not set in .env.local', 'Add GOOGLE_CLIENT_ID=… (from Google Cloud → Credentials) to .env.local');
else if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id)) bad('GOOGLE_CLIENT_ID doesn’t look like a Google OAuth client ID', 'It ends in .apps.googleusercontent.com — copy the "Client ID", not the project ID.');
else ok(`GOOGLE_CLIENT_ID is set (…${id.slice(-34, -27)}…apps.googleusercontent.com)`);
if (!secret) bad('GOOGLE_CLIENT_SECRET is not set in .env.local', 'Add GOOGLE_CLIENT_SECRET=… to .env.local');
else if (!/^GOCSPX-[A-Za-z0-9_-]{20,}$/.test(secret)) warn('GOOGLE_CLIENT_SECRET doesn’t have the usual GOCSPX- format — check you copied the whole secret.');
else ok(`GOOGLE_CLIENT_SECRET is set (${secret.length} characters, not shown)`);

if (get('EMAIL_OAUTH_ENABLED') !== '1') warn('EMAIL_OAUTH_ENABLED=1 is not set — Google sign-in stays hidden (businesses connect Gmail with SMTP).');
if (get('EMAIL_TRANSPORT') === 'mock')
  bad('EMAIL_TRANSPORT=mock is on — "Connect Gmail" uses the local mock, not Google', 'Comment out EMAIL_TRANSPORT=mock in .env.local to use real Google sign-in.');
else ok('Real providers enabled (EMAIL_TRANSPORT is not mock)');
for (const n of ['EMAIL_WORKER_DATABASE_URL', 'EMAIL_ENCRYPTION_KEY', 'EMAIL_WORKER_SECRET'])
  if (!get(n)) bad(`${n} is not set`, 'Run: npm run env:local');
if (['EMAIL_WORKER_DATABASE_URL', 'EMAIL_ENCRYPTION_KEY', 'EMAIL_WORKER_SECRET'].every((n) => get(n))) ok('Email worker and encryption key configured');
if (site.startsWith('http://') && !/^http:\/\/localhost(:\d+)?$/.test(site))
  bad(`NEXT_PUBLIC_SITE_URL is ${site}`, 'Google only allows http:// redirect URIs for localhost; a public site must use https://.');

if (offline || !id || !secret) {
  if (!offline) console.log('\nSkipped the live check (client ID or secret missing).');
} else {
  console.log('\nLive check with Google (no one is signed in; a deliberately invalid code is used):');
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'detailerhq-setup-check', client_id: id, client_secret: secret, redirect_uri: redirect, code_verifier: 'x'.repeat(43) }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    if (body.error === 'invalid_grant') ok('Google accepted the client ID, secret and redirect URI (it only rejected the test code, as expected)');
    else if (body.error === 'invalid_client' || body.error === 'unauthorized_client') bad('Google rejected the client ID or secret', 'Re-copy both from Google Cloud → Credentials → your OAuth client.');
    else if (body.error === 'redirect_uri_mismatch') bad(`The redirect URI isn't registered: ${redirect}`, 'Add it exactly (no trailing slash) under Authorized redirect URIs and Save; changes can take a few minutes.');
    else warn(`Unexpected answer from Google: ${res.status} ${body.error ?? ''}`.trim());
  } catch {
    warn('Couldn’t reach Google from this machine (offline or blocked). Run again, or use --offline.');
  }
}

console.log(problems ? `\n${problems} problem(s) to fix. Then run: npm run email:check-google` : '\nGoogle setup looks right. With EMAIL_OAUTH_ENABLED=1: npm run dev → Settings → Notifications → Sign in with Google instead.');
process.exit(problems ? 1 : 0);
