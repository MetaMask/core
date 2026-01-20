import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import type { TransactionPayControllerMessenger } from '..';
import { projectLogger } from '../logger';
import { RELAY_URL_BASE } from '../strategy/relay/constants';

const log = createModuleLogger(projectLogger, 'feature-flags');

export const DEFAULT_GAS_BUFFER = 1.0;
export const DEFAULT_RELAY_FALLBACK_GAS_ESTIMATE = 900000;
export const DEFAULT_RELAY_FALLBACK_GAS_MAX = 1500000;
export const DEFAULT_RELAY_QUOTE_URL = `${RELAY_URL_BASE}/quote`;
export const DEFAULT_SLIPPAGE = 0.005;

type FeatureFlagsRaw = {
  gasBuffer?: {
    default?: number;
    perChainConfig?: Record<
      Hex,
      {
        name?: string;
        buffer?: number;
      }
    >;
  };
  relayDisabledGasStationChains?: Hex[];
  relayFallbackGas?: {
    estimate?: number;
    max?: number;
  };
  relayQuoteUrl?: string;
  slippage?: number;
  slippageTokens?: Record<Hex, Record<Hex, number>>;
};

export type FeatureFlags = {
  relayDisabledGasStationChains: Hex[];
  relayFallbackGas: {
    estimate: number;
    max: number;
  };
  relayQuoteUrl: string;
  slippage: number;
};

/**
 * Get feature flags related to the controller.
 *
 * @param messenger - Controller messenger.
 * @returns Feature flags.
 */
export function getFeatureFlags(
  messenger: TransactionPayControllerMessenger,
): FeatureFlags {
  const featureFlags = getFeatureFlagsRaw(messenger);

  const estimate =
    featureFlags.relayFallbackGas?.estimate ??
    DEFAULT_RELAY_FALLBACK_GAS_ESTIMATE;

  const max =
    featureFlags.relayFallbackGas?.max ?? DEFAULT_RELAY_FALLBACK_GAS_MAX;

  const relayQuoteUrl = featureFlags.relayQuoteUrl ?? DEFAULT_RELAY_QUOTE_URL;

  const relayDisabledGasStationChains =
    featureFlags.relayDisabledGasStationChains ?? [];

  const slippage = featureFlags.slippage ?? DEFAULT_SLIPPAGE;

  const result = {
    relayDisabledGasStationChains,
    relayFallbackGas: {
      estimate,
      max,
    },
    relayQuoteUrl,
    slippage,
  };

  log('Feature flags:', { raw: featureFlags, result });

  return result;
}

/**
 * Get the gas buffer value for a specific chain ID.
 *
 * @param messenger - Controller messenger.
 * @param chainId - Chain ID to get gas buffer for.
 * @returns Gas buffer value.
 */
export function getGasBuffer(
  messenger: TransactionPayControllerMessenger,
  chainId: Hex,
): number {
  const featureFlags = getFeatureFlagsRaw(messenger);

  return (
    featureFlags.gasBuffer?.perChainConfig?.[chainId]?.buffer ??
    featureFlags.gasBuffer?.default ??
    DEFAULT_GAS_BUFFER
  );
}

/**
 * Get the slippage value for a specific chain ID and token address.
 * Falls back to the general slippage feature flag, then the static default.
 *
 * @param messenger - Controller messenger.
 * @param chainId - Chain ID to get slippage for.
 * @param tokenAddress - Token address to get slippage for.
 * @returns Slippage value as a decimal (e.g., 0.005 for 0.5%).
 */
export function getSlippage(
  messenger: TransactionPayControllerMessenger,
  chainId: Hex,
  tokenAddress: Hex,
): number {
  const featureFlags = getFeatureFlagsRaw(messenger);

  // Normalize chain ID and token address to lowercase for case-insensitive lookup
  const normalizedChainId = chainId.toLowerCase() as Hex;
  const normalizedTokenAddress = tokenAddress.toLowerCase() as Hex;

  // Look for token-specific slippage (case insensitive)
  const { slippageTokens } = featureFlags;
  if (slippageTokens) {
    // Find the chain entry (case insensitive)
    const chainEntry = Object.entries(slippageTokens).find(
      ([key]) => key.toLowerCase() === normalizedChainId,
    );

    if (chainEntry) {
      const [, tokenMap] = chainEntry;
      // Find the token entry (case insensitive)
      const tokenEntry = Object.entries(tokenMap).find(
        ([key]) => key.toLowerCase() === normalizedTokenAddress,
      );

      if (tokenEntry) {
        const [, slippage] = tokenEntry;
        log('Using token-specific slippage', {
          chainId,
          tokenAddress,
          slippage,
        });
        return slippage;
      }
    }
  }

  // Fall back to general slippage feature flag, then static default
  const slippage = featureFlags.slippage ?? DEFAULT_SLIPPAGE;
  log('Using default slippage', { chainId, tokenAddress, slippage });
  return slippage;
}

/**
 * Get the raw feature flags from the remote feature flag controller.
 *
 * @param messenger - Controller messenger.
 * @returns Raw feature flags.
 */
function getFeatureFlagsRaw(
  messenger: TransactionPayControllerMessenger,
): FeatureFlagsRaw {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  return (state.remoteFeatureFlags.confirmations_pay as FeatureFlagsRaw) ?? {};
}
