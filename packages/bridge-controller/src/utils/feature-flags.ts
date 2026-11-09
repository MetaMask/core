import type { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';

import {
  DEFAULT_CHAIN_RANKING,
  DEFAULT_FEATURE_FLAG_CONFIG,
} from '../constants/bridge.js';
import type {
  FeatureFlagsPlatformConfig,
  ChainConfiguration,
  GenericQuoteRequest,
} from '../types.js';
import { validateFeatureFlagsResponse } from '../validators/feature-flags.js';
import { formatChainIdToCaip } from './caip-formatters.js';
import { getFeatureFlags } from './controllers/remote-feature-flags.js';

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
    const formattedFlags = formatFeatureFlags(bridgeFeatureFlags);
    // If chainRanking is undefined or empty, use the default chainRanking
    if (
      !formattedFlags.chainRanking ||
      formattedFlags.chainRanking.length === 0
    ) {
      return {
        ...formattedFlags,
        chainRanking: [...DEFAULT_CHAIN_RANKING],
      };
    }
    return formattedFlags;
  }
  return DEFAULT_FEATURE_FLAG_CONFIG;
};

/**
 * Gets the bridge feature flags from the remote feature flag controller
 *
 * @param messenger - Any messenger with access to RemoteFeatureFlagController:getState
 * @returns The bridge feature flags
 */
export const getBridgeFeatureFlags = <
  T extends {
    call(
      action: 'RemoteFeatureFlagController:getState',
    ): RemoteFeatureFlagControllerState;
  },
>(
  messenger: T,
): FeatureFlagsPlatformConfig => {
  const remoteFeatureFlags = getFeatureFlags(messenger);

  // bridgeConfigV2 is the feature flag for the mobile app
  // bridgeConfig for Mobile has been deprecated since release of bridge and Solana in 7.46.0 was pushed back
  // and there's no way to turn on bridgeConfig for 7.47.0 without affecting 7.46.0 as well.
  // You will still get bridgeConfig returned from remoteFeatureFlags but you should use bridgeConfigV2 instead
  // Mobile's bridgeConfig will be permanently serving the disabled variation, so falling back to it in Mobile will be ok
  const rawMobileFlags = remoteFeatureFlags?.bridgeConfigV2;

  // Extension LaunchDarkly will not have the bridgeConfigV2 field, so we'll continue to use bridgeConfig
  const rawBridgeConfig = remoteFeatureFlags?.bridgeConfig;

  return processFeatureFlags(rawMobileFlags || rawBridgeConfig);
};

/**
 * Checks if the client version is greater than or equal to the minimum required version
 *
 * @param clientVersion - The client version
 * @param minRequiredVersion - The minimum required version
 * @returns True if the client version is greater than or equal to the minimum required version, false otherwise
 */
export const hasMinimumRequiredVersion = (
  clientVersion: string,
  minRequiredVersion: string,
) => {
  const [clientMajor, clientMinor, clientPatch] = clientVersion
    .split('.')
    .map(Number);
  const [minRequiredMajor, minRequiredMinor, minRequiredPatch] =
    minRequiredVersion.split('.').map(Number);

  if (clientMajor > minRequiredMajor) {
    return true;
  }
  if (clientMajor === minRequiredMajor && clientMinor > minRequiredMinor) {
    return true;
  }
  return (
    clientMajor === minRequiredMajor &&
    clientMinor === minRequiredMinor &&
    clientPatch >= minRequiredPatch
  );
};

export const getQuoteRefreshRate = <
  T extends {
    call(
      action: 'RemoteFeatureFlagController:getState',
    ): RemoteFeatureFlagControllerState;
  },
>(
  messenger: T,
  srcChainId?: GenericQuoteRequest['srcChainId'],
) => {
  const bridgeFeatureFlags = getBridgeFeatureFlags(messenger);

  const refreshRateOverride = srcChainId
    ? bridgeFeatureFlags.chains[formatChainIdToCaip(srcChainId)]?.refreshRate
    : undefined;
  const defaultRefreshRate = bridgeFeatureFlags.refreshRate;
  return refreshRateOverride ?? defaultRefreshRate;
};
