import { isIP } from 'node:net';

// Private, loopback, link-local, carrier-grade NAT, documentation, multicast and reserved ranges —
// owners' SMTP hosts must not resolve to any of them (SSRF). Pure: unit-tested.
const PRIVATE_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const;
const v4 = (ip: string) => ip.split('.').reduce((n, p) => (n << 8) + Number(p), 0) >>> 0;

export function isPrivateAddress(ip: string) {
  if (isIP(ip) === 4) return PRIVATE_V4.some(([base, bits]) => (v4(ip) & (~0 << (32 - bits))) >>> 0 === (v4(base) & (~0 << (32 - bits))) >>> 0);
  const a = ip.toLowerCase();
  if (a.startsWith('::ffff:')) return isPrivateAddress(a.slice(7));
  return a === '::' || a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb') || a.startsWith('ff');
}

