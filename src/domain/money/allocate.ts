import { invariant } from '../errors';
import { money, type Money } from './money';

/**
 * Split an amount across integer weights, distributing the remainder by largest fractional
 * part so that **the parts always sum exactly to the original**.
 *
 * Splitting is routine in this domain — tip pools, tip-outs to the bar and bussers, a section
 * shared between two servers. Naive division loses or invents money: 100 pennies three ways
 * is 34/33/33, never 33.33 three times and never 33 three times with a penny evaporating.
 *
 * Weights are required to be non-negative integers so the arithmetic is exact. Every
 * intermediate here is an integer; no floating point is involved at any point, which is what
 * makes the sum invariant a guarantee rather than a near-certainty.
 *
 * Ties in the remainder distribution are broken by position, so the result is deterministic
 * and the same input always produces the same split.
 */
export function allocate(amount: Money, weights: readonly number[]): Money[] {
  invariant(weights.length > 0, 'Cannot allocate across zero parts');
  invariant(
    weights.every((w) => Number.isSafeInteger(w) && w >= 0),
    'Allocation weights must be non-negative integers',
  );

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  invariant(totalWeight > 0, 'Allocation weights must not all be zero');

  const sign = amount.minor < 0 ? -1 : 1;
  const magnitude = Math.abs(amount.minor);

  // Exact integer division: quotient plus a remainder numerator, per part.
  const quotients: number[] = [];
  const remainders: number[] = [];
  for (const weight of weights) {
    const numerator = magnitude * weight;
    invariant(
      Number.isSafeInteger(numerator),
      'Allocation overflowed the safe integer range; amount or weights are too large',
    );
    quotients.push(Math.floor(numerator / totalWeight));
    remainders.push(numerator % totalWeight);
  }

  const distributed = quotients.reduce((acc, q) => acc + q, 0);
  let leftover = magnitude - distributed;

  // Hand the leftover minor units to the parts with the largest remainders first, breaking
  // ties by original position.
  const order = remainders
    .map((remainder, index) => ({ remainder, index }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (const { index } of order) {
    if (leftover <= 0) break;
    quotients[index] = (quotients[index] ?? 0) + 1;
    leftover -= 1;
  }

  return quotients.map((minor) => money(sign * minor, amount.currency));
}

/** Split an amount into `parts` as evenly as possible. Remainder goes to the earliest parts. */
export function split(amount: Money, parts: number): Money[] {
  invariant(
    Number.isSafeInteger(parts) && parts > 0,
    `Cannot split into ${parts} parts; expected a positive integer`,
  );
  return allocate(amount, new Array<number>(parts).fill(1));
}
