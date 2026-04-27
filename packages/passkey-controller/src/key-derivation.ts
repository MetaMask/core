import {
  PasskeyControllerErrorCode,
  PasskeyControllerErrorMessage,
} from './constants';
import { PasskeyControllerError } from './errors';
import type {
  PasskeyKeyDerivation,
  PasskeyRecord,
  PasskeyRegistrationCeremony,
  PrfClientExtensionResults,
} from './types';
import { deriveEncryptionKey } from './utils/crypto';
import { base64URLToBytes } from './utils/encoding';
import type {
  PasskeyAuthenticationResponse,
  PasskeyRegistrationResponse,
} from './webauthn/types';

/**
 * Derives an AES-256 wrapping key from a WebAuthn registration ceremony
 * response.
 *
 * Uses the PRF output as HKDF input key material when
 * `clientExtensionResults.prf.results.first` is a non-empty string;
 * otherwise falls back to the random `userHandle` created during option
 * generation (including when PRF is enabled but no output is present).
 *
 * @param registrationResponse - The registration credential result from
 *   `navigator.credentials.create()`.
 * @param registrationCeremony - In-flight registration ceremony state from
 *   when `generateRegistrationOptions()` was called.
 * @param verifiedCredentialId - Base64url credential id from verified
 *   authenticator data (same value as persisted `credential.id` after
 *   `verifyRegistrationResponse`), not the client wrapper field alone.
 * @returns The derived 32-byte AES wrapping key and the
 *   {@link PasskeyKeyDerivation} parameters needed to reproduce it.
 */
export function deriveKeyFromRegistrationResponse(
  registrationResponse: PasskeyRegistrationResponse,
  registrationCeremony: PasskeyRegistrationCeremony,
  verifiedCredentialId: string,
): {
  encKey: Uint8Array;
  keyDerivation: PasskeyKeyDerivation;
} {
  const prfFirst = (
    registrationResponse.clientExtensionResults as PrfClientExtensionResults
  )?.prf?.results?.first;
  const hasPrfOutput = typeof prfFirst === 'string' && prfFirst.length > 0;

  const keyDerivation: PasskeyKeyDerivation = hasPrfOutput
    ? { method: 'prf', prfSalt: registrationCeremony.prfSalt }
    : { method: 'userHandle' };
  const ikm =
    keyDerivation.method === 'prf'
      ? base64URLToBytes(prfFirst as string)
      : base64URLToBytes(registrationCeremony.userHandle);
  const encKey = deriveEncryptionKey(
    ikm,
    base64URLToBytes(verifiedCredentialId),
  );

  return { encKey, keyDerivation };
}

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
 * @param record - The persisted passkey record that was created during
 *   enrollment.
 * @returns The derived 32-byte AES wrapping key.
 * @throws {@link PasskeyControllerError} with code `missing_key_material` if the
 *   required key material (PRF result or userHandle) is missing from the response.
 */
export function deriveKeyFromAuthenticationResponse(
  authenticationResponse: PasskeyAuthenticationResponse,
  record: PasskeyRecord,
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
