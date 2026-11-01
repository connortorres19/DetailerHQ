import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { emailConfig } from '@/lib/email/config';
import { processDue } from '@/lib/email/worker';

// POST /api/email/worker — called every minute by the database's scheduler (pg_cron + pg_net,
// app.email_worker_tick) with the shared secret. Sends what's due: reminders, retries, summaries.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const c = emailConfig();
  const given = Buffer.from((request.headers.get('authorization') ?? '').replace(/^Bearer /, ''));
  const expected = Buffer.from(c?.EMAIL_WORKER_SECRET ?? '');
  if (!c || given.length !== expected.length || !timingSafeEqual(given, expected)) return new NextResponse('Not found', { status: 404 });
  const started = Date.now();
  const total = { sent: 0, retried: 0, failed: 0, held: 0, skipped: 0 };
  // Keep going while there's work, within the time budget.
  for (let round = 0; round < 10 && Date.now() - started < 45_000; round += 1) {
    const r = await processDue({ limit: 25 });
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += r[k];
    if (r.sent + r.retried + r.failed + r.held + r.skipped < 25) break;
  }
  return NextResponse.json(total, { headers: { 'Cache-Control': 'no-store' } });
}
