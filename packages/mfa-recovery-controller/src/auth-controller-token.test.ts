import { bytesToBase64, stringToBytes } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import { decodeAuthControllerToken } from './auth-controller-token.js';

/**
 * Builds an unsigned compact JWT whose payload is the given raw JSON text.
 *
 * @param payloadJson - Raw JSON text for the payload segment.
 * @returns A compact token string.
 */
function tokenWithPayload(payloadJson: string): string {
  const payload = bytesToBase64(stringToBytes(payloadJson))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/[=]+$/u, '');
  return `header.${payload}.signature`;
}

const VALID_CLAIMS = {
  sub: 'profile-1',
  exp: 1_700_000_000,
  ext: {
    request_hash: '0xrequest',
    aal: 2,
    identifiers_hash: '0xidentifiers',
  },
};

describe('decodeAuthControllerToken', () => {
  it('decodes all claims when optional step-up bindings are present', () => {
    expect(
      decodeAuthControllerToken(tokenWithPayload(JSON.stringify(VALID_CLAIMS))),
    ).toStrictEqual({
      sub: 'profile-1',
      exp: 1_700_000_000,
      ext: {
        requestHash: '0xrequest',
        aal: 2,
        identifiersHash: '0xidentifiers',
      },
    });
  });

  it('decodes a token without optional aal or identifiers hash', () => {
    expect(
      decodeAuthControllerToken(
        tokenWithPayload(
          JSON.stringify({
            sub: 'profile-1',
            exp: 1,
            ext: { request_hash: '0xrequest' },
          }),
        ),
      ),
    ).toStrictEqual({
      sub: 'profile-1',
      exp: 1,
      ext: {
        requestHash: '0xrequest',
        aal: undefined,
        identifiersHash: undefined,
      },
    });
  });

  it('returns undefined for a non-string token', () => {
    expect(decodeAuthControllerToken(null)).toBeUndefined();
    expect(decodeAuthControllerToken(123)).toBeUndefined();
  });

  it('returns undefined for a token without a payload segment', () => {
    expect(decodeAuthControllerToken('header')).toBeUndefined();
  });

  it('returns undefined when the payload is not valid JSON', () => {
    expect(
      decodeAuthControllerToken(tokenWithPayload('{not json')),
    ).toBeUndefined();
  });

  it.each([
    ['null', 'null'],
    ['a string', '"claims"'],
    ['an array', '[]'],
  ])('returns undefined when the payload is %s', (_name, payloadJson) => {
    expect(
      decodeAuthControllerToken(tokenWithPayload(payloadJson)),
    ).toBeUndefined();
  });

  it('returns undefined when ext is missing or not an object', () => {
    expect(
      decodeAuthControllerToken(
        tokenWithPayload(JSON.stringify({ sub: 'profile-1', exp: 1 })),
      ),
    ).toBeUndefined();
    expect(
      decodeAuthControllerToken(
        tokenWithPayload(
          JSON.stringify({ sub: 'profile-1', exp: 1, ext: 'nope' }),
        ),
      ),
    ).toBeUndefined();
  });

  it.each([
    ['sub is missing', { exp: 1, ext: { request_hash: '0x' } }],
    ['sub is not a string', { sub: 1, exp: 1, ext: { request_hash: '0x' } }],
    [
      'exp is not a number',
      { sub: 'profile-1', exp: '1', ext: { request_hash: '0x' } },
    ],
    ['request_hash is missing', { sub: 'profile-1', exp: 1, ext: {} }],
    [
      'aal is not a number',
      {
        sub: 'profile-1',
        exp: 1,
        ext: { request_hash: '0x', aal: '2' },
      },
    ],
    [
      'identifiers_hash is not a string',
      {
        sub: 'profile-1',
        exp: 1,
        ext: { request_hash: '0x', identifiers_hash: 1 },
      },
    ],
  ])('returns undefined when %s', (_name, claims) => {
    expect(
      decodeAuthControllerToken(tokenWithPayload(JSON.stringify(claims))),
    ).toBeUndefined();
  });
});
