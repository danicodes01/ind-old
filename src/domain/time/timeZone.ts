import { DomainError } from '../errors';
import type { Instant } from './instant';

declare const timeZoneBrand: unique symbol;

/** An IANA time zone identifier, e.g. `America/New_York`. */
export type TimeZone = string & { readonly [timeZoneBrand]: true };

/**
 * Wall-clock components of an instant, as seen in a particular zone.
 *
 * Used for display and for deciding which business day a shift belongs to. Never for
 * measuring elapsed time.
 */
export interface WallClock {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
  readonly hour: number; // 0-23
  readonly minute: number;
  readonly second: number;
}

/**
 * `Intl.DateTimeFormat` construction is expensive and these are immutable, so instances are
 * reused. Zones per user are few — usually one.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(zone);
  if (cached) return cached;

  const created = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  formatterCache.set(zone, created);
  return created;
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Narrow a string to a `TimeZone`.
 *
 * Zones are stored per shift rather than per user because people travel and relocate, and
 * the identifier is stored rather than the offset because offsets change with DST and with
 * legislation while identifiers do not. See ADR-008.
 */
export function timeZone(value: string): TimeZone {
  if (!isTimeZone(value)) {
    throw new DomainError(`Unknown IANA time zone: ${JSON.stringify(value)}`);
  }
  return value as TimeZone;
}

/** The device's current zone, for defaulting a new shift. */
export function deviceTimeZone(): TimeZone {
  return timeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function wallClockAt(at: Instant, zone: TimeZone): WallClock {
  const parts = formatterFor(zone).formatToParts(new Date(at));
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  const read = (key: string): number => {
    const raw = values[key];
    if (raw === undefined) {
      throw new DomainError(`Time zone ${zone} produced no ${key} component`);
    }
    return Number(raw);
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}
