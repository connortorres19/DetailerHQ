import 'server-only';
import { emailConfig } from './config';
import { verify } from './crypto';
import { workerPool } from './worker';

// Only follow-up (non-essential) emails can be unsubscribed from; transactional booking and quote
// emails are never affected. The link is signed with the server key, scoped to one business,
// address and category.
export async function suppressFromToken(token: string) {
  const t = emailConfig() ? verify<{ b: string; e: string; c: string }>('unsubscribe', token) : null;
  if (!t || t.c !== 'follow_up' || !/^[0-9a-f-]{36}$/.test(t.b)) return false;
  await workerPool()!.query('select email_api.suppress($1, $2, $3)', [t.b, t.e, t.c]);
  return true;
}
