import { getIsRpcFailoverForced } from './selectors';

describe('getIsRpcFailoverForced', () => {
  it('returns true when the flag is true', () => {
    const state = {
      remoteFeatureFlags: {
        'core-platform-rpc-failover-force-enabled': true,
      },
      cacheTimestamp: 0,
    };
    expect(getIsRpcFailoverForced(state as never)).toBe(true);
  });

  it('returns false when the flag is false', () => {
    const state = {
      remoteFeatureFlags: {
        'core-platform-rpc-failover-force-enabled': false,
      },
      cacheTimestamp: 0,
    };
    expect(getIsRpcFailoverForced(state as never)).toBe(false);
  });

  it('returns false when the flag is absent', () => {
    const state = { remoteFeatureFlags: {}, cacheTimestamp: 0 };
    expect(getIsRpcFailoverForced(state as never)).toBe(false);
  });

  it('passes through non-boolean values without coercion', () => {
    const state = {
      remoteFeatureFlags: {
        'core-platform-rpc-failover-force-enabled': 'yes',
      },
      cacheTimestamp: 0,
    };
    expect(getIsRpcFailoverForced(state as never)).toBe('yes');
  });
});
