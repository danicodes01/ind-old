import { DomainError } from '../errors';
import { allocate, split } from './allocate';
import { money, sum, type Money } from './money';

const usd = (minor: number) => money(minor, 'USD');
const totalOf = (parts: Money[]) => sum(parts, 'USD').minor;

describe('split', () => {
  it('divides evenly when it can', () => {
    expect(split(usd(900), 3).map((m) => m.minor)).toEqual([300, 300, 300]);
  });

  it('gives the remainder to the earliest parts', () => {
    // The canonical case: 100 pennies three ways is 34/33/33, never 33.33 three times and
    // never 33 three times with a penny quietly lost.
    expect(split(usd(100), 3).map((m) => m.minor)).toEqual([34, 33, 33]);
  });

  it('handles a single part', () => {
    expect(split(usd(101), 1).map((m) => m.minor)).toEqual([101]);
  });

  it('handles amounts smaller than the number of parts', () => {
    expect(split(usd(2), 5).map((m) => m.minor)).toEqual([1, 1, 0, 0, 0]);
  });

  it('splits zero into zeroes', () => {
    expect(split(usd(0), 3).map((m) => m.minor)).toEqual([0, 0, 0]);
  });

  it.each([0, -1, 2.5])('rejects a part count of %p', (parts) => {
    expect(() => split(usd(100), parts)).toThrow(DomainError);
  });
});

describe('allocate', () => {
  it('distributes by weight', () => {
    // A tip-out: 70% to the server, 20% to the bar, 10% to the busser.
    expect(allocate(usd(10000), [70, 20, 10]).map((m) => m.minor)).toEqual([7000, 2000, 1000]);
  });

  it('gives leftover units to the largest remainders first', () => {
    // 10 minor units across weights 1:1:1 leaves one over after 3/3/3.
    expect(allocate(usd(10), [1, 1, 1]).map((m) => m.minor)).toEqual([4, 3, 3]);
  });

  it('breaks remainder ties by position, deterministically', () => {
    const first = allocate(usd(100), [1, 1, 1]);
    const second = allocate(usd(100), [1, 1, 1]);
    expect(first).toEqual(second);
  });

  it('supports zero weights', () => {
    expect(allocate(usd(100), [1, 0, 1]).map((m) => m.minor)).toEqual([50, 0, 50]);
  });

  it('preserves the currency', () => {
    expect(allocate(money(100, 'JPY'), [1, 1]).every((m) => m.currency === 'JPY')).toBe(true);
  });

  it.each([
    ['negative weights', [1, -1]],
    ['fractional weights', [1.5, 1]],
    ['all-zero weights', [0, 0]],
    ['no weights', []],
  ])('rejects %s', (_label, weights) => {
    expect(() => allocate(usd(100), weights)).toThrow(DomainError);
  });

  describe('negative amounts', () => {
    it('allocates a deduction the same way, with sign preserved', () => {
      expect(allocate(usd(-100), [1, 1, 1]).map((m) => m.minor)).toEqual([-34, -33, -33]);
    });

    it('still sums exactly to the original', () => {
      expect(totalOf(allocate(usd(-9999), [3, 5, 7]))).toBe(-9999);
    });
  });

  describe('the sum invariant', () => {
    // The property that matters: allocation must never lose or invent a minor unit. If this
    // ever fails, someone's tip pool does not add up to what was in it.
    const amounts = [0, 1, 2, 7, 99, 100, 101, 1000, 9999, 123456, 1_000_003];
    const weightings = [
      [1, 1],
      [1, 1, 1],
      [1, 2],
      [70, 20, 10],
      [1, 1, 1, 1, 1, 1, 1],
      [3, 5, 7, 11],
      [0, 1, 0, 1],
      [1_000, 1],
    ];

    for (const amount of amounts) {
      for (const weights of weightings) {
        it(`${amount} across [${weights.join(',')}] sums exactly`, () => {
          const parts = allocate(usd(amount), weights);
          expect(parts).toHaveLength(weights.length);
          expect(totalOf(parts)).toBe(amount);
        });
      }
    }
  });

  it('never differs between two parts by more than one minor unit at equal weight', () => {
    const parts = allocate(usd(1_000_001), new Array<number>(7).fill(1)).map((m) => m.minor);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
  });

  it('refuses to overflow the safe integer range', () => {
    expect(() => allocate(usd(Number.MAX_SAFE_INTEGER), [1_000_000, 1])).toThrow(DomainError);
  });
});
