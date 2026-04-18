import { decodePartialCBOR } from '@levischuck/tiny-cbor';

import type { AttestationObject } from './types';

/**
 * CBOR-decode an attestationObject buffer into a Map with `fmt`, `attStmt`,
 * and `authData` entries.
 *
 * @param attestationObject - Raw attestation object bytes.
 * @returns Decoded AttestationObject map.
 */
export function decodeAttestationObject(
  attestationObject: Uint8Array,
): AttestationObject {
  const copy = new Uint8Array(attestationObject);
  const [decoded] = decodePartialCBOR(copy, 0) as [AttestationObject, number];
  return decoded;
}
