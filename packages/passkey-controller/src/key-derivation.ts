import {
  PasskeyControllerErrorCode,
  PasskeyControllerErrorMessage,
} from './constants';
import { PasskeyControllerError } from './errors';
import type { PasskeyRecord, PrfClientExtensionResults } from './types';
import { deriveEncryptionKey } from './utils/crypto';
import { base64URLToBytes } from './utils/encoding';
import type { PasskeyAuthenticationResponse } from './webauthn/types';

/**
 * Derives an AES-256 wrapping key from a WebAuthn authentication ceremony
 * response.
 *
 * The derivation method is determined by `record.keyDerivation`:
 * - `prf` -- uses the PRF evaluation result from `clientExtensionResults`.
 * - `userHandle` -- uses the `userHandle` returned in the assertion.
 *
 * @param authenticationResponse - The authentication credential result
 *   from `navigator.credentials.get()`.
 * @param record - Credential id and key derivation parameters (ciphertext is
 *   not read).
 * @returns The derived 32-byte AES wrapping key.
 * @throws {@link PasskeyControllerError} with code `missing_key_material` if the
 *   required key material (PRF result or userHandle) is missing from the response.
 */
export function deriveKeyFromAuthenticationResponse(
  authenticationResponse: PasskeyAuthenticationResponse,
  record: Pick<PasskeyRecord, 'credential' | 'keyDerivation'>,
): Uint8Array {
  const { userHandle } = authenticationResponse.response;
  const prfFirst = (
    authenticationResponse.clientExtensionResults as PrfClientExtensionResults
  )?.prf?.results?.first;
  const hasPrfOutput = typeof prfFirst === 'string' && prfFirst.length > 0;

  let ikm: Uint8Array;
  if (record.keyDerivation.method === 'prf') {
    if (!hasPrfOutput) {
      throw new PasskeyControllerError(
        PasskeyControllerErrorMessage.MissingKeyMaterial,
        { code: PasskeyControllerErrorCode.MissingKeyMaterial },
      );
    }
    ikm = base64URLToBytes(prfFirst);
  } else if (userHandle) {
    ikm = base64URLToBytes(userHandle);
  } else {
    throw new PasskeyControllerError(
      PasskeyControllerErrorMessage.MissingKeyMaterial,
      { code: PasskeyControllerErrorCode.MissingKeyMaterial },
    );
  }

  return deriveEncryptionKey(ikm, base64URLToBytes(record.credential.id));
}
