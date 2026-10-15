import { stringToBytes } from '@metamask/utils';
import { ed25519 } from '@noble/curves/ed25519';
import { describe, expect, it } from 'vitest';

import { toBase64Url } from '../encoding.js';
import type { Jwk } from './jwtChain.js';
import { assertAttestedServerPublicKey, verifyJwtChain } from './jwtChain.js';

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
  it('returns the payload for a validly-signed jwtChain', async () => {
    expect(await verifyJwtChain([JWK], buildJwt())).toStrictEqual(PAYLOAD);
  });

  it('rejects a jwtChain that is not three segments', async () => {
    await expect(verifyJwtChain([JWK], 'only.two')).rejects.toThrow(
      'not a well-formed JWT',
    );
  });

  it('rejects a non-EdDSA algorithm', async () => {
    const jwt = buildJwt({ header: { alg: 'RS256', kid: KID } });

    await expect(verifyJwtChain([JWK], jwt)).rejects.toThrow('expected EdDSA');
  });

  it('rejects when no JWKS key matches the kid', async () => {
    const jwt = buildJwt({ header: { alg: 'EdDSA', kid: 'other' } });

    await expect(verifyJwtChain([JWK], jwt)).rejects.toThrow(
      'no JWKS key matches',
    );
  });

  it('rejects a JWKS key that is not an Ed25519 OKP key', async () => {
    const badJwk: Jwk = { ...JWK, crv: 'X25519' };

    await expect(verifyJwtChain([badJwk], buildJwt())).rejects.toThrow(
      'is not an Ed25519 OKP key',
    );
  });

  it('rejects a tampered signature', async () => {
    await expect(
      verifyJwtChain([JWK], buildJwt({ tamper: true })),
    ).rejects.toThrow('signature verification failed');
  });

  it('rejects a malformed (non-JSON) header segment', async () => {
    const jwt = `not-json.${toBase64Url(
      stringToBytes(JSON.stringify(PAYLOAD)),
    )}.sig`;

    await expect(verifyJwtChain([JWK], jwt)).rejects.toThrow(
      'failed to decode jwtChain header',
    );
  });
});

describe('UKYC assertAttestedServerPublicKey', () => {
  const schema = {
    jwtChain: buildJwt(),
    serverPublicKey: { x: PAYLOAD.sessionServerPublicKeyX },
  };

  it('accepts a schema whose public key matches the attested jwtChain payload', async () => {
    expect(
      await assertAttestedServerPublicKey([JWK], schema),
    ).toBeUndefined();
  });

  it('rejects a schema whose public key does not match the attested jwtChain payload', async () => {
    await expect(
      assertAttestedServerPublicKey([JWK], {
        ...schema,
        serverPublicKey: { x: 'tampered' },
      }),
    ).rejects.toThrow('sessionServerPublicKey does not match');
  });
});
