import { connection } from 'next/server';

// Auth pages carry a per-request CSP nonce (src/lib/supabase/proxy.ts), so they must render
// per request: a static page's inline scripts would have no nonce and be blocked.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return children;
}
