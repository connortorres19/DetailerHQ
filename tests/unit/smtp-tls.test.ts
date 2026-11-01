// SMTP connection settings against real local TLS servers (simulated providers — no real accounts):
// STARTTLS, SSL/TLS, wrong password, mismatched encryption, missing STARTTLS, untrusted certificate,
// closed port; plus the provider error messages (Gmail, Microsoft 365).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';
import nodemailer from 'nodemailer';
import { describeSmtpError, securityFor, smtpTransportOptions, type SmtpSecurity } from '../../src/lib/email/smtp-options.ts';

type Mode = 'starttls' | 'ssl' | 'plain';
type Seen = { authOverTls: boolean[]; messages: string[] };
const USER = 'owner@shop.example';
const PASS = 'abcd efgh ijkl mnop';

let dir = '';
let key = '';
let cert = '';
const servers: net.Server[] = [];

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'smtp-tls-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
  key = readFileSync(join(dir, 'key.pem'), 'utf8');
  cert = readFileSync(join(dir, 'cert.pem'), 'utf8');
});
after(() => {
  for (const s of servers) s.close();
  rmSync(dir, { recursive: true, force: true });
});

/** A minimal SMTP server: 'starttls' (upgrade on request), 'ssl' (TLS from the start) or 'plain' (no TLS offered). */
async function server(mode: Mode): Promise<{ port: number; seen: Seen }> {
  const seen: Seen = { authOverTls: [], messages: [] };
  const handle = (sock: net.Socket | tls.TLSSocket, secure: boolean) => {
    let buf = '';
    let data: string | null = null;
    const say = (l: string) => sock.write(`${l}\r\n`);
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      for (;;) {
        if (data !== null) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          seen.messages.push(data + buf.slice(0, end));
          buf = buf.slice(end + 5);
          data = null;
          say('250 queued');
          continue;
        }
        const i = buf.indexOf('\r\n');
        if (i < 0) return;
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const cmd = line.split(' ')[0]!.toUpperCase();
        if (cmd === 'EHLO') {
          const caps = [mode === 'starttls' && !secure ? 'STARTTLS' : null, secure || mode === 'plain' ? 'AUTH PLAIN' : null].filter(Boolean);
          say(caps.length ? `250-test\r\n${caps.map((c, n) => `250${n === caps.length - 1 ? ' ' : '-'}${c}`).join('\r\n')}` : '250 test');
        } else if (cmd === 'STARTTLS' && mode === 'starttls' && !secure) {
          say('220 go ahead');
          sock.removeListener('data', onData);
          const up = new tls.TLSSocket(sock, { isServer: true, key, cert });
          handle(up, true);
          return;
        } else if (cmd === 'STARTTLS') {
          say('502 5.5.1 command not implemented');
        } else if (cmd === 'AUTH') {
          seen.authOverTls.push(secure);
          const [, user, pass] = Buffer.from(line.split(' ')[2] ?? '', 'base64').toString('utf8').split('\0');
          say(user === USER && pass === PASS ? '235 ok' : '535 5.7.8 Username and Password not accepted');
        } else if (cmd === 'DATA') {
          data = '';
          say('354 go');
        } else if (cmd === 'QUIT') {
          say('221 bye');
          sock.end();
        } else say('250 ok');
      }
    };
    sock.on('data', onData);
    sock.on('error', () => undefined);
  };
  const srv =
    mode === 'ssl'
      ? tls.createServer({ key, cert }, (s) => (handle(s, true), s.write('220 test ready\r\n')))
      : net.createServer((s) => (handle(s, false), s.write('220 test ready\r\n')));
  servers.push(srv);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  return { port: (srv.address() as net.AddressInfo).port, seen };
}

function transport(port: number, security: SmtpSecurity, opts: { password?: string; trusted?: boolean } = {}) {
  return nodemailer.createTransport({
    ...smtpTransportOptions({ address: '127.0.0.1', servername: 'localhost', port, security, username: USER, password: opts.password ?? PASS, ca: opts.trusted === false ? undefined : cert }),
    connectionTimeout: 2000,
    greetingTimeout: 1500,
    socketTimeout: 3000,
  });
}

async function attempt(port: number, security: SmtpSecurity, opts: { password?: string; trusted?: boolean } = {}) {
  const t = transport(port, security, opts);
  try {
    await t.verify();
    return null;
  } catch (e) {
    return describeSmtpError(e, { host: 'localhost', port, security });
  } finally {
    t.close();
  }
}

test('STARTTLS: upgrades before logging in; the password is only ever sent encrypted', async () => {
  const { port, seen } = await server('starttls');
  assert.equal(await attempt(port, 'starttls'), null);
  assert.deepEqual(seen.authOverTls, [true]);
});

test('SSL/TLS: logs in and sends a message over TLS from the first byte', async () => {
  const { port, seen } = await server('ssl');
  assert.equal(await attempt(port, 'ssl'), null);
  const t = transport(port, 'ssl');
  await t.sendMail({ from: USER, to: 'customer@example.com', subject: 'Booking confirmed', text: 'See you Tuesday' });
  t.close();
  assert.ok(seen.messages.some((m) => m.includes('Booking confirmed')));
  assert.ok(seen.authOverTls.every(Boolean));
});

test('a wrong password is an auth problem that mentions app passwords', async () => {
  const { port } = await server('starttls');
  const p = await attempt(port, 'starttls', { password: 'my-normal-password' });
  assert.equal(p?.kind, 'auth');
  assert.match(p!.message, /app password/);
  assert.ok(!p!.message.includes('my-normal-password'), 'the password never appears in messages');
});

test('SSL/TLS chosen for a STARTTLS port: clear advice to switch', async () => {
  const { port } = await server('starttls');
  const p = await attempt(port, 'ssl');
  assert.ok(p, 'fails');
  assert.match(p!.message, /SSL\/TLS|STARTTLS/);
});

test('STARTTLS chosen for an SSL/TLS port: times out with advice to try SSL/TLS', async () => {
  const { port } = await server('ssl');
  const p = await attempt(port, 'starttls');
  assert.ok(p, 'fails');
  assert.match(p!.message, /SSL\/TLS/);
});

test('a server that offers no STARTTLS never receives the password', async () => {
  const { port, seen } = await server('plain');
  const p = await attempt(port, 'starttls');
  assert.ok(p, 'refused');
  assert.equal(seen.authOverTls.length, 0, 'no login attempted without TLS');
  assert.match(p!.message, /doesn’t offer STARTTLS/);
});

test('an untrusted certificate is refused', async () => {
  const { port, seen } = await server('ssl');
  const p = await attempt(port, 'ssl', { trusted: false });
  assert.equal(p?.kind, 'permanent');
  assert.match(p!.message, /certificate/);
  assert.equal(seen.authOverTls.length, 0);
});

test('a closed port says nothing answered', async () => {
  const probe = net.createServer();
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
  const port = (probe.address() as net.AddressInfo).port;
  await new Promise((r) => probe.close(r));
  const p = await attempt(port, 'starttls');
  assert.match(p!.message, /Nothing answered/);
});

test('provider responses become plain-language messages', () => {
  const at = { host: 'smtp.office365.com', port: 587, security: 'starttls' as const };
  assert.match(describeSmtpError({ code: 'EAUTH', responseCode: 535, response: '535 5.7.139 Authentication unsuccessful, SmtpClientAuthentication is disabled for the Tenant.' }, at).message, /SMTP AUTH/);
  assert.match(describeSmtpError({ code: 'EAUTH', responseCode: 550, response: '550 5.7.30 Basic authentication is not supported for Client Submission.' }, at).message, /basic authentication/);
  const gmail = describeSmtpError({ code: 'EAUTH', responseCode: 534, response: '534-5.7.9 Application-specific password required.' }, { ...at, host: 'smtp.gmail.com' });
  assert.equal(gmail.kind, 'auth');
  assert.match(gmail.message, /app password/);
  assert.equal(describeSmtpError({ responseCode: 550, response: '550 5.1.1 No such user' }, at).kind, 'permanent');
  assert.equal(describeSmtpError({ responseCode: 451, response: '451 Try later' }, at).kind, 'transient');
});

test('encryption defaults follow the port for older connections; options never allow plain logins', () => {
  assert.equal(securityFor(465), 'ssl');
  assert.equal(securityFor(587), 'starttls');
  assert.equal(securityFor(2525, 'ssl'), 'ssl');
  const o = smtpTransportOptions({ address: '203.0.113.5', servername: 'smtp.example.com', port: 587, security: 'starttls', username: 'u', password: 'p' });
  assert.equal(o.requireTLS, true);
  assert.equal(o.ignoreTLS, false);
  assert.equal(o.tls.rejectUnauthorized, true);
  assert.equal(o.tls.minVersion, 'TLSv1.2');
  assert.equal(o.tls.servername, 'smtp.example.com', 'the certificate is checked against the typed host, not the IP');
  assert.equal(smtpTransportOptions({ address: '203.0.113.5', servername: 'x', port: 465, security: 'ssl', username: 'u', password: 'p' }).secure, true);
});
