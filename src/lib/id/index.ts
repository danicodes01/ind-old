import { getRandomBytes } from 'expo-crypto';

import { RANDOM_BYTES_REQUIRED, formatUuidV7 } from './uuidv7';

export { formatUuidV7, timestampOfUuidV7, RANDOM_BYTES_REQUIRED } from './uuidv7';

/**
 * Mint a new row id.
 *
 * Ids are generated on the device because rows are created offline, on more than one device,
 * and must never collide. A server round-trip to allocate an id would defeat local-first.
 */
export function newId(): string {
  return formatUuidV7(Date.now(), getRandomBytes(RANDOM_BYTES_REQUIRED));
}
