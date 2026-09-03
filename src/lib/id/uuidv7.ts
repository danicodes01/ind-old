/**
 * UUIDv7 formatting, kept pure so it can be tested without a native randomness source.
 *
 * v7 rather than v4 because it is time-ordered: the leading 48 bits are a Unix millisecond
 * timestamp, so ids sort by creation and land at the end of a B-tree index instead of
 * scattering across it. For a table that grows monotonically for years, on both SQLite and
 * Postgres, that locality is worth having. See docs/DATA-MODEL.md.
 *
 * Layout (RFC 9562):
 *   bytes 0-5   48-bit big-endian timestamp, milliseconds
 *   byte  6     version (0111) in the high nibble, then 4 random bits
 *   byte  7     8 random bits
 *   byte  8     variant (10) in the top two bits, then 6 random bits
 *   bytes 9-15  56 random bits
 */

const MAX_TIMESTAMP = 2 ** 48 - 1;

/** Random bytes required by {@link formatUuidV7}. */
export const RANDOM_BYTES_REQUIRED = 10;

const HEX: readonly string[] = Array.from({ length: 256 }, (_, byte) =>
  byte.toString(16).padStart(2, '0'),
);

export function formatUuidV7(timestampMs: number, random: Uint8Array): string {
  if (!Number.isInteger(timestampMs) || timestampMs < 0 || timestampMs > MAX_TIMESTAMP) {
    throw new RangeError(`UUIDv7 timestamp out of range: ${timestampMs}`);
  }
  if (random.length < RANDOM_BYTES_REQUIRED) {
    throw new RangeError(
      `UUIDv7 needs ${RANDOM_BYTES_REQUIRED} random bytes, received ${random.length}`,
    );
  }

  const bytes = new Uint8Array(16);

  bytes[0] = Math.floor(timestampMs / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(timestampMs / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(timestampMs / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(timestampMs / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(timestampMs / 2 ** 8) & 0xff;
  bytes[5] = timestampMs & 0xff;

  bytes[6] = 0x70 | ((random[0] ?? 0) & 0x0f);
  bytes[7] = random[1] ?? 0;
  bytes[8] = 0x80 | ((random[2] ?? 0) & 0x3f);
  for (let i = 0; i < 7; i += 1) {
    bytes[9 + i] = random[3 + i] ?? 0;
  }

  const hex = (index: number): string => HEX[bytes[index] ?? 0] ?? '00';
  const range = (from: number, to: number): string => {
    let out = '';
    for (let i = from; i < to; i += 1) out += hex(i);
    return out;
  };

  return `${range(0, 4)}-${range(4, 6)}-${range(6, 8)}-${range(8, 10)}-${range(10, 16)}`;
}

/** The millisecond timestamp encoded in a UUIDv7. Useful for debugging and ordering checks. */
export function timestampOfUuidV7(uuid: string): number {
  const hex = uuid.replace(/-/g, '').slice(0, 12);
  if (hex.length !== 12) {
    throw new RangeError(`Not a UUID: ${uuid}`);
  }
  return Number.parseInt(hex, 16);
}
