import { getRpcFailoverMode } from './selectors.js';

/**
 * Builds a remote feature flag controller state with the given failover mode.
 *
 * @param mode - The value to set for `corePlatformRpcFailoverMode`, if any.
 * @returns The state object.
 */
function buildState(mode?: unknown): {
  remoteFeatureFlags: Record<string, unknown>;
  cacheTimestamp: number;
} {
  return {
    remoteFeatureFlags:
      mode === undefined ? {} : { corePlatformRpcFailoverMode: mode },
    cacheTimestamp: 0,
  };
}

describe('getRpcFailoverMode', () => {
  it('returns "enabled" when the flag is "enabled"', () => {
    expect(getRpcFailoverMode(buildState('enabled') as never)).toBe('enabled');
  });

  it('returns "forced" when the flag is "forced"', () => {
    expect(getRpcFailoverMode(buildState('forced') as never)).toBe('forced');
  });

  it('returns "disabled" when the flag is "disabled"', () => {
    expect(getRpcFailoverMode(buildState('disabled') as never)).toBe(
      'disabled',
    );
  });

  it('returns "disabled" when the flag is absent', () => {
    expect(getRpcFailoverMode(buildState() as never)).toBe('disabled');
  });

  it('returns "disabled" when the flag is an unrecognized value', () => {
    expect(getRpcFailoverMode(buildState('yes') as never)).toBe('disabled');
  });
});
