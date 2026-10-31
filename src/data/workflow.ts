import 'server-only';
import type { PostgrestError } from '@supabase/supabase-js';
import { classifyDbError, withRetry, type DbErrorKind } from '@/db/errors.js';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

type Functions = Database['public']['Functions'];
export type WorkflowName = keyof Functions;

export type WorkflowResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: DbErrorKind; code: string | undefined; message: string; detail?: string; reason?: string };

// Owner-facing wording for each error class (PRODUCT_PLAN §6.12). Function-specific
// messages (e.g. which field) are added by the caller where it knows more.
const MESSAGES: Record<DbErrorKind, string> = {
  capacity_exceeded: 'That time is already fully booked.',
  invalid_state: 'This has changed since you opened it. Refresh and try again.',
  not_found: 'We couldn’t find that. It may have been removed.',
  invalid_input: 'Some of the details aren’t valid.',
  rate_limited: 'Too many attempts. Wait a moment and try again.',
  retryable: 'The schedule was busy. Please try again.',
  forbidden: 'You don’t have access to that.',
  unexpected: 'Something went wrong. Please try again.',
};

// `detail` is the machine-readable reason some functions attach (e.g. 'duplicate_size') and
// `reason` the function's own message (e.g. 'discount is more than the subtotal'), for callers that
// map them to wording; neither is shown to owners as-is.
export function describeDbError(error: Pick<PostgrestError, 'code' | 'message'> & { details?: string | null }) {
  const { code, kind } = classifyDbError(error);
  return { kind, code, message: MESSAGES[kind], detail: error.details ?? undefined, reason: error.message };
}

class RetryableError extends Error {
  constructor(readonly error: PostgrestError) {
    super(error.message);
  }
  get code() {
    return this.error.code;
  }
}

// Calls an owner workflow function (public.* SECURITY INVOKER wrapper → app.*_impl) as the
// signed-in owner. Deadlocks and serialization failures are retried; business-rule errors
// (DH001–DH005) are returned, never thrown. Phase 4's booking actions go through here.
export async function callWorkflow<N extends WorkflowName>(
  name: N,
  args: Functions[N]['Args'],
): Promise<WorkflowResult<Functions[N]['Returns']>> {
  const supabase = await createClient();
  try {
    const data = await withRetry(async () => {
      const { data, error } = await supabase.rpc(name, args as never);
      if (error) {
        if (classifyDbError(error).kind === 'retryable') throw new RetryableError(error);
        throw error;
      }
      return data as Functions[N]['Returns'];
    });
    return { ok: true, data };
  } catch (error) {
    const pgError = error instanceof RetryableError ? error.error : (error as PostgrestError);
    if (classifyDbError(pgError).kind === 'unexpected') console.error(`[workflow:${String(name)}]`, pgError);
    return { ok: false, ...describeDbError(pgError) };
  }
}
