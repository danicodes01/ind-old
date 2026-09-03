import { DomainError } from '../errors';
import {
  assertSameCurrency,
  currency,
  isCurrencyCode,
  minorUnitExponent,
  minorUnitsPerMajor,
} from './currency';

describe('currency', () => {
  it('accepts and uppercases well-formed codes', () => {
    expect(currency('usd')).toBe('USD');
    expect(currency('GBP')).toBe('GBP');
  });

  it.each(['US', 'USDD', '', 'US1', 'us d'])('rejects %p', (value) => {
    expect(() => currency(value)).toThrow(DomainError);
  });

  it('reports well-formedness without throwing', () => {
    expect(isCurrencyCode('EUR')).toBe(true);
    expect(isCurrencyCode('eur')).toBe(false);
  });
});

describe('minor unit exponent', () => {
  it('defaults to two decimal places', () => {
    expect(minorUnitExponent(currency('USD'))).toBe(2);
    expect(minorUnitsPerMajor(currency('GBP'))).toBe(100);
  });

  it('handles currencies with no minor unit', () => {
    expect(minorUnitExponent(currency('JPY'))).toBe(0);
    expect(minorUnitsPerMajor(currency('KRW'))).toBe(1);
  });

  it('handles three-decimal currencies', () => {
    expect(minorUnitExponent(currency('KWD'))).toBe(3);
    expect(minorUnitsPerMajor(currency('BHD'))).toBe(1000);
  });

  it('handles four-decimal currencies', () => {
    expect(minorUnitExponent(currency('CLF'))).toBe(4);
  });
});

describe('assertSameCurrency', () => {
  it('passes for matching currencies', () => {
    expect(() => assertSameCurrency(currency('USD'), currency('USD'))).not.toThrow();
  });

  it('refuses to mix currencies', () => {
    expect(() => assertSameCurrency(currency('USD'), currency('EUR'))).toThrow(
      /different currencies/,
    );
  });
});
