// Classifies database errors raised by the DetailerHQ schema and retries the ones that
// are safe to retry. Server-side only.
//
// SQLSTATEs (see supabase/migrations/20261030120200_integrity_and_scheduling.sql):
//   DH001 capacity_exceeded  DH002 invalid_state  DH003 not_found
//   DH004 invalid_input      DH005 rate_limited
//   40001 serialization_failure, 40P01 deadlock_detected — transient, safe to retry
//         because every scheduling operation is a single database function call.

const KINDS = {
  DH001: 'capacity_exceeded',
  DH002: 'invalid_state',
  DH003: 'not_found',
  DH004: 'invalid_input',
  DH005: 'rate_limited',
  40001: 'retryable',
  '40P01': 'retryable',
  42501: 'forbidden',
};

export function classifyDbError(error) {
  const code = error?.code;
  return { code, kind: KINDS[code] ?? 'unexpected' };
}

export function isRetryable(error) {
  return classifyDbError(error).kind === 'retryable';
}

// Runs `operation` and retries transient conflicts with jittered backoff. Business-rule
// errors (capacity_exceeded, invalid_state, ...) are never retried.
export async function withRetry(operation, { attempts = 3, baseDelayMs = 25 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (!isRetryable(error) || attempt >= attempts) throw error;
      const delay = baseDelayMs * 2 ** (attempt - 1) * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
