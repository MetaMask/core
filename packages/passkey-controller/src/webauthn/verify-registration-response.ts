import { decodePartialCBOR } from '@levischuck/tiny-cbor';
import { concatBytes } from '@metamask/utils';
import { sha256 } from '@noble/hashes/sha2';

import type { AuthenticatorTransportFuture } from '../types';
import {
  base64URLToBytes,
  bytesToBase64URL,
  bytesToHex,
} from '../utils/encoding';
import { COSEALG, COSEKEYS } from './constants';
import { decodeAttestationObject } from './decode-attestation-object';
import { decodeClientDataJSON } from './decode-client-data-json';
import { matchExpectedRPID } from './match-expected-rp-id';
import { parseAuthenticatorData } from './parse-authenticator-data';
import type { PasskeyRegistrationResponse } from './types';
import { verifySignature } from './verify-signature';

export type VerifiedRegistrationResponse =
  | { verified: false; registrationInfo?: never }
  | {
      verified: true;
      registrationInfo: {
        credentialId: string;
        publicKey: Uint8Array;
        counter: number;
        transports?: AuthenticatorTransportFuture[];
        aaguid: string;
        attestationFormat: string;
        userVerified: boolean;
      };
    };

/**
 * Verifies a WebAuthn registration (attestation) response per
 * W3C WebAuthn Level 3 §7.1.
 *
 * Performs the following checks in order:
 * 1. Credential ID presence and base64url consistency (`id === rawId`), and
 *    that `id` matches the credential id inside parsed authenticator data.
 * 2. Credential type is `"public-key"`.
 * 3. `clientDataJSON` -- type is `"webauthn.create"`, challenge and origin
 *    match the expected values.
 * 4. Attestation object -- CBOR-decodes and parses `authData` to verify
 *    the RP ID hash, user-presence flag, optional user-verification flag,
 *    and the attested credential public key algorithm.
 * 5. Attestation statement -- supports `"none"` (no signature) and
 *    `"packed"` self-attestation (signature verified against the
 *    credential's own public key).
 *
 * @param opts - Verification options.
 * @param opts.response - The `PublicKeyCredential` result from
 *   `navigator.credentials.create()`, serialized as JSON.
 * @param opts.expectedChallenge - The base64url challenge that was passed
 *   to the authenticator (must match `clientDataJSON.challenge`).
 * @param opts.expectedOrigin - One or more acceptable origins (e.g.
 *   `"chrome-extension://..."` or `"https://metamask.io"`).
 * @param opts.expectedRPID - The Relying Party ID domain. The
 *   authenticator's `rpIdHash` is compared against `SHA-256(expectedRPID)`.
 * @param opts.requireUserVerification - When `true`, verification fails
 *   if the UV flag is not set. Defaults to `false`.
 * @param opts.supportedAlgorithmIDs - COSE algorithm identifiers accepted
 *   for the credential public key. Defaults to EdDSA, ES256, and RS256.
 * @returns On success, `{ verified: true, registrationInfo }` with the
 *   parsed credential ID, public key, counter, AAGUID, and transport
 *   hints. On failure, `{ verified: false }`.
 */
export async function verifyRegistrationResponse(opts: {
  response: PasskeyRegistrationResponse;
  expectedChallenge: string;
  expectedOrigin: string | string[];
  expectedRPID: string;
  requireUserVerification?: boolean;
  supportedAlgorithmIDs?: number[];
}): Promise<VerifiedRegistrationResponse> {
  const {
    response,
    expectedChallenge,
    expectedOrigin,
    expectedRPID,
    requireUserVerification = false,
    supportedAlgorithmIDs = [COSEALG.EdDSA, COSEALG.ES256, COSEALG.RS256],
  } = opts;

  const {
    id,
    rawId,
    type: credentialType,
    response: attestationResponse,
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

  const clientDataJSON = decodeClientDataJSON(
    attestationResponse.clientDataJSON,
  );
  const { type, challenge, origin, tokenBinding } = clientDataJSON;

  // Make sure we're handling an registration
  if (type !== 'webauthn.create') {
    throw new Error(`Unexpected registration response type: ${type}`);
  }

  // Ensure the device provided the challenge we gave it
  if (challenge !== expectedChallenge) {
    throw new Error(
      `Unexpected registration response challenge "${challenge}", expected "${expectedChallenge}"`,
    );
  }

  // Check that the origin is our site
  const expectedOrigins = Array.isArray(expectedOrigin)
    ? expectedOrigin
    : [expectedOrigin];
  if (!expectedOrigins.includes(origin)) {
    throw new Error(
      `Unexpected registration response origin "${origin}", expected one of: ${expectedOrigins.join(', ')}`,
    );
  }

  if (tokenBinding) {
    if (typeof tokenBinding !== 'object') {
      throw new Error('ClientDataJSON tokenBinding was not an object');
    }

    if (
      !['present', 'supported', 'not-supported'].includes(tokenBinding.status)
    ) {
      throw new Error(
        `Unexpected tokenBinding.status value of "${tokenBinding.status}"`,
      );
    }
  }

  const attestationObjectBytes = base64URLToBytes(
    attestationResponse.attestationObject,
  );
  const decodedAttObj = decodeAttestationObject(attestationObjectBytes);
  const fmt = decodedAttObj.get('fmt');
  const authData = decodedAttObj.get('authData');
  const attStmt = decodedAttObj.get('attStmt');

  const parsedAuthData = parseAuthenticatorData(authData);
  const {
    rpIdHash,
    flags,
    counter,
    credentialID,
    credentialPublicKey,
    aaguid,
  } = parsedAuthData;

  matchExpectedRPID(rpIdHash, [expectedRPID]);

  // Make sure someone was physically present
  if (!flags.up) {
    throw new Error('User presence was required, but user was not present');
  }

  // Enforce user verification if specified
  if (requireUserVerification && !flags.uv) {
    throw new Error(
      'User verification was required, but user could not be verified',
    );
  }

  if (!credentialID) {
    throw new Error('No credential ID was provided by authenticator');
  }

  const attestedCredentialId = bytesToBase64URL(credentialID);
  if (id !== attestedCredentialId) {
    throw new Error(
      'Credential id does not match the credential id in authenticator data',
    );
  }

  if (!credentialPublicKey) {
    throw new Error('No public key was provided by authenticator');
  }
  if (!aaguid) {
    throw new Error('No AAGUID was present during registration');
  }

  const decodedPublicKey = decodePartialCBOR(
    new Uint8Array(credentialPublicKey),
    0,
  )[0] as Map<number, number | Uint8Array>;
  const alg = decodedPublicKey.get(COSEKEYS.Alg);

  if (typeof alg !== 'number') {
    throw new Error('Credential public key was missing numeric alg');
  }

  // Make sure the key algorithm is one we specified within the registration options
  if (!supportedAlgorithmIDs.includes(alg)) {
    throw new Error(
      `Unexpected public key alg "${alg}", expected one of "${supportedAlgorithmIDs.join(', ')}"`,
    );
  }

  let verified = false;
  if (fmt === 'none') {
    if (attStmt.size > 0) {
      throw new Error('None attestation had unexpected attestation statement');
    }
    verified = true;
  } else if (fmt === 'packed') {
    verified = await verifyPackedAttestation(
      attStmt,
      authData,
      attestationResponse.clientDataJSON,
      decodedPublicKey,
    );
  } else {
    throw new Error(`Unsupported attestation format: ${fmt}`);
  }

  if (!verified) {
    return { verified: false };
  }

  const aaguidHex = bytesToHex(aaguid);
  const aaguidStr = [
    aaguidHex.slice(0, 8),
    aaguidHex.slice(8, 12),
    aaguidHex.slice(12, 16),
    aaguidHex.slice(16, 20),
    aaguidHex.slice(20),
  ].join('-');

  return {
    verified: true,
    registrationInfo: {
      credentialId: attestedCredentialId,
      publicKey: credentialPublicKey,
      counter,
      transports:
        attestationResponse.transports as AuthenticatorTransportFuture[],
      aaguid: aaguidStr,
      attestationFormat: fmt,
      userVerified: flags.uv,
    },
  };
}

/**
 * Verify packed self-attestation per WebAuthn §8.2: no x5c certificate
 * chain, signature over `authData || SHA-256(clientDataJSON)` verified
 * with the credential's own public key, and `alg` in the attestation
 * statement must match the credential key's algorithm.
 *
 * @param attStmt - The attestation statement map from the attestation
 *   object.
 * @param attStmt.get - Accessor to retrieve statement fields by key.
 * @param attStmt.size - Number of entries in the statement.
 * @param authData - Raw authenticator data bytes.
 * @param clientDataJSONB64url - Base64url-encoded clientDataJSON.
 * @param cosePublicKey - Decoded COSE public key map from authenticator
 *   data.
 * @returns Whether the packed attestation signature is valid.
 */
async function verifyPackedAttestation(
  attStmt: { get(key: string): unknown; size: number },
  authData: Uint8Array,
  clientDataJSONB64url: string,
  cosePublicKey: Map<number, number | Uint8Array>,
): Promise<boolean> {
  const attStmtAlg = attStmt.get('alg') as number | undefined;
  const signature = attStmt.get('sig') as Uint8Array | undefined;
  const x5c = attStmt.get('x5c') as Uint8Array[] | undefined;

  if (typeof attStmtAlg !== 'number') {
    throw new Error('Packed attestation statement missing alg');
  }

  if (!signature) {
    throw new Error('Packed attestation missing signature');
  }

  if (x5c && x5c.length > 0) {
    throw new Error(
      'Packed attestation with certificate chain (x5c) is not supported; only self-attestation is accepted',
    );
  }

  const credAlg = cosePublicKey.get(COSEKEYS.Alg) as number;
  if (attStmtAlg !== credAlg) {
    throw new Error(
      `Packed attestation alg ${attStmtAlg} does not match credential alg ${credAlg}`,
    );
  }

  const clientDataHash = sha256(base64URLToBytes(clientDataJSONB64url));
  const signatureBase = concatBytes([authData, clientDataHash]);

  return verifySignature({
    cosePublicKey,
    signature,
    data: signatureBase,
  });
}
