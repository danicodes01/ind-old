/**
 * The entire remote surface of IND — two interfaces, and the types they move.
 *
 * Nothing above this file knows which vendor is behind it. Supabase is one implementation,
 * confined to `adapters/supabase/` and enforced there by ESLint. Replacing it means writing a
 * new adapter directory and changing nothing else. See ADR-010.
 *
 * No vendor type crosses this boundary. `Session` is ours, not Supabase's; vendor errors are
 * translated into `SyncError` at the adapter edge.
 */

/** Tables that replicate. Local-only tables (`local_account`, `sync_state`, …) are absent. */
export type SyncTableName = 'jobs' | 'shifts' | 'tip_entries';

export const SYNC_TABLES: readonly SyncTableName[] = ['jobs', 'shifts', 'tip_entries'];

/** Rows are pulled and pushed in pages of this size. */
export const SYNC_PAGE_SIZE = 500;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** An authenticated session. Ours — deliberately not the shape any vendor returns. */
export interface Session {
  readonly userId: string;
  readonly accessToken: string;
  /** Epoch ms, or null when the provider does not say. */
  readonly expiresAt: number | null;
}

export type Unsubscribe = () => void;

export interface AuthPort {
  getSession(): Promise<Session | null>;

  /** Fires on sign-in, sign-out, and token refresh. */
  onSessionChange(listener: (session: Session | null) => void): Unsubscribe;

  /**
   * Apple and Google only, deliberately. No email or magic-link path — see ADR-018.
   * Apple is not optional: App Store review requires it wherever another third-party
   * provider is offered.
   */
  signInWithApple(): Promise<Session>;
  signInWithGoogle(): Promise<Session>;

  signOut(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Replication
// ---------------------------------------------------------------------------

/**
 * A row in transit.
 *
 * Domain columns travel opaquely in `fields`: the transport moves rows, it does not understand
 * shifts or tips. That is what lets one adapter serve every table.
 *
 * Note the absence of `userId`. The server derives the owner from the verified JWT and rejects
 * a client-supplied one, so it is neither sent nor stored locally. See ADR-016.
 */
export interface SyncRow {
  readonly id: string;
  /** Server-assigned epoch ms. The only ordering authority. */
  readonly updatedAt: number;
  /** Soft delete. Null when live. Tombstones travel like any other change. */
  readonly deletedAt: number | null;
  readonly createdAt: number;
  readonly fields: Readonly<Record<string, unknown>>;
}

/**
 * Keyset position, on the tuple `(updatedAt, id)`.
 *
 * The `id` is not decoration: two rows can share a server timestamp, and a bare timestamp
 * high-water mark would skip whichever fell after a page boundary. See docs/SYNC.md § The cursor.
 */
export interface SyncCursor {
  readonly updatedAt: number;
  readonly id: string;
}

export interface PullRequest {
  readonly table: SyncTableName;
  /** Null starts from the beginning — a new device, or a forced full resync. */
  readonly cursor: SyncCursor | null;
  readonly limit: number;
}

export interface PullResponse {
  /** Ordered by `(updatedAt, id)`. Includes soft-deleted rows. */
  readonly rows: readonly SyncRow[];
  /** Server clock, so the client never has to trust its own for freshness. */
  readonly serverTime: number;
}

export interface PushChange {
  readonly row: SyncRow;
  /**
   * The server `updatedAt` this client last saw for the row, or null if it has never been
   * replicated — which asserts the row must not already exist on the server.
   *
   * This is the optimistic-concurrency check. It is what makes a clobber detectable, and
   * therefore what allows the losing version to be preserved rather than destroyed. See ADR-006.
   */
  readonly baseUpdatedAt: number | null;
}

export interface PushRequest {
  readonly table: SyncTableName;
  readonly changes: readonly PushChange[];
}

/**
 * Per-row outcome, keyed by id rather than by position — a transport is free to reorder, and
 * silently mis-pairing results with changes would corrupt sync state.
 */
export type PushResult =
  | { readonly id: string; readonly outcome: 'applied'; readonly row: SyncRow }
  | { readonly id: string; readonly outcome: 'conflict'; readonly server: SyncRow };

export interface PushResponse {
  readonly results: readonly PushResult[];
  readonly serverTime: number;
}

export interface SyncTransport {
  pull(request: PullRequest): Promise<PullResponse>;
  /** Idempotent: an upsert keyed by a client-minted id, safe to retry after an ambiguous failure. */
  push(request: PushRequest): Promise<PushResponse>;
}
