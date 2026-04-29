import { areUint8ArraysEqual } from '@metamask/utils';
import { sha256 } from '@noble/hashes/sha2';

import { bytesToHex } from '../utils/encoding';

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
    if (areUint8ArraysEqual(rpIdHash, expectedHash)) {
      return rpID;
    }
  }
  throw new Error(`Unexpected RP ID hash: received ${bytesToHex(rpIdHash)}`);
}
