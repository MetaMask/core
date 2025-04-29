import { formatChainIdToCaip } from './caip-formatters';
import { validateFeatureFlagsResponse } from './validators';
import { DEFAULT_FEATURE_FLAG_CONFIG } from '../constants/bridge';
import type {
  FeatureFlagsPlatformConfig,
  ChainConfiguration,
  BridgeControllerMessenger,
} from '../types';

export const formatFeatureFlags = (
  bridgeConfig: FeatureFlagsPlatformConfig,
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
    ...bridgeConfig,
    chains: getChainsObj(bridgeConfig.chains),
  };
};

export const processFeatureFlags = (
  bridgeConfig: unknown,
): FeatureFlagsPlatformConfig => {
  if (validateFeatureFlagsResponse(bridgeConfig)) {
    return formatFeatureFlags(bridgeConfig);
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
  const rawBridgeConfig =
    remoteFeatureFlagControllerState?.remoteFeatureFlags?.bridgeConfig;

  return processFeatureFlags(rawBridgeConfig);
}
