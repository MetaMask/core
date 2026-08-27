import {
  getRampsClientIdentityHeaders,
  RAMPS_CLIENT_ENVIRONMENT_HEADER,
  RAMPS_CLIENT_PRODUCT_HEADER,
  RAMPS_CLIENT_VERSION_HEADER,
} from './client-identity.js';

describe('getRampsClientIdentityHeaders', () => {
  it('returns an empty object when no identity is provided', () => {
    expect(getRampsClientIdentityHeaders({})).toStrictEqual({});
  });

  it('omits empty string values', () => {
    expect(
      getRampsClientIdentityHeaders({
        clientProduct: '',
        clientVersion: '',
        clientEnvironment: '',
      }),
    ).toStrictEqual({});
  });

  it('includes only the fields that are set', () => {
    expect(
      getRampsClientIdentityHeaders({
        clientProduct: 'metamask-mobile',
        clientVersion: '8.9.0',
        clientEnvironment: 'rc',
      }),
    ).toStrictEqual({
      [RAMPS_CLIENT_PRODUCT_HEADER]: 'metamask-mobile',
      [RAMPS_CLIENT_VERSION_HEADER]: '8.9.0',
      [RAMPS_CLIENT_ENVIRONMENT_HEADER]: 'rc',
    });
  });
});
