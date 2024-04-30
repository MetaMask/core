import { getEnvUrls, Env } from './env';

// We are mocking fields with ANY to test runtime safety.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockVariable = any;

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
