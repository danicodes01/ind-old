import { invariant } from '../errors';
import type { Instant } from './instant';
import { wallClockAt, type TimeZone } from './timeZone';

declare const workDateBrand: unique symbol;

/**
 * The business day a shift belongs to, as `YYYY-MM-DD`.
 *
 * This is a human judgement, not a derived value, which is why it is stored alongside the
 * timestamps rather than computed from them. A bartender clocking out at 3am universally
 * considers that the previous night's shift. Deriving it from the start instant breaks for
 * split shifts; deriving it from the end instant breaks for every overnight shift. So it is
 * defaulted (see `workDateFor`) and then owned by the user. See ADR-008.
 */
export type WorkDate = string & { readonly [workDateBrand]: true };

const WORK_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isWorkDate(value: string): boolean {
  const match = WORK_DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Round-trip through UTC to reject 2026-02-30 and friends.
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  return (
    asUtc.getUTCFullYear() === year &&
    asUtc.getUTCMonth() === month - 1 &&
    asUtc.getUTCDate() === day
  );
}

export function workDate(value: string): WorkDate {
  invariant(isWorkDate(value), `Invalid work date ${JSON.stringify(value)}; expected YYYY-MM-DD`);
  return value as WorkDate;
}

export function workDateOf(year: number, month: number, day: number): WorkDate {
  const pad = (n: number, width: number): string => String(n).padStart(width, '0');
  return workDate(`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`);
}

/**
 * Default the business day for a shift starting at `at`, resolved in the shift's own zone.
 *
 * This is only the default. `work_date` is stored and owned by the user, because the default is
 * not always right and only the person who worked it knows: clocking in at 8pm and out at 3am
 * gives Saturday, which is what a bartender would call that night, but clocking in at 12:30am
 * for the tail of the same night gives Sunday when they would say Saturday. That is a one-tap
 * correction on a screen they are already on. See ADR-008.
 */
export function workDateFor(at: Instant, zone: TimeZone): WorkDate {
  const clock = wallClockAt(at, zone);
  return workDateOf(clock.year, clock.month, clock.day);
}

/**
 * Shift a work date by whole days.
 *
 * Pure calendar arithmetic done in UTC. A work date has no time and no zone, so this is
 * unaffected by DST — which is exactly why business days are modelled as dates rather than
 * as instants.
 */
export function addDays(date: WorkDate, days: number): WorkDate {
  invariant(Number.isSafeInteger(days), `Days must be a safe integer, received ${days}`);
  const { year, month, day } = partsOf(date);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY);
  return workDateOf(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** Whole days from `a` to `b`, negative when `b` precedes `a`. */
export function daysBetween(a: WorkDate, b: WorkDate): number {
  return Math.round((utcMillis(b) - utcMillis(a)) / MS_PER_DAY);
}

export function compareWorkDates(a: WorkDate, b: WorkDate): number {
  // Zero-padded ISO dates sort correctly as strings.
  return a === b ? 0 : a < b ? -1 : 1;
}

export function partsOf(date: WorkDate): { year: number; month: number; day: number } {
  const match = WORK_DATE_PATTERN.exec(date);
  invariant(match, `Malformed work date ${JSON.stringify(date)}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Day of week, 0 = Sunday. Used for week boundaries, which are per-job configuration. */
export function dayOfWeek(date: WorkDate): number {
  return new Date(utcMillis(date)).getUTCDay();
}

function utcMillis(date: WorkDate): number {
  const { year, month, day } = partsOf(date);
  return Date.UTC(year, month - 1, day);
}
