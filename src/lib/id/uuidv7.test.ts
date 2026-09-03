import { RANDOM_BYTES_REQUIRED, formatUuidV7, timestampOfUuidV7 } from './uuidv7';

const zeros = new Uint8Array(RANDOM_BYTES_REQUIRED);
const ones = new Uint8Array(RANDOM_BYTES_REQUIRED).fill(0xff);

describe('formatUuidV7', () => {
  it('produces a canonically formatted UUID', () => {
    expect(formatUuidV7(0, zeros)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('sets the version nibble to 7', () => {
    expect(formatUuidV7(Date.parse('2026-06-15T00:00:00Z'), ones).charAt(14)).toBe('7');
  });

  it('sets the RFC 9562 variant bits', () => {
    // The variant nibble is 8, 9, a or b.
    expect(formatUuidV7(Date.parse('2026-06-15T00:00:00Z'), ones).charAt(19)).toMatch(/[89ab]/);
    expect(formatUuidV7(Date.parse('2026-06-15T00:00:00Z'), zeros).charAt(19)).toBe('8');
  });

  it('encodes the timestamp in the leading 48 bits', () => {
    const at = Date.parse('2026-06-15T12:34:56.789Z');
    expect(timestampOfUuidV7(formatUuidV7(at, zeros))).toBe(at);
  });

  it('sorts lexicographically in creation order', () => {
    // The property that earns v7 over v4: ids created later sort later, so they append to an
    // index rather than scattering through it.
    const ids = [
      formatUuidV7(Date.parse('2026-01-01T00:00:00Z'), ones),
      formatUuidV7(Date.parse('2026-06-15T00:00:00Z'), zeros),
      formatUuidV7(Date.parse('2027-01-01T00:00:00Z'), ones),
    ];
    expect([...ids].sort()).toEqual(ids);
  });

  it('varies with the random input at the same millisecond', () => {
    const at = Date.parse('2026-06-15T00:00:00Z');
    expect(formatUuidV7(at, zeros)).not.toBe(formatUuidV7(at, ones));
  });

  it.each([-1, 1.5, 2 ** 48])('rejects a timestamp of %p', (value) => {
    expect(() => formatUuidV7(value, zeros)).toThrow(RangeError);
  });

  it('rejects insufficient randomness', () => {
    expect(() => formatUuidV7(0, new Uint8Array(4))).toThrow(RangeError);
  });
});

describe('timestampOfUuidV7', () => {
  it('rejects a string that is not a UUID', () => {
    expect(() => timestampOfUuidV7('nope')).toThrow(RangeError);
  });
});
