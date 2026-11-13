import { describe, expect, it } from 'vitest';

import { AuthConnection } from './constants.js';
import { parseSeedlessAuthData } from './seedless-auth-data.js';
import type { SeedlessAuthData } from './types.js';

const VALID: SeedlessAuthData = {
  idTokens: ['id-token'],
  accessToken: 'access-token',
  metadataAccessToken: 'metadata-access-token',
  refreshToken: 'refresh-token',
  revokeToken: 'revoke-token',
  authConnection: AuthConnection.Google,
  authConnectionId: 'auth-connection-id',
  groupedAuthConnectionId: 'grouped-auth-connection-id',
  userId: 'user@example.com',
  socialLoginEmail: 'user@example.com',
};

describe('parseSeedlessAuthData', () => {
  it('returns the documented fields and drops unknown ones', () => {
    expect(
      parseSeedlessAuthData({ ...VALID, skipLock: true, aal: 2 }),
    ).toStrictEqual(VALID);
  });

  it('omits optional fields that are absent and keeps empty optional strings', () => {
    const {
      revokeToken: _revokeToken,
      groupedAuthConnectionId: _groupedAuthConnectionId,
      socialLoginEmail: _socialLoginEmail,
      ...required
    } = VALID;

    expect(parseSeedlessAuthData(required)).toStrictEqual(required);
    expect(
      parseSeedlessAuthData({
        ...required,
        groupedAuthConnectionId: '',
        socialLoginEmail: '',
      }),
    ).toStrictEqual({
      ...required,
      groupedAuthConnectionId: '',
      socialLoginEmail: '',
    });
  });

  it.each([
    ['a non-object', 'tokens'],
    ['null', null],
    ['a missing id token list', { ...VALID, idTokens: undefined }],
    ['an empty id token list', { ...VALID, idTokens: [] }],
    ['an empty id token', { ...VALID, idTokens: [''] }],
    ['a non-string id token', { ...VALID, idTokens: [1] }],
    ['an empty access token', { ...VALID, accessToken: '' }],
    ['a missing metadata access token', { ...VALID, metadataAccessToken: 1 }],
    ['an empty refresh token', { ...VALID, refreshToken: '' }],
    ['an empty auth connection id', { ...VALID, authConnectionId: '' }],
    ['a missing user id', { ...VALID, userId: undefined }],
    ['a non-string auth connection', { ...VALID, authConnection: 1 }],
    [
      'an unsupported auth connection',
      { ...VALID, authConnection: 'facebook' },
    ],
    ['an empty revoke token', { ...VALID, revokeToken: '' }],
    ['a non-string revoke token', { ...VALID, revokeToken: 1 }],
    [
      'a non-string grouped auth connection id',
      { ...VALID, groupedAuthConnectionId: 1 },
    ],
    ['a non-string social login email', { ...VALID, socialLoginEmail: 1 }],
  ])('rejects %s', (_name, value) => {
    expect(parseSeedlessAuthData(value)).toBeUndefined();
  });
});
