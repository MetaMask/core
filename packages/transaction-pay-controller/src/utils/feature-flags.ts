import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { uniq } from 'lodash';

import type { TransactionPayControllerMessenger } from '..';
import { isTransactionPayStrategy, TransactionPayStrategy } from '../constants';
import { projectLogger } from '../logger';
import { RELAY_URL_BASE } from '../strategy/relay/constants';

const log = createModuleLogger(projectLogger, 'feature-flags');

type StrategyOrder = [TransactionPayStrategy, ...TransactionPayStrategy[]];

export const DEFAULT_GAS_BUFFER = 1.0;
export const DEFAULT_RELAY_FALLBACK_GAS_ESTIMATE = 900000;
export const DEFAULT_RELAY_FALLBACK_GAS_MAX = 1500000;
export const DEFAULT_RELAY_QUOTE_URL = `${RELAY_URL_BASE}/quote`;
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
  metaMaskFee?: {
    recipient?: Hex;
    fee?: string;
  };
  relayDisabledGasStationChains?: Hex[];
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
  metaMaskFee?: {
    recipient: Hex;
    fee: string;
  };
  relayDisabledGasStationChains: Hex[];
  relayFallbackGas: {
    estimate: number;
    max: number;
  };
  relayQuoteUrl: string;
  slippage: number;
};

export type AcrossConfigRaw = {
  allowSameChain?: boolean;
  apiBase?: string;
  enabled?: boolean;
  integratorId?: string;
  postActionsEnabled?: boolean;
};

export type PayStrategiesConfigRaw = {
  across?: AcrossConfigRaw;
  relay?: {
    enabled?: boolean;
  };
};

export type PayStrategiesConfig = {
  across: AcrossConfigRaw & {
    allowSameChain: boolean;
    apiBase: string;
    enabled: boolean;
    postActionsEnabled: boolean;
  };
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
  const metaMaskFee = getMetaMaskFee(featureFlags.metaMaskFee);

  const estimate =
    featureFlags.relayFallbackGas?.estimate ??
    DEFAULT_RELAY_FALLBACK_GAS_ESTIMATE;

  const max =
    featureFlags.relayFallbackGas?.max ?? DEFAULT_RELAY_FALLBACK_GAS_MAX;

  const relayQuoteUrl = featureFlags.relayQuoteUrl ?? DEFAULT_RELAY_QUOTE_URL;

  const relayDisabledGasStationChains =
    featureFlags.relayDisabledGasStationChains ?? [];

  const slippage = featureFlags.slippage ?? DEFAULT_SLIPPAGE;

  const result: FeatureFlags = {
    ...(metaMaskFee ? { metaMaskFee } : {}),
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

function getMetaMaskFee(
  rawMetaMaskFee: FeatureFlagsRaw['metaMaskFee'],
): FeatureFlags['metaMaskFee'] {
  if (!rawMetaMaskFee?.recipient || !rawMetaMaskFee.fee) {
    return undefined;
  }

  if (!/^0x[a-fA-F0-9]{40}$/u.test(rawMetaMaskFee.recipient)) {
    return undefined;
  }

  const parsedFee = Number(rawMetaMaskFee.fee);

  if (!Number.isFinite(parsedFee) || parsedFee <= 0 || parsedFee >= 1) {
    return undefined;
  }

  return {
    recipient: rawMetaMaskFee.recipient,
    fee: rawMetaMaskFee.fee,
  };
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
    allowSameChain: acrossRaw.allowSameChain ?? false,
    apiBase: acrossRaw.apiBase ?? DEFAULT_ACROSS_API_BASE,
    enabled: acrossRaw.enabled ?? false,
    integratorId: acrossRaw.integratorId,
    postActionsEnabled: acrossRaw.postActionsEnabled ?? false,
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
 * Get fallback gas limits for quote/submit flows.
 *
 * @param messenger - Controller messenger.
 * @returns Fallback gas limits.
 */
export function getRelayFallbackGas(
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
 * Retrieves the supported EIP-7702 chains from feature flags.
 *
 * @param messenger - Controller messenger.
 * @returns Array of chain IDs that support EIP-7702.
 */
export function getEIP7702SupportedChains(
  messenger: TransactionPayControllerMessenger,
): Hex[] {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const eip7702Flags = state.remoteFeatureFlags.confirmations_eip_7702 as
    | { supportedChains?: Hex[] }
    | undefined;

  return eip7702Flags?.supportedChains ?? [];
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
