import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { uniq } from 'lodash';

import type { TransactionPayControllerMessenger } from '..';
import { isTransactionPayStrategy, TransactionPayStrategy } from '../constants';
import { projectLogger } from '../logger';
import {
  RELAY_EXECUTE_URL,
  RELAY_QUOTE_URL,
} from '../strategy/relay/constants';

const log = createModuleLogger(projectLogger, 'feature-flags');

type StrategyOrder = [TransactionPayStrategy, ...TransactionPayStrategy[]];

export const DEFAULT_GAS_BUFFER = 1.0;
export const DEFAULT_FALLBACK_GAS_ESTIMATE = 900000;
export const DEFAULT_FALLBACK_GAS_MAX = 1500000;
export const DEFAULT_RELAY_EXECUTE_URL = RELAY_EXECUTE_URL;
export const DEFAULT_RELAY_QUOTE_URL = RELAY_QUOTE_URL;
export const DEFAULT_RELAY_ORIGIN_GAS_OVERHEAD = '300000';
export const DEFAULT_SLIPPAGE = 0.005;
export const DEFAULT_ACROSS_API_BASE = 'https://app.across.to/api';
export const DEFAULT_STRATEGY_ORDER: StrategyOrder = [
  TransactionPayStrategy.Relay,
  TransactionPayStrategy.Across,
];

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
  relayExecuteUrl?: string;
  relayFallbackGas?: {
    estimate?: number;
    max?: number;
  };
  relayQuoteUrl?: string;
  slippage?: number;
  slippageTokens?: Record<Hex, Record<Hex, number>>;
  strategyOrder?: string[];
  payStrategies?: PayStrategiesConfigRaw;
};

export type FeatureFlags = {
  relayDisabledGasStationChains: Hex[];
  relayExecuteUrl: string;
  relayFallbackGas: {
    estimate: number;
    max: number;
  };
  relayQuoteUrl: string;
  slippage: number;
};

export type AcrossConfigRaw = {
  apiBase?: string;
  enabled?: boolean;
  fallbackGas?: {
    estimate?: number;
    max?: number;
  };
};

export type AcrossConfig = {
  apiBase: string;
  enabled: boolean;
  fallbackGas: {
    estimate: number;
    max: number;
  };
};

export type PayStrategiesConfigRaw = {
  across?: AcrossConfigRaw;
  relay?: {
    enabled?: boolean;
    executeEnabled?: boolean;
    originGasOverhead?: string;
  };
};

export type PayStrategiesConfig = {
  across: AcrossConfig;
  relay: {
    enabled: boolean;
  };
};

/**
 * Get ordered list of strategies to try.
 *
 * @param messenger - Controller messenger.
 * @returns Ordered strategy list.
 */
export function getStrategyOrder(
  messenger: TransactionPayControllerMessenger,
): StrategyOrder {
  const { strategyOrder: strategyPriority } = getFeatureFlagsRaw(messenger);

  if (!Array.isArray(strategyPriority)) {
    return [...DEFAULT_STRATEGY_ORDER];
  }

  const validStrategyPriority = uniq(
    strategyPriority.filter((strategy): strategy is TransactionPayStrategy =>
      isTransactionPayStrategy(strategy),
    ),
  );

  if (!validStrategyPriority.length) {
    return [...DEFAULT_STRATEGY_ORDER];
  }

  return validStrategyPriority as StrategyOrder;
}

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
    featureFlags.relayFallbackGas?.estimate ?? DEFAULT_FALLBACK_GAS_ESTIMATE;

  const max = featureFlags.relayFallbackGas?.max ?? DEFAULT_FALLBACK_GAS_MAX;

  const relayExecuteUrl =
    featureFlags.relayExecuteUrl ?? DEFAULT_RELAY_EXECUTE_URL;

  const relayQuoteUrl = featureFlags.relayQuoteUrl ?? DEFAULT_RELAY_QUOTE_URL;

  const relayDisabledGasStationChains =
    featureFlags.relayDisabledGasStationChains ?? [];

  const slippage = featureFlags.slippage ?? DEFAULT_SLIPPAGE;

  const result: FeatureFlags = {
    relayDisabledGasStationChains,
    relayExecuteUrl,
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
 * Get Pay Strategies configuration.
 *
 * @param messenger - Controller messenger.
 * @returns Pay Strategies configuration.
 */
export function getPayStrategiesConfig(
  messenger: TransactionPayControllerMessenger,
): PayStrategiesConfig {
  const featureFlags = getFeatureFlagsRaw(messenger);
  const payStrategies = featureFlags.payStrategies ?? {};

  const acrossRaw = payStrategies.across ?? {};
  const relayRaw = payStrategies.relay ?? {};

  const across = {
    apiBase: acrossRaw.apiBase ?? DEFAULT_ACROSS_API_BASE,
    enabled: acrossRaw.enabled ?? false,
    fallbackGas: {
      estimate:
        acrossRaw.fallbackGas?.estimate ?? DEFAULT_FALLBACK_GAS_ESTIMATE,
      max: acrossRaw.fallbackGas?.max ?? DEFAULT_FALLBACK_GAS_MAX,
    },
  };

  const relay = {
    enabled: relayRaw.enabled ?? true,
  };

  return {
    across,
    relay,
  };
}

/**
 * Whether the Relay /execute gasless flow is enabled.
 *
 * @param messenger - Controller messenger.
 * @returns True if the execute flow is enabled.
 */
export function isRelayExecuteEnabled(
  messenger: TransactionPayControllerMessenger,
): boolean {
  const featureFlags = getFeatureFlagsRaw(messenger);
  return featureFlags.payStrategies?.relay?.executeEnabled ?? false;
}

/**
 * Get the origin gas overhead to include in Relay quote requests
 * for EIP-7702 chains.
 *
 * @param messenger - Controller messenger.
 * @returns Origin gas overhead as a decimal string.
 */
export function getRelayOriginGasOverhead(
  messenger: TransactionPayControllerMessenger,
): string {
  const featureFlags = getFeatureFlagsRaw(messenger);
  return (
    featureFlags.payStrategies?.relay?.originGasOverhead ??
    DEFAULT_RELAY_ORIGIN_GAS_OVERHEAD
  );
}

/**
 * Get fallback gas limits for quote/submit flows.
 *
 * @param messenger - Controller messenger.
 * @returns Fallback gas limits.
 */
export function getFallbackGas(
  messenger: TransactionPayControllerMessenger,
): FeatureFlags['relayFallbackGas'] {
  return getFeatureFlags(messenger).relayFallbackGas;
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
  const { slippageTokens } = featureFlags;

  const tokenMap = getCaseInsensitive(slippageTokens, chainId);
  const tokenSlippage = getCaseInsensitive(tokenMap, tokenAddress);

  if (tokenSlippage !== undefined) {
    log('Using token-specific slippage', {
      chainId,
      tokenAddress,
      slippage: tokenSlippage,
    });
    return tokenSlippage;
  }

  const slippage = featureFlags.slippage ?? DEFAULT_SLIPPAGE;
  log('Using default slippage', { chainId, tokenAddress, slippage });
  return slippage;
}

/**
 * Get a value from a record using a case-insensitive key lookup.
 *
 * @param record - The record to search.
 * @param key - The key to look up (case-insensitive).
 * @returns The value if found, undefined otherwise.
 */
function getCaseInsensitive<Value>(
  record: Record<string, Value> | undefined,
  key: string,
): Value | undefined {
  if (!record) {
    return undefined;
  }

  const normalizedKey = key.toLowerCase();
  const entry = Object.entries(record).find(
    ([k]) => k.toLowerCase() === normalizedKey,
  );

  return entry?.[1];
}

/**
 * Checks if a chain supports EIP-7702.
 *
 * @param messenger - Controller messenger.
 * @param chainId - Chain ID to check.
 * @returns Whether the chain supports EIP-7702.
 */
export function isEIP7702Chain(
  messenger: TransactionPayControllerMessenger,
  chainId: Hex,
): boolean {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const eip7702Flags = state.remoteFeatureFlags.confirmations_eip_7702 as
    | { supportedChains?: Hex[] }
    | undefined;

  const supportedChains = eip7702Flags?.supportedChains ?? [];

  return supportedChains.some(
    (supported) => supported.toLowerCase() === chainId.toLowerCase(),
  );
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
