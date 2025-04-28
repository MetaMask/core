import { formatFeatureFlags } from './feature-flags';
import type { FeatureFlagsPlatformConfig } from '../types';

describe('formatFeatureFlags', () => {
  it('should format chain IDs to CAIP format', () => {
    const bridgeConfig = {
      refreshRate: 3,
      maxRefreshCount: 1,
      support: true,
      chains: {
        '1': {
          isActiveSrc: true,
          isActiveDest: true,
        },
        '10': {
          isActiveSrc: true,
          isActiveDest: false,
        },
        '59144': {
          isActiveSrc: true,
          isActiveDest: true,
        },
        '120': {
          isActiveSrc: true,
          isActiveDest: false,
        },
        '137': {
          isActiveSrc: false,
          isActiveDest: true,
        },
        '11111': {
          isActiveSrc: false,
          isActiveDest: true,
        },
        '1151111081099710': {
          isActiveSrc: true,
          isActiveDest: true,
        },
      },
    };

    const result = formatFeatureFlags(bridgeConfig);

    expect(result).toStrictEqual({
      refreshRate: 3,
      maxRefreshCount: 1,
      support: true,
      chains: {
        'eip155:1': {
          isActiveSrc: true,
          isActiveDest: true,
        },
        'eip155:10': {
          isActiveSrc: true,
          isActiveDest: false,
        },
        'eip155:59144': {
          isActiveSrc: true,
          isActiveDest: true,
        },
        'eip155:120': {
          isActiveSrc: true,
          isActiveDest: false,
        },
        'eip155:137': {
          isActiveSrc: false,
          isActiveDest: true,
        },
        'eip155:11111': {
          isActiveSrc: false,
          isActiveDest: true,
        },
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
          isActiveSrc: true,
          isActiveDest: true,
        },
      },
    });
  });

  it('should handle empty chains object', () => {
    const bridgeConfig: FeatureFlagsPlatformConfig = {
      refreshRate: 3,
      maxRefreshCount: 1,
      support: true,
      chains: {},
    };

    const result = formatFeatureFlags(bridgeConfig);

    expect(result).toStrictEqual({
      refreshRate: 3,
      maxRefreshCount: 1,
      support: true,
      chains: {},
    });
  });

  it('should handle invalid chain IDs', () => {
    const bridgeConfig: FeatureFlagsPlatformConfig = {
      refreshRate: 3,
      maxRefreshCount: 1,
      support: true,
      chains: {
        'eip155:invalid': {
          isActiveSrc: true,
          isActiveDest: true,
        },
        'eip155:0x123': {
          isActiveSrc: true,
          isActiveDest: false,
        },
      },
    };

    const result = formatFeatureFlags(bridgeConfig);

    expect(result).toStrictEqual({
      refreshRate: 3,
      maxRefreshCount: 1,
      support: true,
      chains: {
        'eip155:invalid': {
          isActiveSrc: true,
          isActiveDest: true,
        },
        'eip155:0x123': {
          isActiveSrc: true,
          isActiveDest: false,
        },
      },
    });
  });
});
