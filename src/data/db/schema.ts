import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Columns every syncable table carries. See docs/DATA-MODEL.md.
 *
 * Present from the first migration. Sync ships in the initial product for Pro, so they are in
 * use immediately; for free users they sit at `local_only` and stay there. Either way,
 * retrofitting ordering and replication columns onto tables already holding real financial
 * records would be a risky migration for no reason. See ADR-005.
 *
 * Note there is no `user_id`. Identity lives once in `local_account`, never on domain rows —
 * an installation holds one account's data, and the server derives the owner from the verified
 * JWT rather than trusting the client. See ADR-016.
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
 * An employer or gig platform. Created with three things: name, hourly rate, colour.
 *
 * There is deliberately no pay-period, overtime, or business-day configuration here. IND records
 * what someone worked and made; it does not model what an employer owes. Wage earnings are
 * worked time × the rate, which understates for anyone genuinely earning overtime — accepted,
 * because a figure that disagrees with a real pay stub is worse than a simple one. See ADR-024.
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

    /**
     * Tax setup, both nullable where null means **not answered**.
     *
     * Two factual questions — "does this job take taxes out of your pay?" and "are your tips
     * already included in what's taken out?" — whose answers decide which earnings are included
     * in the set-aside calculation. IND makes no determination about anyone's legal tax status,
     * and a job with either field unanswered is excluded and surfaced as needing setup.
     */
    withholdsTax: integer('withholds_tax'),
    tipsCovered: integer('tips_covered'),

    isActive: integer('is_active').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [index('jobs_sync_state_idx').on(table.syncState)],
);

/**
 * One shift, scheduled or worked.
 *
 * Scheduling is a Pro feature; the free tier only ever creates rows with `status = 'worked'`.
 *
 * Scheduled times always describe the plan and actual times always describe what happened —
 * neither pair is ever overloaded to stand in for the other. That also makes a class of bug
 * structurally impossible: an earnings query that forgets to filter on `status` finds no actual
 * times on a scheduled shift, so there is nothing to miscount as income. See ADR-008.
 */
export const shifts = sqliteTable(
  'shifts',
  {
    ...syncable,

    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id),

    status: text('status', { enum: ['scheduled', 'worked', 'cancelled'] })
      .notNull()
      .default('worked'),

    /** The plan. Set when a shift is scheduled, never overwritten by what happened. */
    scheduledStartAt: integer('scheduled_start_at'),
    scheduledEndAt: integer('scheduled_end_at'),

    /** What happened. Epoch ms UTC. Null until worked; end is null while in progress. */
    startedAt: integer('started_at'),
    endedAt: integer('ended_at'),

    /** Links instances materialised from one recurrence pattern. See ADR-025. */
    seriesId: text('series_id'),

    /** Business day, YYYY-MM-DD. Defaulted from where the shift starts, then owned by the user. */
    workDate: text('work_date').notNull(),
    /** IANA zone at the time and place of work. Stored per shift because people travel. */
    tz: text('tz').notNull(),

    /** Unpaid break, subtracted from paid time. */
    breakMinutes: integer('break_minutes').notNull().default(0),

    /**
     * The hourly rate for this shift, when it differs from the job's — a training rate, a
     * holiday rate, a different position covered for one night.
     *
     * An hourly rate, not a total: explicitly not an override of calculated wages, and not an
     * overtime or payroll mechanism.
     */
    payRateMinorOverride: integer('pay_rate_minor_override'),

    /** Tips in minor units, in the job's currency. */
    tipsCashMinor: integer('tips_cash_minor').notNull().default(0),
    tipsCardMinor: integer('tips_card_minor').notNull().default(0),
    tipsOtherMinor: integer('tips_other_minor').notNull().default(0),
    /** What was paid out to bar, bussers, kitchen. Subtract to get what was kept. */
    tipOutMinor: integer('tip_out_minor').notNull().default(0),

    /** The shift journal. Free text, read back across shifts by the Pro journal view. */
    note: text('note'),
    /** Optional 1–5 marker recorded beside the note. */
    feeling: integer('feeling'),

    /**
     * Link to an event in this device's Apple or Google calendar.
     *
     * **Local-only and never synced.** EventKit identifiers are scoped to a single device's
     * calendar store, so replicating them would cause silent mismatches and duplicate imports.
     * See ADR-025.
     */
    externalEventId: text('_external_event_id'),
    externalCalendar: text('_external_calendar'),
  },
  (table) => [
    /**
     * A shift must have a plan, an actual, or both. Satisfied by every valid state: scheduled
     * (plan only), worked (actual only), scheduled-then-worked (both), and cancelled (plan
     * retained). Only a row with neither is rejected.
     *
     * The tighter per-status rules live in the repository, where they are readable.
     */
    check(
      'shifts_has_a_time',
      sql`${table.scheduledStartAt} IS NOT NULL OR ${table.startedAt} IS NOT NULL`,
    ),
    index('shifts_job_idx').on(table.jobId),
    index('shifts_work_date_idx').on(table.workDate),
    index('shifts_status_idx').on(table.status),
    index('shifts_started_at_idx').on(table.startedAt),
    index('shifts_series_idx').on(table.seriesId),
    index('shifts_sync_state_idx').on(table.syncState),
  ],
);

/**
 * Simple work-expense tracking. Not bookkeeping.
 */
export const expenses = sqliteTable(
  'expenses',
  {
    ...syncable,

    /** YYYY-MM-DD. An expense is a calendar-day concept, not an instant. */
    date: text('date').notNull(),

    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),

    category: text('category'),
    /** Not every expense belongs to one job. */
    jobId: text('job_id').references(() => jobs.id),
    note: text('note'),
  },
  (table) => [
    index('expenses_date_idx').on(table.date),
    index('expenses_job_idx').on(table.jobId),
    index('expenses_sync_state_idx').on(table.syncState),
  ],
);

/**
 * The account this installation belongs to.
 *
 * One row, ever. Read only by the sync engine, which refuses to run when the signed-in account
 * does not match — two people's financial records are never merged, and there is no adoption
 * path. Local-only: never replicated. See ADR-016.
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
 * Exists so resolving a conflict never destroys anything. In normal operation this stays empty;
 * a row in it is either a genuine two-device collision or evidence of a bug, and either way the
 * data is recoverable. Local-only.
 */
export const syncConflicts = sqliteTable('sync_conflicts', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull(),
  rowId: text('row_id').notNull(),
  losingJson: text('losing_json').notNull(),
  detectedAt: integer('detected_at').notNull(),
});

/**
 * Device preferences and the tax configuration. One row, ever. Local-only.
 */
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  defaultJobId: text('default_job_id').references(() => jobs.id),
  /** BCP 47 tag overriding the device locale for formatting. Null follows the device. */
  localeOverride: text('locale_override'),

  /**
   * Which day a week begins on, 0 = Sunday. App-wide rather than per job: weekly totals span
   * every job, and three jobs with three week boundaries cannot be summed into "this week".
   */
  weekStartsOn: integer('week_starts_on').notNull().default(0),

  /**
   * Tax set-aside. The entire calculation is included earnings × `set_aside_percent_bp`.
   *
   * The percentage ships empty and is the user's own choice — IND explains what the setting does
   * and does not suggest a number. There is no self-employment constant, no brackets, no
   * deductions, and no liability or refund calculation anywhere. See ADR-024.
   */
  taxEnabled: integer('tax_enabled').notNull().default(0),
  setAsidePercentBp: integer('set_aside_percent_bp'),
  taxRemindersEnabled: integer('tax_reminders_enabled').notNull().default(0),

  /** Cached Pro entitlement. The authoritative answer always comes from the store. See ADR-021. */
  proEntitlementCached: integer('pro_entitlement_cached').notNull().default(0),
  proEntitlementCheckedAt: integer('pro_entitlement_checked_at'),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type LocalAccount = typeof localAccount.$inferSelect;
export type SyncCursor = typeof syncCursors.$inferSelect;
export type SyncConflict = typeof syncConflicts.$inferSelect;
