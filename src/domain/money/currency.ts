import { DomainError, invariant } from '../errors';

declare const currencyBrand: unique symbol;

/** An ISO 4217 alpha-3 currency code, uppercase. */
export type CurrencyCode = string & { readonly [currencyBrand]: true };

/**
 * Currencies whose minor-unit exponent is not 2.
 *
 * Two decimal places is not universal, and hardcoding 100 anywhere in the money layer would
 * silently produce amounts that are wrong by two orders of magnitude for a Japanese or
 * Kuwaiti user. Anything absent from this table has an exponent of 2.
 *
 * Source: ISO 4217.
 */
const NON_DEFAULT_EXPONENTS: Readonly<Record<string, number>> = {
  // Zero minor units — the major unit is indivisible.
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  // Three minor units.
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  // Four minor units.
  CLF: 4,
  UYW: 4,
};

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export function isCurrencyCode(value: string): boolean {
  return CURRENCY_PATTERN.test(value);
}

/** Narrow a string to a `CurrencyCode`, throwing if it is not a well-formed ISO 4217 code. */
export function currency(value: string): CurrencyCode {
  const upper = value.toUpperCase();
  if (!isCurrencyCode(upper)) {
    throw new DomainError(`Invalid ISO 4217 currency code: ${JSON.stringify(value)}`);
  }
  return upper as CurrencyCode;
}

/** How many decimal places this currency's minor unit represents. */
export function minorUnitExponent(code: CurrencyCode): number {
  return NON_DEFAULT_EXPONENTS[code] ?? 2;
}

/** Minor units per major unit — 100 for USD, 1 for JPY, 1000 for KWD. */
export function minorUnitsPerMajor(code: CurrencyCode): number {
  return 10 ** minorUnitExponent(code);
}

export function assertSameCurrency(a: CurrencyCode, b: CurrencyCode): void {
  invariant(
    a === b,
    `Cannot combine amounts in different currencies: ${a} and ${b}. ` +
      'Cross-currency arithmetic requires an exchange rate and is not supported.',
  );
}
