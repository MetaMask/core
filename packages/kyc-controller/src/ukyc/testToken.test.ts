import { ed25519 } from '@noble/curves/ed25519';
import { hexToBytes, stringToBytes } from '@metamask/utils';

import {
  UKYC_CAPABILITY_AUTH_SCHEME,
  UKYC_STORAGE_ACCESS_TOKEN_AUDIENCE,
  UKYC_KWIL_AUDIENCE,
} from './constants.js';
import { canonicalizeJson } from './storageAccessToken.js';
import { mintUkycTestToken } from './testToken.js';
import { base64UrlToBytes } from '../encoding.js';

// A fixed 32-byte secret (all 0x42), as hex, so storage_id and keys are stable.
const SECRET_HEX = '42'.repeat(32);
const ISSUED_AT = new Date('2026-07-07T00:00:00Z');
const EXPIRES_AT = new Date('2026-07-07T04:00:00Z');

/**
 * Splits an `AccessToken <creds>` header and decodes the credentials into the
 * envelope, the way UKYC Storage does on the wire.
 *
 * @param header - The full Authorization header value.
 * @returns The decoded token envelope.
 */
function decodeHeader(header: string): {
  payload: Record<string, unknown>;
  signature: string;
} {
  const [scheme, creds] = header.split(' ');
  expect(scheme).toBe(UKYC_CAPABILITY_AUTH_SCHEME);
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(creds)));
}

describe('UKYC mintUkycTestToken', () => {
  it('mints a client token from a hex secret with the derived identifiers', () => {
    const result = mintUkycTestToken({
      localUserSecret: SECRET_HEX,
      operations: ['read', 'write'],
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    });

    expect(result.localUserSecret).toBe(SECRET_HEX);
    expect(result.token.payload).toMatchObject({
      version: 1,
      aud: [UKYC_STORAGE_ACCESS_TOKEN_AUDIENCE, UKYC_KWIL_AUDIENCE],
      operations: ['read', 'write'],
      presenter: 'client',
      issued_at: '2026-07-07T00:00:00Z',
      expires_at: '2026-07-07T04:00:00Z',
    });
    // storage_id / signing_public_key are the client-derived values, not
    // anything a server fills in.
    expect(result.storageId).toBe(result.token.payload.storage_id);
    expect(result.signingPublicKey).toBe(
      result.token.payload.signing_public_key,
    );
    expect(result.token.payload).not.toHaveProperty('session_id');
  });

  it('produces an Authorization header whose signature verifies (as UKYC Storage checks it)', () => {
    const result = mintUkycTestToken({
      localUserSecret: SECRET_HEX,
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    });

    const envelope = decodeHeader(result.authorizationHeader);
    const message = stringToBytes(canonicalizeJson(envelope.payload));
    const signature = base64UrlToBytes(envelope.signature);
    const publicKey = base64UrlToBytes(result.signingPublicKey);

    expect(ed25519.verify(signature, message, publicKey)).toBe(true);
  });

  it('defaults operations to ["read"] and expiry to issued_at + 4h', () => {
    const result = mintUkycTestToken({
      localUserSecret: SECRET_HEX,
      issuedAt: ISSUED_AT,
    });

    expect(result.token.payload.operations).toStrictEqual(['read']);
    expect(result.token.payload.issued_at).toBe('2026-07-07T00:00:00Z');
    expect(result.token.payload.expires_at).toBe('2026-07-07T04:00:00Z');
  });

  it('accepts a raw byte secret and is deterministic for the same inputs', () => {
    const secret = hexToBytes(SECRET_HEX);
    const params = {
      localUserSecret: secret,
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    };

    expect(mintUkycTestToken(params)).toStrictEqual(mintUkycTestToken(params));
  });

  it('generates a fresh random secret when none is supplied', () => {
    const result = mintUkycTestToken();

    // 32 bytes hex-encoded.
    expect(result.localUserSecret).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.token.payload.operations).toStrictEqual(['read']);
    expect(
      result.authorizationHeader.startsWith(`${UKYC_CAPABILITY_AUTH_SCHEME} `),
    ).toBe(true);
  });

  it('binds session_id for a Relay-presented token', () => {
    const result = mintUkycTestToken({
      localUserSecret: SECRET_HEX,
      operations: ['read', 'write'],
      presenter: 'idos-relay',
      sessionId: 'session-1',
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    });

    expect(result.token.payload.presenter).toBe('idos-relay');
    expect(result.token.payload.session_id).toBe('session-1');
  });

  it('rejects a Relay presenter without a session_id', () => {
    expect(() =>
      mintUkycTestToken({
        localUserSecret: SECRET_HEX,
        presenter: 'idos-relay',
        issuedAt: ISSUED_AT,
        expiresAt: EXPIRES_AT,
      }),
    ).toThrow('requires a session_id');
  });
});
