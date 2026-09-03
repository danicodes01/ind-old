/**
 * Errors raised by the domain layer.
 *
 * These signal programmer error — a currency mismatch, a negative duration, a malformed
 * work date — not user error. Validation of user input happens before values reach the
 * domain; by the time a `Money` or an `Instant` exists, it is well-formed by construction.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new DomainError(message);
  }
}
