import { formatChainIdToCaip } from './caip-formatters';
import { validateFeatureFlagsResponse } from './validators';
import { DEFAULT_FEATURE_FLAG_CONFIG } from '../constants/bridge';
import type {
  FeatureFlagsPlatformConfig,
  ChainConfiguration,
  BridgeControllerMessenger,
} from '../types';

export const formatFeatureFlags = (
  bridgeFeatureFlags: FeatureFlagsPlatformConfig,
) => {
  const getChainsObj = (chains: Record<string, ChainConfiguration>) =>
    Object.entries(chains).reduce(
      (acc, [chainId, value]) => ({
        ...acc,
        [formatChainIdToCaip(chainId)]: value,
      }),
      {},
    );

  return {
    ...bridgeFeatureFlags,
    chains: getChainsObj(bridgeFeatureFlags.chains),
  };
};

export const processFeatureFlags = (
  bridgeFeatureFlags: unknown,
): FeatureFlagsPlatformConfig => {
  if (validateFeatureFlagsResponse(bridgeFeatureFlags)) {
    return formatFeatureFlags(bridgeFeatureFlags);
  }
  return DEFAULT_FEATURE_FLAG_CONFIG;
};

/**
 * Gets the bridge feature flags from the remote feature flag controller
 *
 * @param messenger - The messenger instance
 * @returns The bridge feature flags
 */
export function getBridgeFeatureFlags(
  messenger: BridgeControllerMessenger,
): FeatureFlagsPlatformConfig {
  // This will return the bridgeConfig for the current platform even without specifying the platform
  const remoteFeatureFlagControllerState = messenger.call(
    'RemoteFeatureFlagController:getState',
  );

  // bridgeConfigV2 is the feature flag for the mobile app
  // bridgeConfig for Mobile has been deprecated since release of bridge and Solana in 7.46.0 was pushed back
  // and there's no way to turn on bridgeConfig for 7.47.0 without affecting 7.46.0 as well.
  // You will still get bridgeConfig returned from remoteFeatureFlagControllerState but you should use bridgeConfigV2 instead
  // Mobile's bridgeConfig will be permanently turned off, so falling back to bridgeConfig in Mobile will be ok
  const rawMobileFlags =
    remoteFeatureFlagControllerState?.remoteFeatureFlags?.bridgeConfigV2;

  // Extension LaunchDarkly will not have the bridgeConfigV2 field, so we'll continue to use bridgeConfig
  const rawBridgeConfig =
    remoteFeatureFlagControllerState?.remoteFeatureFlags?.bridgeConfig;

  return processFeatureFlags(rawMobileFlags || rawBridgeConfig);
}
