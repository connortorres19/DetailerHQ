import 'server-only';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { emailConfig } from './config';
import { decryptCredentials, encryptCredentials, type Credentials } from './crypto';
import { accessToken, endpoints, OAuthError } from './oauth';
import { checkSmtpHost } from './smtp-guard';

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

async function smtpTransport(conn: Pick<Connection, 'smtpHost' | 'smtpPort' | 'smtpUsername'>, password: string) {
  const c = emailConfig()!;
  const host = await checkSmtpHost(conn.smtpHost ?? '', c.allowPrivateSmtp);
  if (!host.ok) throw new SendError(host.message, 'permanent');
  const port = conn.smtpPort ?? 587;
  const loopback = c.allowPrivateSmtp && /^(127\.|::1$)/.test(host.address);
  return nodemailer.createTransport({
    host: host.address, // pinned to the checked address
    port,
    secure: port === 465,
    requireTLS: port !== 465 && !loopback, // never send credentials in clear text (local test sink only)
    ignoreTLS: loopback,
    tls: { servername: conn.smtpHost ?? undefined, rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    auth: { user: conn.smtpUsername ?? '', pass: password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    logger: false,
    debug: false,
  });
}

function smtpError(e: unknown): SendError {
  if (e instanceof SendError) return e;
  const err = e as { code?: string; responseCode?: number };
  if (err.code === 'EAUTH' || err.responseCode === 535 || err.responseCode === 534) return new SendError('The mail server refused the login. Check the password and reconnect.', 'auth');
  if (err.responseCode && err.responseCode >= 500) return new SendError(`The mail server rejected the message (${err.responseCode}).`, 'permanent');
  if (err.responseCode && err.responseCode >= 400) return new SendError(`The mail server asked to try later (${err.responseCode}).`, 'transient');
  if (err.code === 'ETLS' || (err.code === 'ESOCKET' && /certificate|TLS|SSL/i.test(String((e as Error).message)))) return new SendError('A secure (TLS) connection to the mail server failed.', 'permanent');
  return new SendError('Couldn’t reach the mail server; will retry.', 'transient');
}

/** Checks an SMTP login (connect, TLS, AUTH) without sending anything and without storing it. */
export async function checkSmtpLogin(conn: Pick<Connection, 'smtpHost' | 'smtpPort' | 'smtpUsername'>, password: string) {
  let transport: nodemailer.Transporter | null = null;
  try {
    transport = await smtpTransport(conn, password);
    await transport.verify();
  } catch (e) {
    throw smtpError(e);
  } finally {
    transport?.close();
  }
}

async function sendSmtp(conn: Connection, password: string, msg: Message): Promise<SendResult> {
  const transport = await smtpTransport(conn, password);
  try {
    const info = await transport.sendMail({ from: fromHeader(conn), to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers });
    return { messageId: info.messageId ?? null };
  } catch (e) {
    throw smtpError(e);
  } finally {
    transport.close();
  }
}
