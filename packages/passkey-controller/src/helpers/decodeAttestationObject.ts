import { decodePartialCBOR } from '@levischuck/tiny-cbor';

export type AttestationFormat =
  | 'fido-u2f'
  | 'packed'
  | 'android-safetynet'
  | 'android-key'
  | 'tpm'
  | 'apple'
  | 'none';

export type AttestationObject = {
  get(key: 'fmt'): AttestationFormat;
  get(key: 'attStmt'): AttestationStatement;
  get(key: 'authData'): Uint8Array;
};

export type AttestationStatement = {
  get(key: 'sig'): Uint8Array | undefined;
  get(key: 'x5c'): Uint8Array[] | undefined;
  get(key: 'alg'): number | undefined;
  readonly size: number;
};

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
