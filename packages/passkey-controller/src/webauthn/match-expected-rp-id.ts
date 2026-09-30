import { areUint8ArraysEqual, sha256 } from '@metamask/utils';

import { bytesToHex } from '../utils/encoding.js';

/**
 * Verify that an authenticator data rpIdHash matches one of the expected
 * RP IDs by SHA-256 hashing each candidate and comparing.
 *
 * @param rpIdHash - The rpIdHash from authenticatorData (32 bytes).
 * @param expectedRPIDs - One or more RP ID strings to check against.
 * @returns A promise for the matching RP ID string.
 * @throws If no expected RP ID matches.
 */
export async function matchExpectedRPID(
  rpIdHash: Uint8Array,
  expectedRPIDs: string[],
): Promise<string> {
  for (const rpID of expectedRPIDs) {
    const expectedHash = await sha256(new TextEncoder().encode(rpID));
    if (areUint8ArraysEqual(rpIdHash, expectedHash)) {
      return rpID;
    }
  }
  throw new Error(`Unexpected RP ID hash: received ${bytesToHex(rpIdHash)}`);
}
