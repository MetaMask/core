import { isConfigRegistryApiEnabled } from './feature-flags';

describe('isConfigRegistryApiEnabled', () => {
  it('returns true when configRegistryApiEnabled is true', () => {
    expect(
      isConfigRegistryApiEnabled({
        remoteFeatureFlags: { configRegistryApiEnabled: true },
        cacheTimestamp: 0,
      }),
    ).toBe(true);
  });

  it('returns false when configRegistryApiEnabled is false', () => {
    expect(
      isConfigRegistryApiEnabled({
        remoteFeatureFlags: { configRegistryApiEnabled: false },
        cacheTimestamp: 0,
      }),
    ).toBe(false);
  });

  it('returns false when configRegistryApiEnabled is missing', () => {
    expect(
      isConfigRegistryApiEnabled({
        remoteFeatureFlags: {},
        cacheTimestamp: 0,
      }),
    ).toBe(false);
  });

  it('returns false when flag value is not a boolean', () => {
    expect(
      isConfigRegistryApiEnabled({
        remoteFeatureFlags: {
          configRegistryApiEnabled: 'true' as unknown as boolean,
        },
        cacheTimestamp: 0,
      }),
    ).toBe(false);
  });
});
