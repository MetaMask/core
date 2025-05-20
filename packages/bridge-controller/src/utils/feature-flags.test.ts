import { formatFeatureFlags, getBridgeFeatureFlags } from './feature-flags';
import type {
  FeatureFlagsPlatformConfig,
  BridgeControllerMessenger,
} from '../types';

describe('feature-flags', () => {
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
  describe('getBridgeFeatureFlags', () => {
    const mockMessenger = {
      call: jest.fn(),
      publish: jest.fn(),
      registerActionHandler: jest.fn(),
      registerInitialEventPayload: jest.fn(),
    } as unknown as BridgeControllerMessenger;

    it('should fetch bridge feature flags successfully', async () => {
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

      const remoteFeatureFlagControllerState = {
        cacheTimestamp: 1745515389440,
        remoteFeatureFlags: {
          bridgeConfig,
          assetsNotificationsEnabled: false,
          confirmation_redesign: {
            contract_interaction: false,
            signatures: false,
            staking_confirmations: false,
          },
          confirmations_eip_7702: {},
          earnFeatureFlagTemplate: {
            enabled: false,
            minimumVersion: '0.0.0',
          },
          earnPooledStakingEnabled: {
            enabled: false,
            minimumVersion: '0.0.0',
          },
          earnPooledStakingServiceInterruptionBannerEnabled: {
            enabled: false,
            minimumVersion: '0.0.0',
          },
          earnStablecoinLendingEnabled: {
            enabled: false,
            minimumVersion: '0.0.0',
          },
          earnStablecoinLendingServiceInterruptionBannerEnabled: {
            enabled: false,
            minimumVersion: '0.0.0',
          },
          mobileMinimumVersions: {
            androidMinimumAPIVersion: 0,
            appMinimumBuild: 0,
            appleMinimumOS: 0,
          },
          productSafetyDappScanning: false,
          testFlagForThreshold: {},
          tokenSearchDiscoveryEnabled: false,
          transactionsPrivacyPolicyUpdate: 'no_update',
          transactionsTxHashInAnalytics: false,
          walletFrameworkRpcFailoverEnabled: false,
        },
      };

      (mockMessenger.call as jest.Mock).mockImplementation(() => {
        return remoteFeatureFlagControllerState;
      });

      const result = getBridgeFeatureFlags(mockMessenger);

      const expectedBridgeConfig = {
        maxRefreshCount: 1,
        refreshRate: 3,
        support: true,
        chains: {
          'eip155:1': {
            isActiveDest: true,
            isActiveSrc: true,
          },
          'eip155:10': {
            isActiveDest: false,
            isActiveSrc: true,
          },
          'eip155:11111': {
            isActiveDest: true,
            isActiveSrc: false,
          },
          'eip155:120': {
            isActiveDest: false,
            isActiveSrc: true,
          },
          'eip155:137': {
            isActiveDest: true,
            isActiveSrc: false,
          },
          'eip155:59144': {
            isActiveDest: true,
            isActiveSrc: true,
          },
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
            isActiveDest: true,
            isActiveSrc: true,
          },
        },
      };

      expect(result).toStrictEqual(expectedBridgeConfig);
    });

    it('should use fallback bridge feature flags if response is unexpected', async () => {
      const bridgeConfig = {
        refreshRate: 3,
        maxRefreshCount: 1,
        support: 25,
        chains: {
          a: {
            isActiveSrc: 1,
            isActiveDest: 'test',
          },
          '2': {
            isActiveSrc: 'test',
            isActiveDest: 2,
          },
        },
      };
      const remoteFeatureFlagControllerState = {
        cacheTimestamp: 1745515389440,
        remoteFeatureFlags: {
          bridgeConfig,
          assetsNotificationsEnabled: false,
          confirmation_redesign: {
            contract_interaction: false,
            signatures: false,
            staking_confirmations: false,
          },
          confirmations_eip_7702: {},
          earnFeatureFlagTemplate: {
            enabled: false,
            minimumVersion: '0.0.0',
          },
          earnPooledStakingEnabled: {
            enabled: false,
            minimumVersion: '0.0.0',
          },
          earnPooledStakingServiceInterruptionBannerEnabled: {
            enabled: false,
            minimumVersion: '0.0.0',
          },
          earnStablecoinLendingEnabled: {
            enabled: false,
            minimumVersion: '0.0.0',
          },
          earnStablecoinLendingServiceInterruptionBannerEnabled: {
            enabled: false,
            minimumVersion: '0.0.0',
          },
          mobileMinimumVersions: {
            androidMinimumAPIVersion: 0,
            appMinimumBuild: 0,
            appleMinimumOS: 0,
          },
          productSafetyDappScanning: false,
          testFlagForThreshold: {},
          tokenSearchDiscoveryEnabled: false,
          transactionsPrivacyPolicyUpdate: 'no_update',
          transactionsTxHashInAnalytics: false,
          walletFrameworkRpcFailoverEnabled: false,
        },
      };

      (mockMessenger.call as jest.Mock).mockResolvedValue(
        remoteFeatureFlagControllerState,
      );

      const result = getBridgeFeatureFlags(mockMessenger);

      const expectedBridgeConfig = {
        maxRefreshCount: 5,
        refreshRate: 30000,
        support: false,
        chains: {},
      };
      expect(result).toStrictEqual(expectedBridgeConfig);
    });
  });
});
