import { decodeJwtPayload } from './jwt.js';

function toBase64Url(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/[=]+$/u, '');
}

describe('decodeJwtPayload()', () => {
  it('decodes a base64url payload', () => {
    const payload = {
      sub: 'profile-id',
      aal: 2,
      amr: 'passkey',
      exp: 2_000_000_000,
    };
    const token = `${toBase64Url({ alg: 'none' })}.${toBase64Url(
      payload,
    )}.signature`;

    expect(decodeJwtPayload(token)).toStrictEqual(payload);
  });

  it.each(['', 'one.part', 'one..three', 'one.!!!.three'])(
    'rejects malformed token %s',
    (token) => {
      expect(() => decodeJwtPayload(token)).toThrow(
        /Invalid JWT|Unexpected|JSON|invalid characters/u,
      );
    },
  );
});
