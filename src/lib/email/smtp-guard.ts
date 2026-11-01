import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isPrivateAddress } from './net';

// Owners type in their SMTP server, so the server must not become a way to reach private networks
// (SSRF): the host has to resolve only to public addresses, on a mail submission port, with TLS.

export const SMTP_PORTS = [465, 587, 2525] as const;

/** Resolves and checks the host; returns the address to connect to (pinned: no DNS rebinding). */
export async function checkSmtpHost(host: string, allowPrivate: boolean): Promise<{ ok: true; address: string } | { ok: false; message: string }> {
  const h = host.trim().toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(h) || !h.includes('.') && h !== 'localhost') return { ok: false, message: 'Enter your mail server’s host name, like smtp.yourdomain.com.' };
  let addresses: { address: string }[];
  try {
    addresses = isIP(h) ? [{ address: h }] : await lookup(h, { all: true, verbatim: true });
  } catch {
    return { ok: false, message: `We couldn’t find ${h}. Check the server name from your email host.` };
  }
  if (!addresses.length) return { ok: false, message: `We couldn’t find ${h}.` };
  if (!allowPrivate && addresses.some((a) => isPrivateAddress(a.address))) return { ok: false, message: 'That server address isn’t allowed. Use your email host’s public SMTP server.' };
  // Prefer IPv4 when the host has both (many mail servers listen on IPv4 only).
  return { ok: true, address: (addresses.find((a) => isIP(a.address) === 4) ?? addresses[0]!).address };
}
