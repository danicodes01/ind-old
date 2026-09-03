import { DomainError } from '../errors';
import { instantFromISO } from './instant';
import { timeZone } from './timeZone';
import {
  addDays,
  compareWorkDates,
  dayOfWeek,
  daysBetween,
  isWorkDate,
  partsOf,
  workDate,
  workDateFor,
  workDateOf,
} from './workDate';

const newYork = timeZone('America/New_York');
const london = timeZone('Europe/London');

describe('workDate', () => {
  it('accepts an ISO calendar date', () => {
    expect(workDate('2026-03-08')).toBe('2026-03-08');
  });

  it.each(['2026-3-8', '08-03-2026', '2026-02-30', '2026-13-01', 'today', ''])(
    'rejects %p',
    (value) => {
      expect(() => workDate(value)).toThrow(DomainError);
      expect(isWorkDate(value)).toBe(false);
    },
  );

  it('accepts a leap day in a leap year and rejects it otherwise', () => {
    expect(isWorkDate('2028-02-29')).toBe(true);
    expect(isWorkDate('2026-02-29')).toBe(false);
  });

  it('builds from components with zero padding', () => {
    expect(workDateOf(2026, 3, 8)).toBe('2026-03-08');
    expect(workDateOf(2026, 12, 25)).toBe('2026-12-25');
  });

  it('decomposes into components', () => {
    expect(partsOf(workDate('2026-03-08'))).toEqual({ year: 2026, month: 3, day: 8 });
  });
});

describe('workDateFor', () => {
  it('uses the calendar date in the shift zone by default', () => {
    // 02:00 UTC is 22:00 the previous evening in New York, and that evening is the shift.
    expect(workDateFor(instantFromISO('2026-06-15T02:00:00Z'), newYork)).toBe('2026-06-14');
  });

  it('gives the same instant different business days in different zones', () => {
    // The whole reason the zone is stored per shift rather than per user.
    const at = instantFromISO('2026-06-15T02:00:00Z');
    expect(workDateFor(at, newYork)).toBe('2026-06-14');
    expect(workDateFor(at, london)).toBe('2026-06-15');
  });

  it('gives an evening shift the date it started, across midnight', () => {
    // Clock in 8pm Saturday, out 3am Sunday. The default is Saturday, which is the night a
    // bartender would call it.
    expect(workDateFor(instantFromISO('2026-06-14T00:00:00Z'), newYork)).toBe('2026-06-13');
  });

  it('defaults an after-midnight start to the new day — the case the user has to correct', () => {
    // Clocking in at 12:30am for the tail of Saturday night defaults to Sunday. This is the
    // known limit of the default, and why work_date is stored and editable rather than derived
    // on read. See ADR-008.
    expect(workDateFor(instantFromISO('2026-06-14T04:30:00Z'), newYork)).toBe('2026-06-14');
  });
});

describe('calendar arithmetic', () => {
  it('adds and subtracts days', () => {
    expect(addDays(workDate('2026-06-15'), 1)).toBe('2026-06-16');
    expect(addDays(workDate('2026-06-15'), -1)).toBe('2026-06-14');
    expect(addDays(workDate('2026-06-15'), 0)).toBe('2026-06-15');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays(workDate('2026-06-30'), 1)).toBe('2026-07-01');
    expect(addDays(workDate('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(workDate('2026-01-01'), -1)).toBe('2025-12-31');
    expect(addDays(workDate('2028-02-28'), 1)).toBe('2028-02-29');
  });

  it('is unaffected by daylight saving, because a business day has no zone', () => {
    // Adding a day across the spring-forward boundary is still one calendar day, even though
    // only 23 hours elapsed in New York.
    expect(addDays(workDate('2026-03-07'), 1)).toBe('2026-03-08');
    expect(addDays(workDate('2026-10-31'), 1)).toBe('2026-11-01');
  });

  it('rejects a fractional number of days', () => {
    expect(() => addDays(workDate('2026-06-15'), 1.5)).toThrow(DomainError);
  });

  it('counts days between dates, signed', () => {
    expect(daysBetween(workDate('2026-06-15'), workDate('2026-06-22'))).toBe(7);
    expect(daysBetween(workDate('2026-06-22'), workDate('2026-06-15'))).toBe(-7);
    expect(daysBetween(workDate('2026-06-15'), workDate('2026-06-15'))).toBe(0);
    expect(daysBetween(workDate('2026-03-07'), workDate('2026-03-09'))).toBe(2);
  });

  it('orders dates', () => {
    expect(compareWorkDates(workDate('2026-06-15'), workDate('2026-06-16'))).toBe(-1);
    expect(compareWorkDates(workDate('2026-06-16'), workDate('2026-06-15'))).toBe(1);
    expect(compareWorkDates(workDate('2026-06-15'), workDate('2026-06-15'))).toBe(0);
  });

  it('reports day of week, for per-job week boundaries', () => {
    // 8 March 2026 and 1 November 2026 are both Sundays.
    expect(dayOfWeek(workDate('2026-03-08'))).toBe(0);
    expect(dayOfWeek(workDate('2026-11-01'))).toBe(0);
    expect(dayOfWeek(workDate('2026-03-09'))).toBe(1);
    expect(dayOfWeek(workDate('2026-03-14'))).toBe(6);
  });
});
