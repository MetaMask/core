import { bytesToString } from '@metamask/utils';
import { ed25519 } from '@noble/curves/ed25519';

import { base64UrlToBytes } from '../encoding.js';

/**
 * Verifies an encryption-schema `jwtChain` against the issuer's published JWKS
 * (idOS enclave for `encryptionDataKey`, idOS relay for `ukycCapabilityToken`).
 *
 * The signature check is done with `@noble/curves` (rather than WebCrypto
 * `subtle`) because not every MetaMask runtime exposes a `subtle`
 * implementation for Ed25519; JWT parsing is a plain base64url/JSON decode, so
 * no `jose` dependency is required.
 *
 * Decode and key-length problems are caught here so callers do not see raw
 * codec or curve exceptions. `KycController` logs those failures and surfaces
 * one friendly error.
 */

/**
 * A single Ed25519 (OKP) JSON Web Key from an issuer JWKS.
 */
export type Jwk = {
  kty: string;
  crv: string;
  x: string;
  kid: string;
  use?: string;
  alg?: string;
};

/**
 * The verified `jwtChain` payload. `sessionServerPublicKeyX` attests the
 * server's X25519 public key so the client can confirm the value returned
 * out-of-band in an encryption schema was not tampered with.
 */
export type JwtChainPayload = {
  sessionServerPublicKeyX: string;
  nonce: string;
};

const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;

/**
 * Decodes a base64url JWT segment into a parsed JSON value.
 *
 * @param segment - The base64url-encoded segment.
 * @param label - Human-readable segment name for error messages.
 * @returns The parsed JSON value.
 * @throws When the segment is not base64url JSON.
 */
function decodeJsonSegment(segment: string, label: string): unknown {
  try {
    return JSON.parse(bytesToString(base64UrlToBytes(segment))) as unknown;
  } catch (error) {
    throw new Error(`UKYC: failed to decode jwtChain ${label}.`, {
      cause: error,
    });
  }
}

/**
 * Returns whether `value` is a non-null object.
 *
 * @param value - The decoded JSON value.
 * @returns Whether `value` is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Returns whether `value` is a non-empty string.
 *
 * @param value - The candidate field.
 * @returns Whether `value` is a non-empty string.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Reads a compact JWT's protected header and requires EdDSA plus a `kid`.
 *
 * @param segment - The base64url-encoded header segment.
 * @returns The algorithm and key id.
 * @throws When the header is not a usable EdDSA header.
 */
function readJwtHeader(segment: string): { kid: string } {
  const header = decodeJsonSegment(segment, 'header');
  if (!isRecord(header)) {
    throw new Error('UKYC: jwtChain header must be an object.');
  }
  if (header.alg !== 'EdDSA') {
    throw new Error(
      `UKYC: unsupported jwtChain alg "${String(header.alg)}" (expected EdDSA).`,
    );
  }
  if (!isNonEmptyString(header.kid)) {
    throw new Error('UKYC: jwtChain header is missing kid.');
  }
  return { kid: header.kid };
}

/**
 * Returns whether a JWK is published for signature verification.
 *
 * Absent `use` is treated as a signing key. `use: "enc"` is not.
 *
 * @param key - A JWKS key.
 * @returns Whether the key may verify a `jwtChain`.
 */
function isSigningKey(key: Jwk): boolean {
  return key.use === undefined || key.use === 'sig';
}

/**
 * Selects the Ed25519 signing key whose `kid` matches the JWT header.
 *
 * @param keys - The issuer JWKS keys.
 * @param kid - The JWT header `kid`.
 * @returns The matching Ed25519 signing key.
 * @throws When no usable signing key matches.
 */
function selectSigningKey(keys: Jwk[], kid: string): Jwk {
  if (keys.length === 0) {
    throw new Error(
      `UKYC: JWKS contained no keys to verify jwtChain kid "${kid}".`,
    );
  }

  const matches = keys.filter((key) => key.kid === kid);
  const signingKey = matches.find(isSigningKey);
  if (!signingKey) {
    if (matches.length > 0) {
      const uses = matches.map((key) => String(key.use)).join(', ');
      throw new Error(
        `UKYC: JWKS key ${kid} is not a signing key (use=${uses}).`,
      );
    }
    throw new Error(`UKYC: no JWKS key matches jwtChain kid "${kid}".`);
  }
  if (signingKey.kty !== 'OKP' || signingKey.crv !== 'Ed25519') {
    throw new Error(
      `UKYC: JWKS key ${signingKey.kid} is not an Ed25519 OKP key (kty=${signingKey.kty}, crv=${signingKey.crv}).`,
    );
  }
  return signingKey;
}

/**
 * Decodes a base64url signature or JWK coordinate.
 *
 * @param value - The base64url text.
 * @param message - Error message when decoding fails.
 * @returns The decoded bytes.
 * @throws When `value` is not base64url.
 */
function decodeKeyMaterial(value: string, message: string): Uint8Array {
  try {
    return base64UrlToBytes(value);
  } catch (error) {
    throw new Error(message, { cause: error });
  }
}

/**
 * Rejects key material whose length cannot be an Ed25519 input.
 *
 * Length is checked before `@noble/curves` so a short signature or public key
 * becomes an `Error` instead of a curve exception.
 *
 * @param bytes - The decoded bytes.
 * @param expected - The required length.
 * @param message - Error message when the length is wrong.
 * @throws When `bytes.length` is not `expected`.
 */
function assertByteLength(
  bytes: Uint8Array,
  expected: number,
  message: string,
): void {
  if (bytes.length !== expected) {
    throw new Error(`${message} (got ${bytes.length}).`);
  }
}

/**
 * Reads the verified payload and requires the attested public key and nonce.
 *
 * @param segment - The base64url-encoded payload segment.
 * @returns The attested session server public key and nonce.
 * @throws When the payload is missing those fields.
 */
function readJwtPayload(segment: string): JwtChainPayload {
  const payload = decodeJsonSegment(segment, 'payload');
  if (
    !isRecord(payload) ||
    !isNonEmptyString(payload.sessionServerPublicKeyX) ||
    !isNonEmptyString(payload.nonce)
  ) {
    throw new Error(
      'UKYC: jwtChain payload is missing sessionServerPublicKeyX or nonce.',
    );
  }
  return {
    sessionServerPublicKeyX: payload.sessionServerPublicKeyX,
    nonce: payload.nonce,
  };
}

/**
 * Splits a compact JWT into its three segments.
 *
 * @param jwtChain - The compact-serialized JWT.
 * @returns The header, payload, and signature segments.
 * @throws When `jwtChain` is not three non-empty segments.
 */
function splitCompactJwt(jwtChain: string): [string, string, string] {
  const segments = jwtChain.split('.');
  if (
    segments.length !== 3 ||
    segments.some((segment) => segment.length === 0)
  ) {
    throw new Error(
      'UKYC: jwtChain is not a well-formed JWT (expected 3 segments).',
    );
  }
  return [segments[0], segments[1], segments[2]];
}

/**
 * Verifies `jwtChain` against `keys`: matches the JWT header `kid` to a
 * published Ed25519 signing key and checks the EdDSA signature over the
 * `header.payload` input. Returns the decoded, verified payload.
 *
 * @param keys - The issuer JWKS keys used to verify the chain.
 * @param jwtChain - The compact-serialized EdDSA JWT from an encryption schema.
 * @returns The verified JWT payload.
 * @throws When the token, key, or signature is rejected.
 */
export function verifyJwtChain(keys: Jwk[], jwtChain: string): JwtChainPayload {
  const [headerSegment, payloadSegment, signatureSegment] =
    splitCompactJwt(jwtChain);
  const { kid } = readJwtHeader(headerSegment);
  const jwk = selectSigningKey(keys, kid);

  const signature = decodeKeyMaterial(
    signatureSegment,
    'UKYC: failed to decode jwtChain signature.',
  );
  const publicKey = decodeKeyMaterial(
    jwk.x,
    `UKYC: failed to decode JWKS key ${jwk.kid}.`,
  );
  assertByteLength(
    publicKey,
    ED25519_PUBLIC_KEY_BYTES,
    `UKYC: JWKS key ${jwk.kid} public key must be ${ED25519_PUBLIC_KEY_BYTES} bytes`,
  );
  assertByteLength(
    signature,
    ED25519_SIGNATURE_BYTES,
    `UKYC: jwtChain signature must be ${ED25519_SIGNATURE_BYTES} bytes`,
  );

  const isValid = ed25519.verify(
    signature,
    new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
    publicKey,
  );
  if (!isValid) {
    throw new Error(
      'UKYC: jwtChain signature verification failed against JWKS.',
    );
  }

  return readJwtPayload(payloadSegment);
}

/**
 * The encryption-schema fields needed to confirm the attested session server
 * public key.
 */
export type JwtChainEncryptionSchema = {
  jwtChain: string;
  serverPublicKey: { x: string };
};

/**
 * Confirms that an encryption schema's `serverPublicKey.x` matches the
 * `sessionServerPublicKeyX` attested inside its verified `jwtChain`. Rejects
 * a key that was swapped out-of-band after the chain was signed.
 *
 * @param keys - The issuer JWKS used to verify the chain (idOS enclave for
 * `encryptionDataKey`, idOS relay for `ukycCapabilityToken`).
 * @param schema - The encryption schema returned by session creation.
 * @throws When the chain does not verify or the attested public key does not
 * match `schema.serverPublicKey.x`.
 */
export function assertAttestedServerPublicKey(
  keys: Jwk[],
  schema: JwtChainEncryptionSchema,
): void {
  const jwtChainPayload = verifyJwtChain(keys, schema.jwtChain);
  if (jwtChainPayload.sessionServerPublicKeyX !== schema.serverPublicKey.x) {
    throw new Error(
      'UKYC: sessionServerPublicKey does not match the verified jwtChain payload (sessionServerPublicKeyX).',
    );
  }
}
