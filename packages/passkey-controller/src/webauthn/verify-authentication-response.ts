import { decodePartialCBOR } from '@levischuck/tiny-cbor';
import { concatBytes } from '@metamask/utils';
import { sha256 } from '@noble/hashes/sha2';

import type { AuthenticatorTransportFuture } from '../types';
import { base64URLToBytes } from '../utils/encoding';
import { decodeClientDataJSON } from './decode-client-data-json';
import { matchExpectedRPID } from './match-expected-rp-id';
import { parseAuthenticatorData } from './parse-authenticator-data';
import type { ParsedAuthenticatorData } from './types';
import type { PasskeyAuthenticationResponse } from './types';
import { verifySignature } from './verify-signature';

export type VerifiedAuthenticationResponse =
  | { verified: false; authenticationInfo?: never }
  | {
      verified: true;
      authenticationInfo: {
        credentialId: string;
        newCounter: number;
        userVerified: boolean;
        origin: string;
        /** Matched RP ID, or `""` when `expectedRPIDs` is empty (RP ID hash check skipped). */
        rpID: string;
      };
    };

/**
 * Verifies a WebAuthn authentication (assertion) response per
 * W3C WebAuthn Level 3 §7.2.
 *
 * Performs the following checks in order:
 * 1. Credential ID presence, base64url consistency, and type.
 * 2. `clientDataJSON` -- type is `"webauthn.get"`, challenge and origin
 *    match.
 * 3. `authenticatorData` -- RP ID hash matches, user-presence flag is
 *    set, and optional user-verification flag is checked.
 * 4. Signature verification -- `signature` is verified over
 *    `authData || SHA-256(clientDataJSON)` using the stored credential
 *    public key (COSE-encoded).
 * 5. Counter monotonicity -- if either the stored or returned counter
 *    is non-zero, the new counter must exceed the stored value.
 *
 * @param opts - Verification options.
 * @param opts.response - The `PublicKeyCredential` result from
 *   `navigator.credentials.get()`, serialized as JSON.
 * @param opts.expectedChallenge - The base64url challenge that was issued
 *   for this ceremony.
 * @param opts.expectedOrigin - One or more acceptable origins.
 * @param opts.expectedRPIDs - Relying Party ID strings to match against `rpIdHash`.
 * @param opts.credential - The stored credential record to verify against.
 * @param opts.credential.id - The credential ID (base64url).
 * @param opts.credential.publicKey - The COSE-encoded public key bytes
 *   persisted during registration.
 * @param opts.credential.counter - The last known signature counter value.
 * @param opts.credential.transports - Optional authenticator transports.
 * @param opts.requireUserVerification - When `true`, verification fails
 *   if the UV flag is not set. Defaults to `false`.
 * @returns Verification result containing `verified` status and parsed
 *   authentication info (new counter, origin, RP ID).
 */
export async function verifyAuthenticationResponse(opts: {
  response: PasskeyAuthenticationResponse;
  expectedChallenge: string;
  expectedOrigin: string | string[];
  expectedRPIDs: string[];
  credential: {
    id: string;
    publicKey: Uint8Array;
    counter: number;
    transports?: AuthenticatorTransportFuture[];
  };
  requireUserVerification?: boolean;
}): Promise<VerifiedAuthenticationResponse> {
  const {
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPIDs,
    credential,
    requireUserVerification = false,
  } = opts;

  const {
    id,
    rawId,
    type: credentialType,
    response: assertionResponse,
  } = response;

  // Ensure credential specified an ID
  if (!id) {
    throw new Error('Missing credential ID');
  }

  // Ensure ID is base64url-encoded
  if (id !== rawId) {
    throw new Error('Credential ID was not base64url-encoded');
  }

  // Make sure credential type is public-key
  if (credentialType !== 'public-key') {
    throw new Error(
      `Unexpected credential type ${String(credentialType)}, expected "public-key"`,
    );
  }

  if (typeof assertionResponse?.clientDataJSON !== 'string') {
    throw new Error('Credential response clientDataJSON was not a string');
  }

  const clientDataJSON = decodeClientDataJSON(assertionResponse.clientDataJSON);
  const { type, challenge, origin, tokenBinding } = clientDataJSON;

  // Make sure we're handling an authentication
  if (type !== 'webauthn.get') {
    throw new Error(`Unexpected authentication response type: ${type}`);
  }

  // Ensure the device provided the challenge we gave it
  if (challenge !== expectedChallenge) {
    throw new Error(
      `Unexpected authentication response challenge "${challenge}", expected "${expectedChallenge}"`,
    );
  }

  // Check that the origin is our site
  const expectedOrigins = Array.isArray(expectedOrigin)
    ? expectedOrigin
    : [expectedOrigin];
  if (!expectedOrigins.includes(origin)) {
    throw new Error(
      `Unexpected authentication response origin "${origin}", expected one of: ${expectedOrigins.join(', ')}`,
    );
  }

  if (
    assertionResponse.userHandle &&
    typeof assertionResponse.userHandle !== 'string'
  ) {
    throw new Error('Credential response userHandle was not a string');
  }

  if (tokenBinding) {
    if (typeof tokenBinding !== 'object') {
      throw new Error('ClientDataJSON tokenBinding was not an object');
    }

    if (
      !['present', 'supported', 'not-supported'].includes(tokenBinding.status)
    ) {
      throw new Error(`Unexpected tokenBinding status ${tokenBinding.status}`);
    }
  }

  const authDataBuffer = base64URLToBytes(assertionResponse.authenticatorData);
  const parsedAuthData: ParsedAuthenticatorData =
    parseAuthenticatorData(authDataBuffer);
  const { rpIdHash, flags, counter } = parsedAuthData;

  const matchedRPID =
    expectedRPIDs.length > 0 ? matchExpectedRPID(rpIdHash, expectedRPIDs) : '';

  // WebAuthn only requires the user presence flag be true
  if (!flags.up) {
    throw new Error('User not present during authentication');
  }

  // Enforce user verification if required
  if (requireUserVerification && !flags.uv) {
    throw new Error(
      'User verification required, but user could not be verified',
    );
  }

  const clientDataHash = sha256(
    base64URLToBytes(assertionResponse.clientDataJSON),
  );
  const signatureBase = concatBytes([authDataBuffer, clientDataHash]);

  const signature = base64URLToBytes(assertionResponse.signature);

  const cosePublicKey = decodePartialCBOR(
    new Uint8Array(credential.publicKey),
    0,
  )[0] as Map<number, number | Uint8Array>;

  const verified = await verifySignature({
    cosePublicKey,
    signature,
    data: signatureBase,
  });

  if (!verified) {
    return { verified: false };
  }

  if (
    (counter > 0 || credential.counter > 0) &&
    counter <= credential.counter
  ) {
    throw new Error(
      `Response counter value ${counter} must be greater than stored counter ${credential.counter}`,
    );
  }

  return {
    verified: true,
    authenticationInfo: {
      credentialId: credential.id,
      newCounter: counter,
      userVerified: flags.uv,
      origin: clientDataJSON.origin,
      rpID: matchedRPID,
    },
  };
}
