import { stringToBytes } from '@metamask/utils';
import { ed25519 } from '@noble/curves/ed25519';

import { toBase64Url } from './encoding.js';
import type { Jwk } from './jwtChain.js';
import { verifyJwtChain } from './jwtChain.js';

const KID = 'key-1';
const PAYLOAD = { sessionServerPublicKeyX: 'spk-x', nonce: 'nonce-1' };

const SIGNING_PRIVATE_KEY = ed25519.utils.randomSecretKey();
const SIGNING_PUBLIC_KEY = ed25519.getPublicKey(SIGNING_PRIVATE_KEY);

const JWK: Jwk = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: toBase64Url(SIGNING_PUBLIC_KEY),
  kid: KID,
};

/**
 * Builds a compact EdDSA JWT signed with the module's signing key.
 *
 * @param options - Overrides.
 * @param options.header - The protected header (defaults to a valid EdDSA one).
 * @param options.payload - The payload (defaults to {@link PAYLOAD}).
 * @param options.privateKey - The signing key (defaults to the module key).
 * @param options.tamper - When true, corrupts the signature.
 * @returns The compact-serialized JWT.
 */
function buildJwt({
  header = { alg: 'EdDSA', kid: KID },
  payload = PAYLOAD,
  privateKey = SIGNING_PRIVATE_KEY,
  tamper = false,
}: {
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  privateKey?: Uint8Array;
  tamper?: boolean;
} = {}): string {
  const headerSegment = toBase64Url(stringToBytes(JSON.stringify(header)));
  const payloadSegment = toBase64Url(stringToBytes(JSON.stringify(payload)));
  const signature = ed25519.sign(
    new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
    privateKey,
  );
  if (tamper) {
    signature[0] = signature[0] === 0 ? 1 : 0;
  }
  return `${headerSegment}.${payloadSegment}.${toBase64Url(signature)}`;
}

describe('UKYC verifyJwtChain', () => {
  it('returns the payload for a validly-signed jwtChain', () => {
    expect(verifyJwtChain([JWK], buildJwt())).toStrictEqual(PAYLOAD);
  });

  it('rejects a jwtChain that is not three segments', () => {
    expect(() => verifyJwtChain([JWK], 'only.two')).toThrow(
      'not a well-formed JWT',
    );
  });

  it('rejects a non-EdDSA algorithm', () => {
    const jwt = buildJwt({ header: { alg: 'RS256', kid: KID } });

    expect(() => verifyJwtChain([JWK], jwt)).toThrow('expected EdDSA');
  });

  it('rejects when no JWKS key matches the kid', () => {
    const jwt = buildJwt({ header: { alg: 'EdDSA', kid: 'other' } });

    expect(() => verifyJwtChain([JWK], jwt)).toThrow('no JWKS key matches');
  });

  it('rejects a JWKS key that is not an Ed25519 OKP key', () => {
    const badJwk: Jwk = { ...JWK, crv: 'X25519' };

    expect(() => verifyJwtChain([badJwk], buildJwt())).toThrow(
      'is not an Ed25519 OKP key',
    );
  });

  it('rejects a tampered signature', () => {
    expect(() => verifyJwtChain([JWK], buildJwt({ tamper: true }))).toThrow(
      'signature verification failed',
    );
  });

  it('rejects a malformed (non-JSON) header segment', () => {
    const jwt = `not-json.${toBase64Url(
      stringToBytes(JSON.stringify(PAYLOAD)),
    )}.sig`;

    expect(() => verifyJwtChain([JWK], jwt)).toThrow(
      'failed to decode jwtChain header',
    );
  });
});
