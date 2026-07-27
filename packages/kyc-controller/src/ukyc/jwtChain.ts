import { ed25519 } from '@noble/curves/ed25519';
import { bytesToString } from '@metamask/utils';

import { base64UrlToBytes } from './encoding';

/**
 * Verifies the `jwtChain` returned by the Fractal encryption service against
 * its published JWKS.
 *
 * The signature check is done with `@noble/curves` (rather than WebCrypto
 * `subtle`) because not every MetaMask runtime exposes a `subtle`
 * implementation for Ed25519; JWT parsing is a plain base64url/JSON decode, so
 * no `jose` dependency is required.
 */

/**
 * A single Ed25519 (OKP) JSON Web Key from the Fractal JWKS.
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
 * out-of-band by `getWrappingKey` was not tampered with.
 */
export type JwtChainPayload = {
  sessionServerPublicKeyX: string;
  nonce: string;
};

/**
 * The protected header of a compact JWT.
 */
type JwtHeader = {
  alg?: string;
  kid?: string;
};

/**
 * Decodes a base64url JWT segment into a parsed JSON object.
 *
 * @param segment - The base64url-encoded segment.
 * @param label - Human-readable segment name for error messages.
 * @returns The parsed JSON object.
 */
function decodeJsonSegment<Type>(segment: string, label: string): Type {
  try {
    return JSON.parse(bytesToString(base64UrlToBytes(segment))) as Type;
  } catch (error) {
    throw new Error(`UKYC: failed to decode jwtChain ${label}: ${String(error)}`);
  }
}

/**
 * Verifies `jwtChain` against `keys`: matches the JWT header `kid` to a
 * published Ed25519 signing key and checks the EdDSA signature over the
 * `header.payload` input. Returns the decoded, verified payload.
 *
 * @param keys - The JWKS keys published by the Fractal encryption service.
 * @param jwtChain - The compact-serialized EdDSA JWT from `getWrappingKey`.
 * @returns The verified JWT payload.
 */
export function verifyJwtChain(
  keys: Jwk[],
  jwtChain: string,
): JwtChainPayload {
  const [headerSegment, payloadSegment, signatureSegment] = jwtChain.split('.');
  if (!headerSegment || !payloadSegment || !signatureSegment) {
    throw new Error(
      'UKYC: jwtChain is not a well-formed JWT (expected 3 segments).',
    );
  }

  const header = decodeJsonSegment<JwtHeader>(headerSegment, 'header');
  if (header.alg !== 'EdDSA') {
    throw new Error(
      `UKYC: unsupported jwtChain alg "${String(
        header.alg,
      )}" (expected EdDSA).`,
    );
  }

  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new Error(
      `UKYC: no JWKS key matches jwtChain kid "${String(header.kid)}".`,
    );
  }
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519') {
    throw new Error(
      `UKYC: JWKS key ${jwk.kid} is not an Ed25519 OKP key (kty=${jwk.kty}, crv=${jwk.crv}).`,
    );
  }

  const isValid = ed25519.verify(
    base64UrlToBytes(signatureSegment),
    new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
    base64UrlToBytes(jwk.x),
  );
  if (!isValid) {
    throw new Error(
      'UKYC: jwtChain signature verification failed against JWKS.',
    );
  }

  return decodeJsonSegment<JwtChainPayload>(payloadSegment, 'payload');
}
