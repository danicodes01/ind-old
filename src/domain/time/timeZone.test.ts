import { DomainError } from '../errors';
import { instantFromISO } from './instant';
import { deviceTimeZone, isTimeZone, timeZone, wallClockAt } from './timeZone';

describe('timeZone', () => {
  it('accepts IANA identifiers', () => {
    expect(timeZone('America/New_York')).toBe('America/New_York');
    expect(timeZone('Europe/London')).toBe('Europe/London');
    expect(timeZone('UTC')).toBe('UTC');
  });

  it('rejects anything the platform does not recognise', () => {
    expect(() => timeZone('Mars/Olympus_Mons')).toThrow(DomainError);
    expect(() => timeZone('EST5EDT_nonsense')).toThrow(/Unknown IANA time zone/);
  });

  it('reports validity without throwing', () => {
    expect(isTimeZone('Asia/Tokyo')).toBe(true);
    expect(isTimeZone('Nowhere/Anywhere')).toBe(false);
  });

  it('resolves the device zone', () => {
    expect(isTimeZone(deviceTimeZone())).toBe(true);
  });
});

describe('wallClockAt', () => {
  const newYork = timeZone('America/New_York');
  const tokyo = timeZone('Asia/Tokyo');

  it('renders an instant in a zone', () => {
    expect(wallClockAt(instantFromISO('2026-06-15T16:30:45Z'), newYork)).toEqual({
      year: 2026,
      month: 6,
      day: 15,
      hour: 12,
      minute: 30,
      second: 45,
    });
  });

  it('rolls the calendar date backwards where the offset requires it', () => {
    // 02:00 UTC is still the previous evening in New York.
    expect(wallClockAt(instantFromISO('2026-06-15T02:00:00Z'), newYork)).toMatchObject({
      day: 14,
      hour: 22,
    });
  });

  it('rolls the calendar date forwards where the offset requires it', () => {
    expect(wallClockAt(instantFromISO('2026-06-14T22:00:00Z'), tokyo)).toMatchObject({
      day: 15,
      hour: 7,
    });
  });

  it('uses a 24 hour clock, so midnight is hour zero', () => {
    expect(wallClockAt(instantFromISO('2026-06-15T04:00:00Z'), newYork)).toMatchObject({
      hour: 0,
    });
  });

  it('applies the offset in force at that moment, not the current one', () => {
    // Standard time in January, daylight time in July — same zone, different offsets.
    expect(wallClockAt(instantFromISO('2026-01-15T17:00:00Z'), newYork)).toMatchObject({
      hour: 12,
    });
    expect(wallClockAt(instantFromISO('2026-07-15T16:00:00Z'), newYork)).toMatchObject({
      hour: 12,
    });
  });
});
