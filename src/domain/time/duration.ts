import { invariant } from '../errors';
import type { Instant } from './instant';

declare const durationBrand: unique symbol;

/** An elapsed length of time in milliseconds. Never negative. */
export type Duration = number & { readonly [durationBrand]: true };

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

export function duration(milliseconds: number): Duration {
  invariant(
    Number.isSafeInteger(milliseconds) && milliseconds >= 0,
    `Duration must be a non-negative safe integer of milliseconds, received ${milliseconds}`,
  );
  return milliseconds as Duration;
}

/**
 * Elapsed time between two instants.
 *
 * This is the **only** correct way to measure how long a shift lasted, and the reason
 * wall-clock subtraction is forbidden. A shift running 23:00 → 07:00 across a spring-forward
 * boundary is seven hours, not eight; across the autumn boundary it is nine. People are paid
 * for time that actually elapsed. See ADR-008.
 */
export function durationBetween(start: Instant, end: Instant): Duration {
  invariant(end >= start, 'A shift cannot end before it starts');
  return duration(end - start);
}

export function durationFromMinutes(minutes: number): Duration {
  invariant(Number.isFinite(minutes), `Minutes must be finite, received ${minutes}`);
  return duration(Math.round(minutes * MS_PER_MINUTE));
}

export function durationFromHours(hours: number): Duration {
  invariant(Number.isFinite(hours), `Hours must be finite, received ${hours}`);
  return duration(Math.round(hours * MS_PER_HOUR));
}

export function toMilliseconds(value: Duration): number {
  return value;
}

/** Fractional minutes. Not rounded — rounding is the caller's decision. */
export function toMinutes(value: Duration): number {
  return value / MS_PER_MINUTE;
}

/**
 * Fractional hours, for multiplying against an hourly rate.
 *
 * Deliberately not rounded. Rounding happens once, in `money.multiply`, when the result
 * returns to integer minor units — rounding hours first and money second would round twice.
 */
export function toHours(value: Duration): number {
  return value / MS_PER_HOUR;
}

export function addDurations(a: Duration, b: Duration): Duration {
  return duration(a + b);
}

/** Subtract `b` from `a`, e.g. removing an unpaid break. Throws if the result is negative. */
export function subtractDurations(a: Duration, b: Duration): Duration {
  invariant(a >= b, 'Subtracting this duration would produce a negative length of time');
  return duration(a - b);
}

export function compareDurations(a: Duration, b: Duration): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

export const ZERO_DURATION = 0 as Duration;
