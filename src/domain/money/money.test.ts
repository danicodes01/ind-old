import { DomainError } from '../errors';
import { currency } from './currency';
import {
  abs,
  add,
  compare,
  equals,
  fromMajor,
  isNegative,
  isPositive,
  isZero,
  money,
  multiply,
  negate,
  roundHalfAwayFromZero,
  subtract,
  sum,
  toParts,
  zero,
} from './money';

const usd = (minor: number) => money(minor, 'USD');
const jpy = (minor: number) => money(minor, 'JPY');

describe('construction', () => {
  it('holds an integer count of minor units', () => {
    expect(usd(1234)).toEqual({ minor: 1234, currency: 'USD' });
  });

  it('rejects fractional minor units', () => {
    expect(() => usd(12.5)).toThrow(DomainError);
  });

  it('rejects unsafe integers', () => {
    expect(() => usd(Number.MAX_SAFE_INTEGER + 2)).toThrow(DomainError);
  });

  it('accepts an already-narrowed currency code', () => {
    expect(money(500, currency('EUR')).currency).toBe('EUR');
  });

  it('builds zero', () => {
    expect(zero('USD')).toEqual({ minor: 0, currency: 'USD' });
  });
});

describe('fromMajor', () => {
  it('converts major units using the currency exponent', () => {
    expect(fromMajor(12.34, 'USD').minor).toBe(1234);
    expect(fromMajor(1500, 'JPY').minor).toBe(1500);
    expect(fromMajor(1.5, 'KWD').minor).toBe(1500);
  });

  it('absorbs binary floating point representation error', () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE 754.
    expect(fromMajor(19.99, 'USD').minor).toBe(1999);
    expect(fromMajor(0.29, 'USD').minor).toBe(29);
  });

  it('rejects non-finite input', () => {
    expect(() => fromMajor(Number.NaN, 'USD')).toThrow(DomainError);
  });
});

describe('arithmetic', () => {
  it('adds and subtracts', () => {
    expect(add(usd(1000), usd(250))).toEqual(usd(1250));
    expect(subtract(usd(1000), usd(250))).toEqual(usd(750));
  });

  it('produces exact results where floating point would not', () => {
    // 0.1 + 0.2 !== 0.3 as doubles. In minor units it is exact.
    expect(add(fromMajor(0.1, 'USD'), fromMajor(0.2, 'USD'))).toEqual(usd(30));
  });

  it('refuses to mix currencies', () => {
    expect(() => add(usd(100), money(100, 'EUR'))).toThrow(/different currencies/);
    expect(() => subtract(usd(100), money(100, 'EUR'))).toThrow(/different currencies/);
    expect(() => compare(usd(100), money(100, 'EUR'))).toThrow(/different currencies/);
  });

  it('negates and takes magnitude', () => {
    expect(negate(usd(500))).toEqual(usd(-500));
    expect(negate(usd(-500))).toEqual(usd(500));
    expect(abs(usd(-500))).toEqual(usd(500));
    expect(abs(usd(500))).toEqual(usd(500));
  });

  it('sums a list in a stated currency', () => {
    expect(sum([usd(100), usd(250), usd(5)], 'USD')).toEqual(usd(355));
  });

  it('sums an empty list to zero in the stated currency', () => {
    expect(sum([], 'JPY')).toEqual(jpy(0));
  });
});

describe('multiply', () => {
  it('scales by an hourly quantity', () => {
    // 7.5 hours at $18.50/hour
    expect(multiply(usd(1850), 7.5)).toEqual(usd(13875));
  });

  it('rounds ties away from zero', () => {
    expect(multiply(usd(5), 0.5)).toEqual(usd(3)); // 2.5 -> 3
    expect(multiply(usd(-5), 0.5)).toEqual(usd(-3)); // -2.5 -> -3
  });

  it('rounds to the nearest minor unit', () => {
    expect(multiply(usd(1000), 0.3333)).toEqual(usd(333));
  });

  it('rejects non-finite factors', () => {
    expect(() => multiply(usd(100), Number.POSITIVE_INFINITY)).toThrow(DomainError);
  });
});

describe('roundHalfAwayFromZero', () => {
  it.each([
    [2.5, 3],
    [-2.5, -3],
    [2.4, 2],
    [-2.4, -2],
    [3.5, 4],
    [-3.5, -4],
    [0, 0],
  ])('rounds %p to %p', (input, expected) => {
    expect(roundHalfAwayFromZero(input)).toBe(expected);
  });

  it('rejects results outside the safe integer range', () => {
    expect(() => roundHalfAwayFromZero(Number.MAX_SAFE_INTEGER * 4)).toThrow(DomainError);
  });
});

describe('comparison', () => {
  it('orders amounts', () => {
    expect(compare(usd(100), usd(200))).toBe(-1);
    expect(compare(usd(200), usd(100))).toBe(1);
    expect(compare(usd(100), usd(100))).toBe(0);
  });

  it('treats differing currencies as unequal rather than throwing', () => {
    expect(equals(usd(100), money(100, 'EUR'))).toBe(false);
    expect(equals(usd(100), usd(100))).toBe(true);
    expect(equals(usd(100), usd(101))).toBe(false);
  });

  it('reports sign and zero', () => {
    expect(isZero(usd(0))).toBe(true);
    expect(isZero(usd(1))).toBe(false);
    expect(isNegative(usd(-1))).toBe(true);
    expect(isNegative(usd(1))).toBe(false);
    expect(isPositive(usd(1))).toBe(true);
    expect(isPositive(usd(-1))).toBe(false);
  });
});

describe('toParts', () => {
  it('splits into whole and fractional digits', () => {
    expect(toParts(usd(1234))).toEqual({
      negative: false,
      whole: '12',
      fraction: '34',
      currency: 'USD',
    });
  });

  it('pads the fraction to the currency exponent', () => {
    expect(toParts(usd(105))).toMatchObject({ whole: '1', fraction: '05' });
    expect(toParts(usd(5))).toMatchObject({ whole: '0', fraction: '05' });
  });

  it('omits the fraction for zero-exponent currencies', () => {
    expect(toParts(jpy(1500))).toMatchObject({ whole: '1500', fraction: '' });
  });

  it('handles three-decimal currencies', () => {
    expect(toParts(money(1234, 'KWD'))).toMatchObject({ whole: '1', fraction: '234' });
  });

  it('reports the sign separately from the digits', () => {
    expect(toParts(usd(-1250))).toEqual({
      negative: true,
      whole: '12',
      fraction: '50',
      currency: 'USD',
    });
  });
});
