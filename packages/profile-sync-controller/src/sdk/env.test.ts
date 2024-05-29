import type { MockVariable } from './__fixtures__/test-utils';
import { getEnvUrls, Env, Platform, getOidcClientId } from './env';

describe('getEnvUrls', () => {
  it('should return URLs if given a valid environment', () => {
    const urls = getEnvUrls(Env.PRD);
    expect(urls.authApiUrl).toBeDefined();
    expect(urls.oidcApiUrl).toBeDefined();
    expect(urls.userStorageApiUrl).toBeDefined();
  });

  it('should throw an error if the environment is invalid', () => {
    expect(() => getEnvUrls('invalid_env' as MockVariable)).toThrow(
      'invalid environment configuration',
    );
  });
});

describe('getOidcClientId', () => {
  it('should return client id if given a valid environment and platform', () => {
    const clientId = getOidcClientId(Env.PRD, Platform.EXTENSION);
    expect(clientId).toBeDefined();
    expect(clientId).toBe('1132f10a-b4e5-4390-a5f2-d9c6022db564');
  });

  it('should throw an error if the environment is invalid', () => {
    expect(() =>
      getOidcClientId('invalid_env' as MockVariable, Platform.EXTENSION),
    ).toThrow('invalid env invalid_env: cannot determine oidc client id');
  });

  it('should throw an error if the platform is invalid', () => {
    expect(() =>
      getOidcClientId(Env.DEV, 'invalid_platform' as MockVariable),
    ).toThrow(
      'invalid env dev and platform invalid_platform combination: cannot determine oidc client id',
    );
  });
});
