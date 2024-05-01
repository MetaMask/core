import type { MockVariable } from './__fixtures__/test-utils';
import { getEnvUrls, Env } from './env';

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
