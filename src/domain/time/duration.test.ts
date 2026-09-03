import { DomainError } from '../errors';
import {
  ZERO_DURATION,
  addDurations,
  compareDurations,
  duration,
  durationBetween,
  durationFromHours,
  durationFromMinutes,
  subtractDurations,
  toHours,
  toMilliseconds,
  toMinutes,
} from './duration';
import { instantFromISO } from './instant';

describe('duration', () => {
  it('holds non-negative milliseconds', () => {
    expect(duration(0)).toBe(0);
    expect(toMilliseconds(duration(5000))).toBe(5000);
  });

  it.each([-1, 1.5, Number.NaN])('rejects %p', (value) => {
    expect(() => duration(value)).toThrow(DomainError);
  });

  it('converts from minutes and hours', () => {
    expect(durationFromMinutes(90)).toBe(5_400_000);
    expect(durationFromHours(7.5)).toBe(27_000_000);
  });

  it('rejects non-finite conversions', () => {
    expect(() => durationFromMinutes(Number.NaN)).toThrow(DomainError);
    expect(() => durationFromHours(Number.POSITIVE_INFINITY)).toThrow(DomainError);
  });

  it('reports fractional minutes and hours without rounding', () => {
    expect(toMinutes(durationFromHours(1.5))).toBe(90);
    expect(toHours(durationFromMinutes(90))).toBe(1.5);
    expect(toHours(durationFromMinutes(100))).toBeCloseTo(1.6666666, 6);
  });

  it('adds and subtracts', () => {
    expect(addDurations(durationFromHours(6), durationFromMinutes(30))).toBe(
      durationFromHours(6.5),
    );
    // Removing an unpaid 30 minute break.
    expect(subtractDurations(durationFromHours(8), durationFromMinutes(30))).toBe(
      durationFromHours(7.5),
    );
  });

  it('refuses to produce a negative length of time', () => {
    expect(() => subtractDurations(durationFromMinutes(10), durationFromHours(1))).toThrow(
      DomainError,
    );
  });

  it('orders durations', () => {
    expect(compareDurations(durationFromHours(1), durationFromHours(2))).toBe(-1);
    expect(compareDurations(durationFromHours(2), durationFromHours(1))).toBe(1);
    expect(compareDurations(ZERO_DURATION, duration(0))).toBe(0);
  });
});

describe('durationBetween', () => {
  it('measures an ordinary shift', () => {
    expect(
      toHours(
        durationBetween(
          instantFromISO('2026-06-15T16:00:00Z'),
          instantFromISO('2026-06-15T23:30:00Z'),
        ),
      ),
    ).toBe(7.5);
  });

  it('measures a zero-length span', () => {
    const at = instantFromISO('2026-06-15T16:00:00Z');
    expect(durationBetween(at, at)).toBe(0);
  });

  it('refuses a shift that ends before it starts', () => {
    expect(() =>
      durationBetween(
        instantFromISO('2026-06-15T23:00:00Z'),
        instantFromISO('2026-06-15T16:00:00Z'),
      ),
    ).toThrow(/cannot end before it starts/);
  });

  describe('across daylight saving transitions', () => {
    // These are the cases that make wall-clock subtraction wrong, and the reason ADR-008
    // requires durations to be computed from instants. Someone is paid for time that
    // actually elapsed, not for the difference between two clock faces.

    it('a spring-forward overnight shift is seven hours, not eight', () => {
      // 23:00 EST 7 Mar 2026 to 07:00 EDT 8 Mar 2026, America/New_York.
      // The clocks jump 02:00 -> 03:00, so an hour never happens.
      const start = instantFromISO('2026-03-08T04:00:00Z'); // 23:00 EST
      const end = instantFromISO('2026-03-08T11:00:00Z'); // 07:00 EDT
      expect(toHours(durationBetween(start, end))).toBe(7);
    });

    it('an autumn fall-back overnight shift is nine hours, not eight', () => {
      // 23:00 EDT 31 Oct 2026 to 07:00 EST 1 Nov 2026, America/New_York.
      // The clocks repeat 01:00 -> 02:00, so an hour happens twice.
      const start = instantFromISO('2026-11-01T03:00:00Z'); // 23:00 EDT
      const end = instantFromISO('2026-11-01T12:00:00Z'); // 07:00 EST
      expect(toHours(durationBetween(start, end))).toBe(9);
    });
  });
});
