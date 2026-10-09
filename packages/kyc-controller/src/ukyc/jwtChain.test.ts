import { stringToBytes } from '@metamask/utils';
import { ed25519 } from '@noble/curves/ed25519';

import { toBase64Url } from '../encoding.js';
import type { UkycJwtErrorCode } from './errors.js';
import { UkycJwtVerificationError } from './errors.js';
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
  header?: unknown;
  payload?: unknown;
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

/**
 * Runs verification and returns the thrown value.
 *
 * @param keys - JWKS keys passed to verification.
 * @param jwt - The compact JWT to verify.
 * @returns The thrown value.
 */
function captureJwtError(keys: Jwk[], jwt: string): unknown {
  try {
    verifyJwtChain(keys, jwt);
  } catch (error) {
    return error;
  }
  throw new Error('expected verifyJwtChain to throw');
}

/**
 * Asserts that verifying `jwt` throws a {@link UkycJwtVerificationError}.
 *
 * @param keys - JWKS keys passed to verification.
 * @param jwt - The compact JWT to verify.
 * @param code - Expected error code.
 * @param message - Expected message pattern.
 * @returns The thrown error.
 */
function expectJwtError(
  keys: Jwk[],
  jwt: string,
  code: UkycJwtErrorCode,
  message: RegExp,
): UkycJwtVerificationError {
  const error = captureJwtError(keys, jwt);
  expect(error).toBeInstanceOf(UkycJwtVerificationError);
  const jwtError = error as UkycJwtVerificationError;
  expect(jwtError.code).toBe(code);
  expect(jwtError.message).toMatch(message);
  return jwtError;
}

describe('UKYC verifyJwtChain', () => {
  it('returns the payload for a validly-signed jwtChain', () => {
    expect(verifyJwtChain([JWK], buildJwt())).toStrictEqual(PAYLOAD);
  });

  it('accepts a signing key whose use is sig, skipping an encryption key with the same kid', () => {
    expect(
      verifyJwtChain(
        [
          { ...JWK, use: 'enc' },
          { ...JWK, use: 'sig' },
        ],
        buildJwt(),
      ),
    ).toStrictEqual(PAYLOAD);
  });

  it('rejects a jwtChain that is not three segments', () => {
    expect(
      expectJwtError(
        [JWK],
        'only.two',
        'malformed_jwt',
        /not a well-formed JWT/u,
      ),
    ).toBeInstanceOf(Error);
  });

  it('rejects a jwtChain with an empty segment', () => {
    const [headerSegment, , signatureSegment] = buildJwt().split('.');
    expect(
      expectJwtError(
        [JWK],
        `${headerSegment}..${signatureSegment}`,
        'malformed_jwt',
        /not a well-formed JWT/u,
      ),
    ).toBeInstanceOf(Error);
  });

  it('rejects a jwtChain header that is not an object', () => {
    expect(
      expectJwtError(
        [JWK],
        buildJwt({ header: null }),
        'malformed_jwt',
        /header must be an object/u,
      ),
    ).toBeInstanceOf(Error);
    expect(
      expectJwtError(
        [JWK],
        buildJwt({ header: 'nope' }),
        'malformed_jwt',
        /header must be an object/u,
      ),
    ).toBeInstanceOf(Error);
  });

  it('rejects a non-EdDSA algorithm', () => {
    expect(
      expectJwtError(
        [JWK],
        buildJwt({ header: { alg: 'RS256', kid: KID } }),
        'unsupported_algorithm',
        /expected EdDSA/u,
      ),
    ).toBeInstanceOf(Error);
  });

  it('rejects a jwtChain header that is missing kid', () => {
    expect(
      expectJwtError(
        [JWK],
        buildJwt({ header: { alg: 'EdDSA' } }),
        'malformed_jwt',
        /missing kid/u,
      ),
    ).toBeInstanceOf(Error);
    expect(
      expectJwtError(
        [JWK],
        buildJwt({ header: { alg: 'EdDSA', kid: '' } }),
        'malformed_jwt',
        /missing kid/u,
      ),
    ).toBeInstanceOf(Error);
  });

  it('rejects an empty JWKS', () => {
    expect(
      expectJwtError([], buildJwt(), 'unknown_key', /contained no keys/u),
    ).toBeInstanceOf(Error);
  });

  it('rejects when no JWKS key matches the kid', () => {
    expect(
      expectJwtError(
        [JWK],
        buildJwt({ header: { alg: 'EdDSA', kid: 'other' } }),
        'unknown_key',
        /no JWKS key matches/u,
      ),
    ).toBeInstanceOf(Error);
  });

  it('rejects a JWKS key that is not a signing key', () => {
    expect(
      expectJwtError(
        [{ ...JWK, use: 'enc' }],
        buildJwt(),
        'invalid_key',
        /not a signing key/u,
      ),
    ).toBeInstanceOf(Error);
  });

  it('rejects a JWKS key that is not an Ed25519 OKP key', () => {
    expect(
      expectJwtError(
        [{ ...JWK, kty: 'RSA' }],
        buildJwt(),
        'invalid_key',
        /is not an Ed25519 OKP key/u,
      ),
    ).toBeInstanceOf(Error);
    expect(
      expectJwtError(
        [{ ...JWK, crv: 'X25519' }],
        buildJwt(),
        'invalid_key',
        /is not an Ed25519 OKP key/u,
      ),
    ).toBeInstanceOf(Error);
  });

  it('rejects a signature that is not valid base64url', () => {
    const [headerSegment, payloadSegment] = buildJwt().split('.');
    const error = expectJwtError(
      [JWK],
      `${headerSegment}.${payloadSegment}.***`,
      'invalid_signature',
      /failed to decode jwtChain signature/u,
    );
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('rejects a JWKS public key that is not valid base64url', () => {
    const error = expectJwtError(
      [{ ...JWK, x: '***' }],
      buildJwt(),
      'invalid_key',
      /failed to decode JWKS key/u,
    );
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('rejects a public key or signature with the wrong length', () => {
    expect(
      expectJwtError(
        [{ ...JWK, x: toBase64Url(new Uint8Array([1, 2, 3, 4])) }],
        buildJwt(),
        'invalid_key',
        /public key must be 32 bytes/u,
      ),
    ).toBeInstanceOf(Error);

    const [headerSegment, payloadSegment] = buildJwt().split('.');
    expect(
      expectJwtError(
        [JWK],
        `${headerSegment}.${payloadSegment}.${toBase64Url(new Uint8Array([1, 2, 3]))}`,
        'invalid_signature',
        /signature must be 64 bytes/u,
      ),
    ).toBeInstanceOf(Error);
  });

  it('rejects a tampered signature', () => {
    expect(
      expectJwtError(
        [JWK],
        buildJwt({ tamper: true }),
        'invalid_signature',
        /signature verification failed/u,
      ),
    ).toBeInstanceOf(Error);
  });

  it('rejects a malformed (non-JSON) header segment', () => {
    const jwt = `not-json.${toBase64Url(
      stringToBytes(JSON.stringify(PAYLOAD)),
    )}.sig`;

    const error = expectJwtError(
      [JWK],
      jwt,
      'malformed_jwt',
      /failed to decode jwtChain header/u,
    );
    expect(error.cause).toBeInstanceOf(Error);
  });

  it.each([
    ['a string', 'nope'],
    ['null', null],
    ['an empty object', {}],
    ['an empty public key', { sessionServerPublicKeyX: '', nonce: 'n' }],
    ['a non-string nonce', { sessionServerPublicKeyX: 'x', nonce: 1 }],
    ['an empty nonce', { sessionServerPublicKeyX: 'x', nonce: '' }],
  ])('rejects a jwtChain payload that is %s', (_label, payload) => {
    expect(
      expectJwtError(
        [JWK],
        buildJwt({ payload }),
        'invalid_payload',
        /missing sessionServerPublicKeyX or nonce/u,
      ),
    ).toBeInstanceOf(Error);
  });
});

describe('UKYC assertAttestedServerPublicKey', () => {
  const schema = {
    jwtChain: buildJwt(),
    serverPublicKey: { x: PAYLOAD.sessionServerPublicKeyX },
  };

  it('accepts a schema whose public key matches the attested jwtChain payload', () => {
    expect(() => assertAttestedServerPublicKey([JWK], schema)).not.toThrow();
  });

  it('rejects a schema whose public key does not match the attested jwtChain payload', () => {
    const tampered = {
      ...schema,
      serverPublicKey: { x: 'tampered' },
    };
    let caught: unknown;
    expect(() => {
      try {
        assertAttestedServerPublicKey([JWK], tampered);
      } catch (error) {
        caught = error;
        throw error;
      }
    }).toThrow(UkycJwtVerificationError);
    expect(caught).toMatchObject({ code: 'public_key_mismatch' });
    expect((caught as Error).message).toMatch(
      /sessionServerPublicKey does not match/u,
    );
  });
});
