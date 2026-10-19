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
  it('decodes approval claims', () => {
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

  it('decodes an approval without an identifiers hash', () => {
    expect(
      decodeAuthControllerToken(
        tokenWithPayload(
          JSON.stringify({
            sub: 'profile-1',
            exp: 1,
            ext: { request_hash: '0xrequest', aal: 1 },
          }),
        ),
      ),
    ).toStrictEqual({
      sub: 'profile-1',
      exp: 1,
      ext: {
        requestHash: '0xrequest',
        aal: 1,
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
    ['sub is missing', { sub: undefined }],
    ['sub is not a string', { sub: 1 }],
    ['exp is not a number', { exp: '1' }],
    ['request_hash is missing', { ext: { aal: 1 } }],
    ['aal is missing', { ext: { request_hash: '0x' } }],
    ['aal is not a number', { ext: { request_hash: '0x', aal: '2' } }],
    [
      'identifiers_hash is not a string',
      {
        ext: { request_hash: '0x', aal: 1, identifiers_hash: 1 },
      },
    ],
  ])('returns undefined when %s', (_name, claims) => {
    expect(
      decodeAuthControllerToken(
        tokenWithPayload(JSON.stringify({ ...VALID_CLAIMS, ...claims })),
      ),
    ).toBeUndefined();
  });
});
