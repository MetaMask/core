import { formatChainIdToCaip } from './caip-formatters';
import type { FeatureFlagsPlatformConfig, ChainConfiguration } from '../types';

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
