import { getIsRpcFailoverEnabled, getIsRpcFailoverForced } from './selectors';

/**
 * Builds a remote feature flag controller state with the given failover mode.
 *
 * @param mode - The value to set for `corePlatformRpcFailoverMode`, if any.
 * @returns The state object.
 */
function buildState(mode?: unknown) {
  return {
    remoteFeatureFlags:
      mode === undefined ? {} : { corePlatformRpcFailoverMode: mode },
    cacheTimestamp: 0,
  };
}

describe('getIsRpcFailoverEnabled', () => {
  it('returns true when the mode is "enabled"', () => {
    expect(getIsRpcFailoverEnabled(buildState('enabled') as never)).toBe(true);
  });

  it('returns false when the mode is "forced"', () => {
    expect(getIsRpcFailoverEnabled(buildState('forced') as never)).toBe(false);
  });

  it('returns false when the mode is "disabled"', () => {
    expect(getIsRpcFailoverEnabled(buildState('disabled') as never)).toBe(
      false,
    );
  });

  it('returns false when the flag is absent', () => {
    expect(getIsRpcFailoverEnabled(buildState() as never)).toBe(false);
  });

  it('returns false when the flag is an unrecognized value', () => {
    expect(getIsRpcFailoverEnabled(buildState('yes') as never)).toBe(false);
  });
});

describe('getIsRpcFailoverForced', () => {
  it('returns true when the mode is "forced"', () => {
    expect(getIsRpcFailoverForced(buildState('forced') as never)).toBe(true);
  });

  it('returns false when the mode is "enabled"', () => {
    expect(getIsRpcFailoverForced(buildState('enabled') as never)).toBe(false);
  });

  it('returns false when the mode is "disabled"', () => {
    expect(getIsRpcFailoverForced(buildState('disabled') as never)).toBe(false);
  });

  it('returns false when the flag is absent', () => {
    expect(getIsRpcFailoverForced(buildState() as never)).toBe(false);
  });
});
