import { decodePartialCBOR } from '@levischuck/tiny-cbor';
import { sha256 } from '@noble/hashes/sha2';

import { decodeClientDataJSON } from './decode-client-data-json';
import { matchExpectedRPID } from './match-expected-rp-id';
import { parseAuthenticatorData } from './parse-authenticator-data';
import type { ParsedAuthenticatorData } from './types';
import type { PasskeyAuthenticationResponse } from './types';
import { verifySignature } from './verify-signature';
import type { AuthenticatorTransportFuture } from '../types';
import { concatUint8Arrays } from '../utils/bytes';
import { base64URLToBytes } from '../utils/encoding';

export type VerifiedAuthenticationResponse =
  | { verified: false; authenticationInfo?: never }
  | {
      verified: true;
      authenticationInfo: {
        credentialId: string;
        newCounter: number;
        userVerified: boolean;
        origin: string;
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
 * @param opts.expectedRPID - The Relying Party ID domain.
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
  expectedRPID: string;
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
    expectedRPID,
    credential,
    requireUserVerification = false,
  } = opts;

  const {
    id,
    rawId,
    type: credentialType,
    response: assertionResponse,
  } = response;

  if (!id) {
    throw new Error('Missing credential ID');
  }
  if (id !== rawId) {
    throw new Error('Credential ID was not base64url-encoded');
  }
  if (credentialType !== 'public-key') {
    throw new Error(
      `Unexpected credential type ${String(credentialType)}, expected "public-key"`,
    );
  }

  const clientDataJSON = decodeClientDataJSON(assertionResponse.clientDataJSON);

  if (clientDataJSON.type !== 'webauthn.get') {
    throw new Error(
      `Unexpected authentication response type: ${clientDataJSON.type}`,
    );
  }

  if (clientDataJSON.challenge !== expectedChallenge) {
    throw new Error(
      `Unexpected authentication response challenge "${clientDataJSON.challenge}", expected "${expectedChallenge}"`,
    );
  }

  const expectedOrigins = Array.isArray(expectedOrigin)
    ? expectedOrigin
    : [expectedOrigin];
  if (!expectedOrigins.includes(clientDataJSON.origin)) {
    throw new Error(
      `Unexpected authentication response origin "${clientDataJSON.origin}", expected one of: ${expectedOrigins.join(', ')}`,
    );
  }

  const authDataBuffer = base64URLToBytes(assertionResponse.authenticatorData);
  const parsedAuthData: ParsedAuthenticatorData =
    parseAuthenticatorData(authDataBuffer);
  const { rpIdHash, flags, counter } = parsedAuthData;

  const matchedRPID = matchExpectedRPID(rpIdHash, [expectedRPID]);

  if (!flags.up) {
    throw new Error('User not present during authentication');
  }

  if (requireUserVerification && !flags.uv) {
    throw new Error(
      'User verification required, but user could not be verified',
    );
  }

  const clientDataHash = sha256(
    base64URLToBytes(assertionResponse.clientDataJSON),
  );
  const signatureBase = concatUint8Arrays(authDataBuffer, clientDataHash);

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
      `Response counter value ${counter} was lower than expected ${credential.counter}`,
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
