import { sha256 } from '@noble/hashes/sha2';

import { bytesToHex } from '../encoding';

/**
 * Compare two Uint8Arrays for equality in constant time.
 *
 * @param first - First array.
 * @param second - Second array.
 * @returns Whether the two arrays are equal.
 */
function areEqual(first: Uint8Array, second: Uint8Array): boolean {
  if (first.length !== second.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < first.length; i++) {
    // eslint-disable-next-line no-bitwise
    diff |= (first[i] ?? 0) ^ (second[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Verify that an authenticator data rpIdHash matches one of the expected
 * RP IDs by SHA-256 hashing each candidate and comparing.
 *
 * @param rpIdHash - The rpIdHash from authenticatorData (32 bytes).
 * @param expectedRPIDs - One or more RP ID strings to check against.
 * @returns The matching RP ID string.
 * @throws If no expected RP ID matches.
 */
export function matchExpectedRPID(
  rpIdHash: Uint8Array,
  expectedRPIDs: string[],
): string {
  for (const rpID of expectedRPIDs) {
    const expectedHash = sha256(new TextEncoder().encode(rpID));
    if (areEqual(rpIdHash, expectedHash)) {
      return rpID;
    }
  }
  throw new Error(`Unexpected RP ID hash: received ${bytesToHex(rpIdHash)}`);
}
