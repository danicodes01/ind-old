/**
 * The error taxonomy the sync engine reasons about.
 *
 * Vendor errors — Postgres codes, HTTP statuses, network failures — are translated into these
 * at the adapter edge, so nothing above the port has to know what a `PGRST116` is. The engine
 * branches on `kind`, never on a message string. See docs/SYNC.md § Errors and retry.
 */
export type SyncErrorKind =
  /** Offline, timeout, 5xx. Retry with backoff, silently. */
  | 'transient'
  /** Expired or revoked session. Refresh once, then require a human. */
  | 'auth'
  /** Signed-in account differs from `local_account`. Stop; needs an explicit decision. */
  | 'account_mismatch'
  /** 4xx, schema mismatch, malformed payload. Stop the cycle and report. */
  | 'permanent';

export class SyncError extends Error {
  readonly kind: SyncErrorKind;

  constructor(kind: SyncErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SyncError';
    this.kind = kind;
  }

  /**
   * Whether the engine should retry on its own.
   *
   * Only transient failures are worth retrying. An auth failure needs a refresh or a human, and
   * retrying a permanent failure just burns battery against a request that will never succeed.
   */
  get retryable(): boolean {
    return this.kind === 'transient';
  }
}

export const transientError = (message: string, cause?: unknown): SyncError =>
  new SyncError('transient', message, { cause });

export const authError = (message: string, cause?: unknown): SyncError =>
  new SyncError('auth', message, { cause });

export const accountMismatchError = (message: string): SyncError =>
  new SyncError('account_mismatch', message);

export const permanentError = (message: string, cause?: unknown): SyncError =>
  new SyncError('permanent', message, { cause });

export function isSyncError(value: unknown): value is SyncError {
  return value instanceof SyncError;
}
