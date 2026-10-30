// Types for errors.js (kept as JavaScript so the Node tests and the app share one implementation).
export type DbErrorKind =
  | 'capacity_exceeded'
  | 'invalid_state'
  | 'not_found'
  | 'invalid_input'
  | 'rate_limited'
  | 'retryable'
  | 'forbidden'
  | 'unexpected';

export function classifyDbError(error: { code?: string } | null | undefined): { code: string | undefined; kind: DbErrorKind };
export function isRetryable(error: { code?: string } | null | undefined): boolean;
export function withRetry<T>(operation: (attempt: number) => Promise<T>, options?: { attempts?: number; baseDelayMs?: number }): Promise<T>;
