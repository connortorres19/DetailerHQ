import 'server-only';
import { after } from 'next/server';
import { emailConfig } from './config';
import { processDue } from './worker';

// Send any emails a change just queued, after the response has gone out — the booking, quote or
// lead action never waits for email and never fails because of it. The database's minute-by-minute
// scheduler picks up anything this misses.
export function kickEmail() {
  if (!emailConfig()) return;
  try {
    after(() => processDue().then(() => undefined, () => undefined));
  } catch {
    // Outside a request (scripts, tests): the scheduler will send it.
  }
}
