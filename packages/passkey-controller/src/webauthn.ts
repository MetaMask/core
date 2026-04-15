import { decodePartialCBOR } from '@levischuck/tiny-cbor';
import { sha256 } from '@noble/hashes/sha2';

import { COSEALG, COSEKEYS } from './constants';
import { base64URLToBytes, bytesToBase64URL, bytesToHex } from './encoding';
import { decodeAttestationObject } from './helpers/decodeAttestationObject';
import { decodeClientDataJSON } from './helpers/decodeClientDataJSON';
import { matchExpectedRPID } from './helpers/matchExpectedRPID';
import { parseAuthenticatorData } from './helpers/parseAuthenticatorData';
import type { ParsedAuthenticatorData } from './helpers/parseAuthenticatorData';
import { verifySignature } from './helpers/verifySignature';
import type {
  PasskeyRegistrationResponse,
  PasskeyAuthenticationResponse,
  AuthenticatorTransportFuture,
} from './types';

// ─── Registration ────────────────────────────────────────────────────────────

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
 * Verify a WebAuthn registration response per W3C WebAuthn Level 3 §7.1.
 *
 * Checks: credential ID/type, clientDataJSON (type, challenge, origin),
 * attestation object (rpIdHash, flags, algorithm, attestation format),
 * and packed self-attestation signature when applicable.
 *
 * @param opts - Verification options.
 * @param opts.response - The registration response from the authenticator.
 * @param opts.expectedChallenge - The expected challenge string.
 * @param opts.expectedOrigin - The expected origin(s).
 * @param opts.expectedRPID - The expected Relying Party ID.
 * @param opts.requireUserVerification - Whether UV must be set.
 * @param opts.supportedAlgorithmIDs - Allowed COSE algorithm identifiers.
 * @returns Verification result with credential info on success.
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

  const clientDataJSON = decodeClientDataJSON(
    attestationResponse.clientDataJSON,
  );

  if (clientDataJSON.type !== 'webauthn.create') {
    throw new Error(
      `Unexpected registration response type: ${clientDataJSON.type}`,
    );
  }

  if (clientDataJSON.challenge !== expectedChallenge) {
    throw new Error(
      `Unexpected registration response challenge "${clientDataJSON.challenge}", expected "${expectedChallenge}"`,
    );
  }

  const expectedOrigins = Array.isArray(expectedOrigin)
    ? expectedOrigin
    : [expectedOrigin];
  if (!expectedOrigins.includes(clientDataJSON.origin)) {
    throw new Error(
      `Unexpected registration response origin "${clientDataJSON.origin}", expected one of: ${expectedOrigins.join(', ')}`,
    );
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

  if (!flags.up) {
    throw new Error('User presence was required, but user was not present');
  }

  if (requireUserVerification && !flags.uv) {
    throw new Error(
      'User verification was required, but user could not be verified',
    );
  }

  if (!credentialID) {
    throw new Error('No credential ID was provided by authenticator');
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
      credentialId: bytesToBase64URL(credentialID),
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
 * Verify packed attestation (self-attestation case: no x5c, signature over
 * authData || SHA-256(clientDataJSON) with the credential key itself).
 *
 * @param attStmt - The attestation statement map.
 * @param attStmt.get - Map accessor for statement fields.
 * @param attStmt.size - Number of entries in the statement.
 * @param authData - Raw authenticator data bytes.
 * @param clientDataJSONB64url - Base64url-encoded clientDataJSON.
 * @param cosePublicKey - Decoded COSE public key map.
 * @returns Whether the packed attestation signature is valid.
 */
async function verifyPackedAttestation(
  attStmt: { get(key: string): unknown; size: number },
  authData: Uint8Array,
  clientDataJSONB64url: string,
  cosePublicKey: Map<number, number | Uint8Array>,
): Promise<boolean> {
  const signature = attStmt.get('sig') as Uint8Array | undefined;
  const x5c = attStmt.get('x5c') as Uint8Array[] | undefined;

  if (!signature) {
    throw new Error('Packed attestation missing signature');
  }

  if (x5c && x5c.length > 0) {
    throw new Error(
      'Packed attestation with certificate chain (x5c) is not supported; only self-attestation is accepted',
    );
  }

  const clientDataHash = sha256(base64URLToBytes(clientDataJSONB64url));
  const signatureBase = concatUint8Arrays(authData, clientDataHash);

  return verifySignature({
    cosePublicKey,
    signature,
    data: signatureBase,
  });
}

// ─── Authentication ──────────────────────────────────────────────────────────

export type VerifiedAuthenticationResponse = {
  verified: boolean;
  authenticationInfo: {
    credentialId: string;
    newCounter: number;
    userVerified: boolean;
    origin: string;
    rpID: string;
  };
};

/**
 * Verify a WebAuthn authentication response per W3C WebAuthn Level 3 §7.2.
 *
 * Checks: credential ID/type, clientDataJSON (type, challenge, origin),
 * authenticatorData (rpIdHash, flags), counter monotonicity, and signature
 * verification against the stored credential public key.
 *
 * @param opts - Verification options.
 * @param opts.response - The authentication response from the authenticator.
 * @param opts.expectedChallenge - The expected challenge string.
 * @param opts.expectedOrigin - The expected origin(s).
 * @param opts.expectedRPID - The expected Relying Party ID.
 * @param opts.credential - The stored credential to verify against.
 * @param opts.credential.id - The credential ID.
 * @param opts.credential.publicKey - The COSE-encoded public key bytes.
 * @param opts.credential.counter - The last known counter value.
 * @param opts.credential.transports - Optional authenticator transports.
 * @param opts.requireUserVerification - Whether UV must be set.
 * @returns Verification result with authentication info.
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

  if (
    (counter > 0 || credential.counter > 0) &&
    counter <= credential.counter
  ) {
    throw new Error(
      `Response counter value ${counter} was lower than expected ${credential.counter}`,
    );
  }

  return {
    verified,
    authenticationInfo: {
      credentialId: credential.id,
      newCounter: counter,
      userVerified: flags.uv,
      origin: clientDataJSON.origin,
      rpID: matchedRPID,
    },
  };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function concatUint8Arrays(first: Uint8Array, second: Uint8Array): Uint8Array {
  const result = new Uint8Array(first.length + second.length);
  result.set(first, 0);
  result.set(second, first.length);
  return result;
}
