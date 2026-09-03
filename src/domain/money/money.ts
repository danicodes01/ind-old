import { DomainError, invariant } from '../errors';
import {
  assertSameCurrency,
  currency,
  minorUnitExponent,
  minorUnitsPerMajor,
  type CurrencyCode,
} from './currency';

/**
 * A monetary amount, held as an integer count of minor units.
 *
 * There is deliberately no way to represent money as a floating-point major-unit number in
 * this codebase. `0.1 + 0.2 !== 0.3`, and that error compounds across a year of shift totals
 * whose sum may end up on someone's tax return. See ADR-007.
 */
export interface Money {
  readonly minor: number;
  readonly currency: CurrencyCode;
}

export function money(minor: number, code: CurrencyCode | string): Money {
  invariant(
    Number.isSafeInteger(minor),
    `Money must be a safe integer number of minor units, received ${minor}`,
  );
  return { minor, currency: typeof code === 'string' ? currency(code) : code };
}

export function zero(code: CurrencyCode | string): Money {
  return money(0, code);
}

/**
 * Build `Money` from a major-unit value, e.g. `fromMajor(12.34, 'USD')` → 1234 minor units.
 *
 * Convenience for tests, fixtures, and parsed user input. Rounds to the nearest minor unit,
 * because a major-unit `number` cannot be trusted to land exactly on one.
 */
export function fromMajor(major: number, code: CurrencyCode | string): Money {
  const resolved = typeof code === 'string' ? currency(code) : code;
  invariant(Number.isFinite(major), `Major amount must be finite, received ${major}`);
  return money(roundHalfAwayFromZero(major * minorUnitsPerMajor(resolved)), resolved);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a.currency, b.currency);
  return money(a.minor + b.minor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a.currency, b.currency);
  return money(a.minor - b.minor, a.currency);
}

export function negate(a: Money): Money {
  return money(-a.minor, a.currency);
}

export function abs(a: Money): Money {
  return money(Math.abs(a.minor), a.currency);
}

/**
 * Scale an amount by a factor, rounding once to the nearest minor unit.
 *
 * The factor is an ordinary number because it represents a real quantity — hours worked, a
 * percentage, a multiplier. Rounding happens exactly once, here, at the boundary back into
 * integer minor units.
 *
 * Ties round away from zero, which is what people expect of money and what most payroll
 * systems do. Rounding a fractional cent toward even would be defensible statistically and
 * surprising on a payslip.
 */
export function multiply(a: Money, factor: number): Money {
  invariant(Number.isFinite(factor), `Factor must be finite, received ${factor}`);
  return money(roundHalfAwayFromZero(a.minor * factor), a.currency);
}

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a.currency, b.currency);
  return a.minor === b.minor ? 0 : a.minor < b.minor ? -1 : 1;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.minor === b.minor;
}

export function isZero(a: Money): boolean {
  return a.minor === 0;
}

export function isNegative(a: Money): boolean {
  return a.minor < 0;
}

export function isPositive(a: Money): boolean {
  return a.minor > 0;
}

/**
 * Sum amounts that share a currency.
 *
 * `code` is required because an empty list has no currency of its own to report, and
 * returning a zero in some assumed currency would be a silent lie. Aggregation never crosses
 * currencies — mixed periods are reported per currency. See ADR-007.
 */
export function sum(amounts: readonly Money[], code: CurrencyCode | string): Money {
  return amounts.reduce<Money>((total, next) => add(total, next), zero(code));
}

/**
 * Decompose into display components. Formatting itself is locale-aware and lives in
 * `lib/format`; the domain only supplies the exact digits so no rounding happens twice.
 */
export function toParts(a: Money): {
  negative: boolean;
  whole: string;
  fraction: string;
  currency: CurrencyCode;
} {
  const exponent = minorUnitExponent(a.currency);
  const magnitude = Math.abs(a.minor);
  const per = minorUnitsPerMajor(a.currency);
  return {
    negative: a.minor < 0,
    whole: String(Math.trunc(magnitude / per)),
    fraction: exponent === 0 ? '' : String(magnitude % per).padStart(exponent, '0'),
    currency: a.currency,
  };
}

/** Round to the nearest integer, with ties going away from zero. */
export function roundHalfAwayFromZero(value: number): number {
  const rounded = value < 0 ? -Math.round(-value) : Math.round(value);
  if (!Number.isSafeInteger(rounded)) {
    throw new DomainError(`Rounding ${value} produced an unsafe integer`);
  }
  return rounded;
}
