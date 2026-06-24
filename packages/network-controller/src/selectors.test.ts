import { getIsRpcFailoverForced } from './selectors';

describe('getIsRpcFailoverForced', () => {
  it('returns true when the flag is true', () => {
    const state = {
      remoteFeatureFlags: {
        corePlatformRpcFailoverForceEnabled: true,
      },
      cacheTimestamp: 0,
    };
    expect(getIsRpcFailoverForced(state as never)).toBe(true);
  });

  it('returns false when the flag is false', () => {
    const state = {
      remoteFeatureFlags: {
        corePlatformRpcFailoverForceEnabled: false,
      },
      cacheTimestamp: 0,
    };
    expect(getIsRpcFailoverForced(state as never)).toBe(false);
  });

  it('returns false when the flag is absent', () => {
    const state = { remoteFeatureFlags: {}, cacheTimestamp: 0 };
    expect(getIsRpcFailoverForced(state as never)).toBe(false);
  });
});
