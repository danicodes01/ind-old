import { invariant } from '../errors';

declare const instantBrand: unique symbol;

/**
 * A point in time, as milliseconds since the Unix epoch, UTC.
 *
 * Branded so it cannot be confused with a duration, a Unix timestamp in seconds, or an
 * arbitrary number. An `Instant` is timezone-free and unambiguous — all ordering and all
 * duration arithmetic happens on these, never on wall-clock values. See ADR-008.
 */
export type Instant = number & { readonly [instantBrand]: true };

export function instant(epochMilliseconds: number): Instant {
  invariant(
    Number.isSafeInteger(epochMilliseconds),
    `Instant must be a safe integer of epoch milliseconds, received ${epochMilliseconds}`,
  );
  return epochMilliseconds as Instant;
}

export function instantFromDate(date: Date): Instant {
  const time = date.getTime();
  invariant(!Number.isNaN(time), 'Cannot build an Instant from an invalid Date');
  return instant(time);
}

/**
 * Parse an ISO 8601 string that carries an explicit offset or `Z`.
 *
 * A string without an offset is rejected rather than guessed at: interpreting it in the
 * device's current zone is exactly the class of bug this module exists to prevent.
 */
export function instantFromISO(iso: string): Instant {
  invariant(
    /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso),
    `Timestamp ${JSON.stringify(iso)} has no UTC offset. An instant must be unambiguous.`,
  );
  const parsed = Date.parse(iso);
  invariant(!Number.isNaN(parsed), `Could not parse timestamp ${JSON.stringify(iso)}`);
  return instant(parsed);
}

export function toDate(at: Instant): Date {
  return new Date(at);
}

export function toISO(at: Instant): string {
  return new Date(at).toISOString();
}

export function isBefore(a: Instant, b: Instant): boolean {
  return a < b;
}

export function isAfter(a: Instant, b: Instant): boolean {
  return a > b;
}

export function compareInstants(a: Instant, b: Instant): number {
  return a === b ? 0 : a < b ? -1 : 1;
}
