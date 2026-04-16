import type {
  PasskeyRecord,
  PasskeyRegistrationSession,
  PrfClientExtensionResults,
} from './types';
import { deriveEncryptionKey } from './utils/crypto';
import { base64URLToBytes } from './utils/encoding';
import type {
  PasskeyAuthenticationResponse,
  PasskeyRegistrationResponse,
} from './webauthn';

/**
 * Derives an AES-256 wrapping key from a WebAuthn registration ceremony
 * response.
 *
 * Checks whether the authenticator returned a PRF evaluation result. If
 * so, uses the PRF output as HKDF input key material; otherwise falls
 * back to the random `userHandle` created during option generation.
 *
 * @param registrationResponse - The registration credential result from
 *   `navigator.credentials.create()`.
 * @param session - The in-memory registration session that was created
 *   when `generateRegistrationOptions()` was called.
 * @returns The derived 32-byte AES wrapping key and which derivation
 *   method (PRF vs userHandle) was used.
 */
export function deriveKeyFromRegistrationResponse(
  registrationResponse: PasskeyRegistrationResponse,
  session: PasskeyRegistrationSession,
): {
  encKey: Uint8Array;
  derivationMethod: 'prf' | 'userHandle';
} {
  const credentialId = registrationResponse.id;
  const prf = (
    registrationResponse.clientExtensionResults as PrfClientExtensionResults
  )?.prf;
  const prfFirst = prf?.results?.first;
  const prfEnabled =
    prf?.enabled === true || (prfFirst !== undefined && prfFirst.length > 0);
  const derivationMethod = prfEnabled ? 'prf' : 'userHandle';
  const ikm: Uint8Array =
    derivationMethod === 'prf'
      ? base64URLToBytes(prfFirst as string)
      : base64URLToBytes(session.userHandle);
  const encKey = deriveEncryptionKey(ikm, base64URLToBytes(credentialId));
  return { encKey, derivationMethod };
}

/**
 * Derives an AES-256 wrapping key from a WebAuthn authentication ceremony
 * response.
 *
 * The derivation method is determined by the stored `PasskeyRecord`:
 * - `prf` -- uses the PRF evaluation result from `clientExtensionResults`.
 * - `userHandle` -- uses the `userHandle` returned in the assertion.
 *
 * @param authenticationResponse - The authentication credential result
 *   from `navigator.credentials.get()`.
 * @param record - The persisted passkey record that was created during
 *   enrollment.
 * @returns The derived 32-byte AES wrapping key.
 * @throws If the required key material (PRF result or userHandle) is
 *   missing from the response.
 */
export function deriveKeyFromAuthenticationResponse(
  authenticationResponse: PasskeyAuthenticationResponse,
  record: PasskeyRecord,
): Uint8Array {
  const { userHandle } = authenticationResponse.response;
  const prfFirst = (
    authenticationResponse.clientExtensionResults as PrfClientExtensionResults
  )?.prf?.results?.first;

  let ikm: Uint8Array;
  if (record.derivationMethod === 'prf') {
    ikm = base64URLToBytes(prfFirst as string);
  } else if (userHandle) {
    ikm = base64URLToBytes(userHandle);
  } else {
    throw new Error('Passkey assertion missing required key material');
  }

  return deriveEncryptionKey(ikm, base64URLToBytes(record.credentialId));
}
