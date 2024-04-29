import { getEnvUrls, Env } from './env';

// We are mocking fields with ANY to test runtime safety.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockVariable = any;

describe('getEnvUrls', () => {
  it('should return correct URLs for DEV environment', () => {
    const urls = getEnvUrls(Env.DEV);
    expect(urls).toStrictEqual({
      authApiUrl: 'https://authentication.dev-api.cx.metamask.io',
      oidcApiUrl: 'https://oidc.dev-api.cx.metamask.io',
      userStorageApiUrl: 'https://user-storage.dev-api.cx.metamask.io',
    });
  });

  it('should return correct URLs for UAT environment', () => {
    const urls = getEnvUrls(Env.UAT);
    expect(urls).toStrictEqual({
      authApiUrl: 'https://authentication.uat-api.cx.metamask.io',
      oidcApiUrl: 'https://oidc.uat-api.cx.metamask.io',
      userStorageApiUrl: 'https://user-storage.uat-api.cx.metamask.io',
    });
  });

  it('should return correct URLs for PRD environment', () => {
    const urls = getEnvUrls(Env.PRD);
    expect(urls).toStrictEqual({
      authApiUrl: 'https://authentication.api.cx.metamask.io',
      oidcApiUrl: 'https://oidc.api.cx.metamask.io',
      userStorageApiUrl: 'https://user-storage.api.cx.metamask.io',
    });
  });

  it('should throw an error if the environment is invalid', () => {
    expect(() => getEnvUrls('invalid_env' as MockVariable)).toThrow(
      'invalid environment configuration',
    );
  });
});
