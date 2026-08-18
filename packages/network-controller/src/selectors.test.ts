import {
  getConfigRegistryEvmAutoEnabledChains,
  getRpcFailoverMode,
} from './selectors.js';

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

describe('getConfigRegistryEvmAutoEnabledChains', () => {
  it('returns the list of CAIP-2 chain IDs for auto-enabled EVM networks', () => {
    const state = {
      configs: {
        networks: {
          'eip155:1': {
            chainId: 'eip155:1',
            config: {
              isAutoEnabled: true,
              isActive: true,
              isDeprecated: false,
            },
          },
          'eip155:3': {
            chainId: 'eip155:3',
            config: {
              isAutoEnabled: false,
              isActive: true,
              isDeprecated: false,
            },
          },
          'eip155:4': {
            chainId: 'eip155:4',
            config: {
              isAutoEnabled: true,
              isActive: false,
              isDeprecated: false,
            },
          },
          'eip155:5': {
            chainId: 'eip155:5',
            config: { isAutoEnabled: true, isActive: true, isDeprecated: true },
          },
          'eip155:6': {
            chainId: 'eip155:6',
            config: {
              isAutoEnabled: true,
              isActive: true,
              isDeprecated: false,
            },
          },
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
            chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
            config: {
              isAutoEnabled: true,
              isActive: true,
              isDeprecated: false,
            },
          },
        },
      },
    };

    const result = getConfigRegistryEvmAutoEnabledChains(state);
    expect(result).toStrictEqual(['eip155:1', 'eip155:6']);
  });
});
