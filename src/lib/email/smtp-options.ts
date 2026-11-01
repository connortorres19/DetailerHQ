// SMTP connection settings and error messages — pure (no server-only imports) so they can be unit
// tested against real TLS servers. Used only by ./transport (server-side).

export type SmtpSecurity = 'starttls' | 'ssl';
export const SMTP_SECURITY: readonly SmtpSecurity[] = ['starttls', 'ssl'];
export const SECURITY_LABEL: Record<SmtpSecurity, string> = { starttls: 'STARTTLS', ssl: 'SSL/TLS' };

/** The encryption to use: the owner's choice, or (older connections) the usual one for the port. */
export const securityFor = (port: number, security?: string | null): SmtpSecurity =>
  security === 'ssl' || security === 'starttls' ? security : port === 465 ? 'ssl' : 'starttls';

export type SmtpTarget = {
  /** The checked IP address to connect to (pinned: no DNS rebinding). */
  address: string;
  /** The host name the owner typed — the TLS certificate must match it. */
  servername: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  password: string;
  /** Local test mail sink only: plain connection allowed. Never true on a public site. */
  loopback?: boolean;
  /** Tests only: extra trusted certificate authority. */
  ca?: string;
};

/**
 * nodemailer options. SSL/TLS: TLS from the first byte. STARTTLS: plain greeting, then the
 * connection must upgrade to TLS before the login is sent (requireTLS) — credentials are never
 * sent unencrypted. Certificates are always verified; TLS 1.2 or newer.
 */
export function smtpTransportOptions(t: SmtpTarget) {
  const ssl = t.security === 'ssl';
  return {
    host: t.address,
    port: t.port,
    secure: ssl,
    requireTLS: !ssl && !t.loopback,
    ignoreTLS: !ssl && Boolean(t.loopback),
    tls: { servername: t.servername, rejectUnauthorized: true, minVersion: 'TLSv1.2' as const, ...(t.ca ? { ca: t.ca } : {}) },
    auth: { user: t.username, pass: t.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    logger: false,
    debug: false,
  };
}

export type SmtpProblem = { kind: 'auth' | 'transient' | 'permanent'; message: string };

/**
 * Turns a nodemailer error into a plain-language message for the owner. Never includes the
 * password (nodemailer's errors don't, and only the server's response text is inspected).
 */
export function describeSmtpError(e: unknown, where: { host: string; port: number; security: SmtpSecurity }): SmtpProblem {
  const err = (e ?? {}) as { code?: string; responseCode?: number; response?: string; message?: string };
  const text = `${err.response ?? ''} ${err.message ?? ''}`;
  const other = where.security === 'ssl' ? 'STARTTLS (usually port 587)' : 'SSL/TLS (usually port 465)';

  // Microsoft 365 / Outlook: SMTP sign-in turned off, or basic (password) sign-in no longer accepted.
  if (/5\.7\.139|SmtpClientAuthentication is disabled/i.test(text))
    return { kind: 'auth', message: 'SMTP sign-in (SMTP AUTH) is turned off for this mailbox. A Microsoft 365 administrator has to turn it on before it can connect.' };
  if (/5\.7\.30|basic authentication is (not supported|disabled)/i.test(text))
    return { kind: 'auth', message: 'This mail server no longer accepts password sign-in for SMTP (Microsoft calls this basic authentication). Ask your administrator, or use another email address.' };
  // Gmail: needs an app password.
  if (/5\.7\.9|application-specific password/i.test(text))
    return { kind: 'auth', message: 'This account needs an app password, not your normal password. Create one in your account’s security settings, then try again.' };
  if (err.code === 'EAUTH' || err.responseCode === 535 || err.responseCode === 534 || err.responseCode === 530)
    return { kind: 'auth', message: 'The mail server refused the username or password. Check them — many providers (including Gmail) need an app password instead of your normal password.' };

  if (/wrong version number|packet length too long|unknown protocol|WRONG_VERSION/i.test(text))
    return { kind: 'permanent', message: `Port ${where.port} didn’t accept an SSL/TLS connection. Try STARTTLS (usually port 587), or check the port.` };
  if (/STARTTLS/i.test(text) && /not support|unsupported|required|upgrading|not implemented|not available/i.test(text))
    return { kind: 'permanent', message: `The server on port ${where.port} doesn’t offer STARTTLS. Try SSL/TLS (usually port 465), or check the port.` };
  if (/certificate|self[- ]signed|altnames|CERT_|unable to verify/i.test(text))
    return { kind: 'permanent', message: `The server’s security certificate isn’t valid for ${where.host}. Use the exact server name your email provider gives.` };
  if (err.code === 'ETLS' || /\bTLS\b|\bSSL\b|handshake/i.test(text))
    return { kind: 'permanent', message: `A secure connection to ${where.host} couldn’t be set up. Check the encryption setting — or try ${other}.` };

  if (/ECONNREFUSED/.test(`${err.code} ${text}`))
    return { kind: 'transient', message: `Nothing answered at ${where.host} on port ${where.port}. Check the server name and port.` };
  if (/ENOTFOUND|EAI_AGAIN/.test(`${err.code} ${text}`)) return { kind: 'transient', message: `We couldn’t find ${where.host}. Check the server name.` };
  if (/ETIMEDOUT|timeout|ECONNECTION|ECONNRESET|EPIPE/i.test(`${err.code} ${text}`))
    return { kind: 'transient', message: `${where.host} didn’t answer on port ${where.port} with ${SECURITY_LABEL[where.security]}. Check the port and encryption — or try ${other}.` };

  if (err.responseCode && err.responseCode >= 500) return { kind: 'permanent', message: `The mail server rejected the message (${err.responseCode}).` };
  if (err.responseCode && err.responseCode >= 400) return { kind: 'transient', message: `The mail server asked us to try later (${err.responseCode}).` };
  return { kind: 'transient', message: 'Couldn’t reach the mail server.' };
}
