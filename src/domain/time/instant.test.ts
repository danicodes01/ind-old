import { DomainError } from '../errors';
import {
  compareInstants,
  instant,
  instantFromDate,
  instantFromISO,
  isAfter,
  isBefore,
  toDate,
  toISO,
} from './instant';

describe('instant', () => {
  it('wraps epoch milliseconds', () => {
    expect(instant(0)).toBe(0);
    expect(instant(1_800_000_000_000)).toBe(1_800_000_000_000);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %p', (value) => {
    expect(() => instant(value)).toThrow(DomainError);
  });

  it('accepts a Date', () => {
    expect(instantFromDate(new Date('2026-06-15T02:00:00Z'))).toBe(
      Date.parse('2026-06-15T02:00:00Z'),
    );
  });

  it('rejects an invalid Date', () => {
    expect(() => instantFromDate(new Date('not a date'))).toThrow(DomainError);
  });
});

describe('instantFromISO', () => {
  it('accepts a Z-suffixed timestamp', () => {
    expect(instantFromISO('2026-03-08T04:00:00Z')).toBe(Date.parse('2026-03-08T04:00:00Z'));
  });

  it('accepts an explicit numeric offset', () => {
    expect(instantFromISO('2026-03-07T23:00:00-05:00')).toBe(
      instantFromISO('2026-03-08T04:00:00Z'),
    );
  });

  it('rejects a timestamp with no offset, rather than guessing a zone', () => {
    // Interpreting this in the device's current zone is precisely the bug this module exists
    // to prevent — the same string would mean different moments on two phones.
    expect(() => instantFromISO('2026-03-07T23:00:00')).toThrow(/no UTC offset/);
  });

  it('rejects unparseable input', () => {
    expect(() => instantFromISO('yesterday evening Z')).toThrow(DomainError);
  });
});

describe('conversion and ordering', () => {
  const earlier = instantFromISO('2026-06-15T02:00:00Z');
  const later = instantFromISO('2026-06-15T09:30:00Z');

  it('round-trips through Date and ISO', () => {
    expect(toDate(earlier).getTime()).toBe(earlier);
    expect(toISO(earlier)).toBe('2026-06-15T02:00:00.000Z');
  });

  it('orders instants', () => {
    expect(isBefore(earlier, later)).toBe(true);
    expect(isBefore(later, earlier)).toBe(false);
    expect(isAfter(later, earlier)).toBe(true);
    expect(isAfter(earlier, later)).toBe(false);
    expect(compareInstants(earlier, later)).toBe(-1);
    expect(compareInstants(later, earlier)).toBe(1);
    expect(compareInstants(earlier, earlier)).toBe(0);
  });
});
