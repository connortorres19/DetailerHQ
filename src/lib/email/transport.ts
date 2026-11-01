import 'server-only';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { emailConfig } from './config';
import { decryptCredentials, encryptCredentials, type Credentials } from './crypto';
import { accessToken, endpoints, OAuthError } from './oauth';
import { checkSmtpHost } from './smtp-guard';
import { describeSmtpError, securityFor, smtpTransportOptions } from './smtp-options';

// Sends one message through the business's own mailbox. Errors are classified for the worker:
//   auth       the provider refused the credentials → connection "needs attention", emails held
//   transient  try again later (rate limits, outages, timeouts)
//   permanent  this message can't be delivered (bad address) → failed, visible to the owner
// Messages never include credentials or tokens.

export type Connection = {
  businessId: string;
  provider: 'google' | 'microsoft' | 'smtp';
  fromAddress: string;
  fromName: string | null;
  secret: Buffer;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpSecurity?: string | null;
};
export type Message = { to: string; subject: string; html: string; text: string; headers?: Record<string, string> };
export type SendResult = { messageId: string | null };

export class SendError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'transient' | 'permanent',
  ) {
    super(message);
  }
}

export async function sendMessage(conn: Connection, msg: Message, onSecretRotated: (secret: Buffer) => Promise<void>): Promise<SendResult> {
  let creds: Credentials;
  try {
    creds = decryptCredentials(conn.businessId, conn.provider, conn.secret);
  } catch {
    throw new SendError('Stored credentials couldn’t be read. Reconnect your email.', 'auth');
  }
  try {
    if (conn.provider === 'smtp') return await sendSmtp(conn, 'password' in creds ? creds.password : '', msg);
    if (!('refreshToken' in creds)) throw new SendError('Reconnect your email.', 'auth');
    const token = await accessToken(conn.provider, conn.businessId, creds.refreshToken, async (rt) =>
      onSecretRotated(encryptCredentials(conn.businessId, conn.provider, { refreshToken: rt })),
    );
    return conn.provider === 'google' ? await sendGmail(conn, token, msg) : await sendGraph(conn, token, msg);
  } catch (e) {
    if (e instanceof SendError) throw e;
    if (e instanceof OAuthError) throw new SendError(e.message, e.kind);
    throw new SendError('Sending failed unexpectedly.', 'transient');
  }
}

const fromHeader = (c: Connection) => ({ name: c.fromName ?? '', address: c.fromAddress });

async function mime(conn: Connection, msg: Message) {
  return new MailComposer({ from: fromHeader(conn), to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers }).compile().build();
}

async function sendGmail(conn: Connection, token: string, msg: Message): Promise<SendResult> {
  const raw = (await mime(conn, msg)).toString('base64url');
  const res = await fetch(endpoints('google').send, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res) throw new SendError('Gmail didn’t respond.', 'transient');
  if (res.ok) return { messageId: ((await res.json().catch(() => ({}))) as { id?: string }).id ?? null };
  throw httpError('Gmail', res.status);
}

async function sendGraph(conn: Connection, token: string, msg: Message): Promise<SendResult> {
  const res = await fetch(endpoints('microsoft').send, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: msg.subject,
        body: { contentType: 'HTML', content: msg.html },
        toRecipients: [{ emailAddress: { address: msg.to } }],
        // Graph only accepts custom x- headers.
        internetMessageHeaders: Object.entries(msg.headers ?? {})
          .filter(([k]) => k.toLowerCase().startsWith('x-'))
          .map(([name, value]) => ({ name, value })),
      },
      saveToSentItems: true,
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res) throw new SendError('Microsoft didn’t respond.', 'transient');
  if (res.ok) return { messageId: res.headers.get('request-id') };
  throw httpError('Microsoft', res.status);
}

function httpError(who: string, status: number) {
  if (status === 401 || status === 403) return new SendError(`${who} refused the connection (${status}). Reconnect your email.`, 'auth');
  if (status === 429 || status >= 500) return new SendError(`${who} is busy (${status}); will retry.`, 'transient');
  return new SendError(`${who} rejected the message (${status}).`, 'permanent');
}

type SmtpConn = Pick<Connection, 'smtpHost' | 'smtpPort' | 'smtpUsername' | 'smtpSecurity'>;
const where = (conn: SmtpConn) => ({ host: conn.smtpHost ?? '', port: conn.smtpPort ?? 587, security: securityFor(conn.smtpPort ?? 587, conn.smtpSecurity) });

async function smtpTransport(conn: SmtpConn, password: string) {
  const c = emailConfig()!;
  const host = await checkSmtpHost(conn.smtpHost ?? '', c.allowPrivateSmtp);
  if (!host.ok) throw new SendError(host.message, 'permanent');
  const w = where(conn);
  return nodemailer.createTransport(
    smtpTransportOptions({
      address: host.address, // pinned to the checked address
      servername: w.host,
      port: w.port,
      security: w.security,
      username: conn.smtpUsername ?? '',
      password,
      // The local test mail sink only (private SMTP hosts are refused on any public site).
      loopback: c.allowPrivateSmtp && /^(127\.|::1$)/.test(host.address),
    }),
  );
}

function smtpError(e: unknown, conn: SmtpConn): SendError {
  if (e instanceof SendError) return e;
  const p = describeSmtpError(e, where(conn));
  return new SendError(p.message, p.kind);
}

/** Checks an SMTP login (connect, TLS, AUTH) without sending anything and without storing it. */
export async function checkSmtpLogin(conn: SmtpConn, password: string) {
  let transport: nodemailer.Transporter | null = null;
  try {
    transport = await smtpTransport(conn, password);
    await transport.verify();
  } catch (e) {
    throw smtpError(e, conn);
  } finally {
    transport?.close();
  }
}

async function sendSmtp(conn: Connection, password: string, msg: Message): Promise<SendResult> {
  let transport: nodemailer.Transporter | null = null;
  try {
    transport = await smtpTransport(conn, password);
    const info = await transport.sendMail({ from: fromHeader(conn), to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers });
    return { messageId: info.messageId ?? null };
  } catch (e) {
    throw smtpError(e, conn);
  } finally {
    transport?.close();
  }
}
