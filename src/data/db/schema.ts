import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Columns every syncable table carries, from migration 001. See docs/DATA-MODEL.md.
 *
 * Included now rather than when sync ships because retrofitting ordering and replication
 * columns onto tables already holding real financial records is a risky migration, while
 * adding them on day one is nearly free. See ADR-005.
 *
 * Note there is no `user_id`. Identity lives once in `local_account`, never on domain rows —
 * an installation holds one account's data, and the server derives the owner from the
 * verified JWT rather than trusting the client. See ADR-016.
 */
const syncable = {
  /** UUIDv7 minted on the client. Time-ordered, so it indexes with locality. */
  id: text('id').primaryKey(),

  /** Informational only. Never used for ordering. */
  createdAt: integer('created_at').notNull(),

  /** Server-assigned epoch ms. The only ordering authority. Zero until first replicated. */
  updatedAt: integer('updated_at').notNull().default(0),

  /** Soft delete. Deletions must propagate, so rows are never hard-deleted by the app. */
  deletedAt: integer('deleted_at'),

  /** Replication state, not a dirty bit. See ADR-017. */
  syncState: text('_sync_state', { enum: ['local_only', 'synced', 'modified'] })
    .notNull()
    .default('local_only'),

  /** Server `updated_at` this device last saw. Non-null exactly when replicated. */
  baseUpdatedAt: integer('_base_updated_at'),

  /** Device clock. Orders this device's own edits only. Never trusted remotely. */
  localUpdatedAt: integer('_local_updated_at').notNull(),
};

/**
 * An employer or gig platform.
 *
 * Pay rules live here rather than in settings because two jobs routinely disagree — the week
 * boundary that overtime is measured against is a property of the employer, not the user or
 * the locale. See ADR-008.
 */
export const jobs = sqliteTable(
  'jobs',
  {
    ...syncable,

    name: text('name').notNull(),
    /** Semantic theme token key, resolved per platform. Never a raw colour here. */
    colorToken: text('color_token').notNull(),
    /** ISO 4217. Amounts on this job's shifts are denominated in it. */
    currency: text('currency').notNull(),

    /** Base hourly rate in minor units. Null for tips-only or commission work. */
    basePayMinor: integer('base_pay_minor'),

    payPeriod: text('pay_period', {
      enum: ['weekly', 'biweekly', 'semimonthly', 'monthly'],
    }).notNull(),
    /** A known period start, as YYYY-MM-DD. Biweekly periods are counted from here. */
    payPeriodAnchor: text('pay_period_anchor'),

    /** 0 = Sunday. The boundary weekly overtime is measured against. */
    weekStartsOn: integer('week_starts_on').notNull().default(0),
    /** Hour at which a new business day begins, 0-23. Commonly 4 or 5 in hospitality. */
    dayStartHour: integer('day_start_hour').notNull().default(0),

    overtimeDailyMinutes: integer('overtime_daily_minutes'),
    overtimeWeeklyMinutes: integer('overtime_weekly_minutes'),
    /**
     * Overtime multiplier in basis points — 15000 is 1.5x.
     *
     * An integer for the same reason money is: a float multiplier reintroduces exactly the
     * representation error the money layer exists to avoid. See ADR-007.
     */
    overtimeRateBasisPoints: integer('overtime_rate_basis_points'),

    isActive: integer('is_active').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [index('jobs_sync_state_idx').on(table.syncState)],
);

/**
 * One worked shift.
 *
 * The four time columns are all stored because none is derivable from the others: instants
 * answer how long it took, `work_date` answers which business day it belongs to, and `tz`
 * is what makes the wall clock renderable years later. See ADR-008.
 */
export const shifts = sqliteTable(
  'shifts',
  {
    ...syncable,

    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id),

    /** Epoch ms UTC. Durations are computed from these and never from wall-clock values. */
    startedAt: integer('started_at').notNull(),
    /** Epoch ms UTC. Null while a shift is still running. May fall on the next calendar day. */
    endedAt: integer('ended_at'),

    /** The business day, YYYY-MM-DD. A human judgement, defaulted then owned by the user. */
    workDate: text('work_date').notNull(),
    /** IANA zone at the time and place of work. Stored per shift because people travel. */
    tz: text('tz').notNull(),

    /** Unpaid break, subtracted from paid time. */
    breakMinutes: integer('break_minutes').notNull().default(0),

    /** Rate override in minor units when this shift was not paid at the job's base rate. */
    payRateMinorOverride: integer('pay_rate_minor_override'),

    note: text('note'),
  },
  (table) => [
    index('shifts_job_idx').on(table.jobId),
    index('shifts_work_date_idx').on(table.workDate),
    index('shifts_started_at_idx').on(table.startedAt),
    index('shifts_sync_state_idx').on(table.syncState),
  ],
);

/**
 * Tips recorded against a shift.
 *
 * A separate table rather than columns on `shifts` because one shift routinely produces
 * several tips of different kinds, which are taxed and reported differently and which people
 * track separately. Flattening them would force a schema change the first time someone needs
 * two.
 */
export const tipEntries = sqliteTable(
  'tip_entries',
  {
    ...syncable,

    shiftId: text('shift_id')
      .notNull()
      .references(() => shifts.id),

    kind: text('kind', { enum: ['cash', 'card', 'pooled', 'other'] }).notNull(),

    /** Integer minor units. Never a float. See ADR-007. */
    amountMinor: integer('amount_minor').notNull(),
    /** ISO 4217. Held per entry so travel and multi-country work are representable. */
    currency: text('currency').notNull(),

    note: text('note'),
  },
  (table) => [
    index('tip_entries_shift_idx').on(table.shiftId),
    index('tip_entries_sync_state_idx').on(table.syncState),
  ],
);

/**
 * The account this installation belongs to.
 *
 * One row, ever. Read only by the sync engine, which refuses to run when the signed-in
 * account does not match — two people's financial records are never silently merged.
 * Local-only: never replicated. See ADR-016.
 */
export const localAccount = sqliteTable('local_account', {
  id: integer('id').primaryKey(),
  remoteUserId: text('remote_user_id'),
  linkedAt: integer('linked_at'),
});

/** Per-table pull cursor. Keyset on `(updated_at, id)`. Local-only. See docs/SYNC.md. */
export const syncCursors = sqliteTable('sync_state', {
  tableName: text('table_name').primaryKey(),
  cursorUpdatedAt: integer('cursor_updated_at'),
  cursorId: text('cursor_id'),
  lastPulledAt: integer('last_pulled_at'),
  lastPushedAt: integer('last_pushed_at'),
});

/**
 * Versions that lost a conflict, kept verbatim.
 *
 * Exists so that resolving a conflict never destroys anything. In normal operation this table
 * stays empty; a row in it is either a genuine two-device collision or evidence of a bug, and
 * either way the data is recoverable. Local-only.
 */
export const syncConflicts = sqliteTable('sync_conflicts', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull(),
  rowId: text('row_id').notNull(),
  losingJson: text('losing_json').notNull(),
  detectedAt: integer('detected_at').notNull(),
});

/**
 * Device-level preferences and the cached entitlement.
 *
 * One row, ever. Local-only rather than syncable: these are properties of this installation,
 * and the entitlement is a cache of what the store reports, never a source of truth.
 */
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  defaultJobId: text('default_job_id').references(() => jobs.id),
  /** BCP 47 tag overriding the device locale for formatting. Null follows the device. */
  localeOverride: text('locale_override'),
  /** Cached Pro entitlement. Authoritative answer always comes from the store. */
  proEntitlementCached: integer('pro_entitlement_cached').notNull().default(0),
  proEntitlementCheckedAt: integer('pro_entitlement_checked_at'),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;
export type TipEntry = typeof tipEntries.$inferSelect;
export type NewTipEntry = typeof tipEntries.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type LocalAccount = typeof localAccount.$inferSelect;
export type SyncCursor = typeof syncCursors.$inferSelect;
export type SyncConflict = typeof syncConflicts.$inferSelect;
