import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { uniq } from 'lodash';

import { isTransactionPayStrategy, TransactionPayStrategy } from '../constants';
import { projectLogger } from '../logger';
import {
  RELAY_EXECUTE_URL,
  RELAY_POLLING_INTERVAL,
  RELAY_QUOTE_URL,
} from '../strategy/relay/constants';
import type { TransactionPayControllerMessenger } from '../types';

const log = createModuleLogger(projectLogger, 'feature-flags');

type StrategyOrder = TransactionPayStrategy[];

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
  strategyOverrides?: StrategyOverridesRaw;
  payStrategies?: PayStrategiesConfigRaw;
};

type StrategyOverrideRaw = {
  default?: unknown;
  chains?: Record<string, unknown>;
  tokens?: Record<string, Record<string, unknown>>;
};

type StrategyOverridesRaw = {
  default?: StrategyOverrideRaw;
  transactionTypes?: Record<string, StrategyOverrideRaw>;
};

type StrategyOverride = {
  chains: Record<Hex, TransactionPayStrategy[]>;
  default?: TransactionPayStrategy[];
  tokens: Record<Hex, Record<Hex, TransactionPayStrategy[]>>;
};

type StrategyOverrides = {
  default?: StrategyOverride;
  transactionTypes: Record<string, StrategyOverride>;
};

type StrategyRoutingConfig = {
  payStrategies: {
    across: {
      enabled: boolean;
    };
    relay: {
      enabled: boolean;
    };
  };
  strategyOverrides: StrategyOverrides;
  strategyOrder: TransactionPayStrategy[];
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
    pollingInterval?: number;
    pollingTimeout?: number;
  };
};

export type PayStrategiesConfig = {
  across: AcrossConfig;
  relay: {
    enabled: boolean;
  };
};

function normalizeHex(value: string | undefined): Hex | undefined {
  return value?.toLowerCase() as Hex | undefined;
}

function normalizeStrategy(
  strategy: unknown,
): TransactionPayStrategy | undefined {
  if (typeof strategy !== 'string') {
    return undefined;
  }

  const normalizedStrategy = strategy.toLowerCase() as TransactionPayStrategy;

  return isTransactionPayStrategy(normalizedStrategy)
    ? normalizedStrategy
    : undefined;
}

function normalizeStrategyList(strategies: unknown): TransactionPayStrategy[] {
  if (!Array.isArray(strategies)) {
    return [];
  }

  return uniq(
    strategies
      .map((strategy) => normalizeStrategy(strategy))
      .filter(
        (strategy): strategy is TransactionPayStrategy =>
          strategy !== undefined,
      ),
  );
}

function normalizeStrategyOverride(
  override: StrategyOverrideRaw | undefined,
): StrategyOverride {
  const chains = Object.entries(override?.chains ?? {}).reduce<
    Record<Hex, TransactionPayStrategy[]>
  >((result, [chainId, strategies]) => {
    const normalizedStrategies = normalizeStrategyList(strategies);

    if (normalizedStrategies.length) {
      result[normalizeHex(chainId) as Hex] = normalizedStrategies;
    }

    return result;
  }, {});

  const tokens = Object.entries(override?.tokens ?? {}).reduce<
    Record<Hex, Record<Hex, TransactionPayStrategy[]>>
  >((result, [chainId, tokenOverrides]) => {
    const normalizedTokenOverrides = Object.entries(
      tokenOverrides ?? {},
    ).reduce<Record<Hex, TransactionPayStrategy[]>>(
      (tokenResult, [tokenAddress, strategies]) => {
        const normalizedStrategies = normalizeStrategyList(strategies);

        if (normalizedStrategies.length) {
          tokenResult[normalizeHex(tokenAddress) as Hex] = normalizedStrategies;
        }

        return tokenResult;
      },
      {},
    );

    if (Object.keys(normalizedTokenOverrides).length) {
      result[normalizeHex(chainId) as Hex] = normalizedTokenOverrides;
    }

    return result;
  }, {});

  const defaultStrategies = normalizeStrategyList(override?.default);

  return {
    chains,
    default: defaultStrategies.length ? defaultStrategies : undefined,
    tokens,
  };
}

function normalizeStrategyRoutingConfig(
  featureFlags: FeatureFlagsRaw,
): StrategyRoutingConfig {
  const strategyOrder = normalizeStrategyList(featureFlags.strategyOrder);

  return {
    payStrategies: {
      across: {
        enabled: featureFlags.payStrategies?.across?.enabled ?? false,
      },
      relay: {
        enabled: featureFlags.payStrategies?.relay?.enabled ?? true,
      },
    },
    strategyOverrides: {
      default: featureFlags.strategyOverrides?.default
        ? normalizeStrategyOverride(featureFlags.strategyOverrides.default)
        : undefined,
      transactionTypes: Object.entries(
        featureFlags.strategyOverrides?.transactionTypes ?? {},
      ).reduce<Record<string, StrategyOverride>>((result, [type, override]) => {
        result[type] = normalizeStrategyOverride(override);
        return result;
      }, {}),
    },
    strategyOrder:
      strategyOrder.length > 0 ? strategyOrder : [...DEFAULT_STRATEGY_ORDER],
  };
}

function getStrategyRoutingConfig(
  messenger: TransactionPayControllerMessenger,
): StrategyRoutingConfig {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const featureFlags = state.remoteFeatureFlags?.confirmations_pay as
    | FeatureFlagsRaw
    | undefined;

  return normalizeStrategyRoutingConfig(featureFlags ?? {});
}

function filterEnabledStrategies(
  strategies: readonly TransactionPayStrategy[],
  routingConfig: StrategyRoutingConfig,
): TransactionPayStrategy[] {
  return strategies.filter((strategy) => {
    if (strategy === TransactionPayStrategy.Across) {
      return routingConfig.payStrategies.across.enabled;
    }

    if (strategy === TransactionPayStrategy.Relay) {
      return routingConfig.payStrategies.relay.enabled;
    }

    return true;
  });
}

function getTokenOverrideStrategies(
  override: StrategyOverride | undefined,
  normalizedChainId: Hex | undefined,
  normalizedTokenAddress: Hex | undefined,
): readonly TransactionPayStrategy[] | undefined {
  if (!override || !normalizedChainId || !normalizedTokenAddress) {
    return undefined;
  }

  return override.tokens[normalizedChainId]?.[normalizedTokenAddress];
}

function getChainOverrideStrategies(
  override: StrategyOverride | undefined,
  normalizedChainId: Hex | undefined,
): readonly TransactionPayStrategy[] | undefined {
  if (!override || !normalizedChainId) {
    return undefined;
  }

  return override.chains[normalizedChainId];
}

function getDefaultOverrideStrategies(
  override: StrategyOverride | undefined,
): readonly TransactionPayStrategy[] | undefined {
  return override?.default;
}

/**
 * Get ordered list of strategies to try for a route.
 *
 * @param messenger - Controller messenger.
 * @param chainId - Optional chain ID used to match route overrides.
 * @param tokenAddress - Optional token address used to match route overrides.
 * @param transactionType - Optional transaction type used to match route
 * overrides.
 * @returns Ordered strategy list.
 */
export function getStrategyOrder(
  messenger: TransactionPayControllerMessenger,
  chainId?: Hex,
  tokenAddress?: Hex,
  transactionType?: string,
): StrategyOrder {
  const routingConfig = getStrategyRoutingConfig(messenger);
  const normalizedChainId = normalizeHex(chainId);
  const normalizedTokenAddress = normalizeHex(tokenAddress);
  const transactionTypeOverride = transactionType
    ? routingConfig.strategyOverrides.transactionTypes[transactionType]
    : undefined;

  const candidates: (readonly TransactionPayStrategy[] | undefined)[] = [
    getTokenOverrideStrategies(
      transactionTypeOverride,
      normalizedChainId,
      normalizedTokenAddress,
    ),
    getChainOverrideStrategies(transactionTypeOverride, normalizedChainId),
    getTokenOverrideStrategies(
      routingConfig.strategyOverrides.default,
      normalizedChainId,
      normalizedTokenAddress,
    ),
    getChainOverrideStrategies(
      routingConfig.strategyOverrides.default,
      normalizedChainId,
    ),
    getDefaultOverrideStrategies(transactionTypeOverride),
    getDefaultOverrideStrategies(routingConfig.strategyOverrides.default),
  ];

  // Overrides are authoritative. Once a route matches a specific override
  // scope, disabled strategies do not inherit candidates from lower-precedence
  // scopes.
  for (const strategies of candidates) {
    if (strategies) {
      return filterEnabledStrategies(strategies, routingConfig);
    }
  }

  return filterEnabledStrategies(routingConfig.strategyOrder, routingConfig);
}

/**
 * Get the preferred strategy for a route.
 *
 * @param messenger - Controller messenger.
 * @param chainId - Optional chain ID used to match route overrides.
 * @param tokenAddress - Optional token address used to match route overrides.
 * @param transactionType - Optional transaction type used to match route
 * overrides.
 * @returns The preferred strategy, if any.
 */
export function getStrategy(
  messenger: TransactionPayControllerMessenger,
  chainId?: Hex,
  tokenAddress?: Hex,
  transactionType?: string,
): TransactionPayStrategy | undefined {
  return getStrategyOrder(messenger, chainId, tokenAddress, transactionType)[0];
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
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const featureFlags =
    (state.remoteFeatureFlags?.confirmations_pay as
      | FeatureFlagsRaw
      | undefined) ?? {};

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
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const featureFlags =
    (state.remoteFeatureFlags?.confirmations_pay as
      | FeatureFlagsRaw
      | undefined) ?? {};
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
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const featureFlags =
    (state.remoteFeatureFlags?.confirmations_pay as
      | FeatureFlagsRaw
      | undefined) ?? {};
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
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const featureFlags =
    (state.remoteFeatureFlags?.confirmations_pay as
      | FeatureFlagsRaw
      | undefined) ?? {};
  return (
    featureFlags.payStrategies?.relay?.originGasOverhead ??
    DEFAULT_RELAY_ORIGIN_GAS_OVERHEAD
  );
}

/**
 * Get the relay status polling interval in milliseconds.
 * Falls back to the constant default when not configured.
 *
 * @param messenger - Controller messenger.
 * @returns Polling interval in milliseconds.
 */
export function getRelayPollingInterval(
  messenger: TransactionPayControllerMessenger,
): number {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const featureFlags =
    (state.remoteFeatureFlags?.confirmations_pay as
      | FeatureFlagsRaw
      | undefined) ?? {};
  return (
    featureFlags.payStrategies?.relay?.pollingInterval ?? RELAY_POLLING_INTERVAL
  );
}

/**
 * Get the relay status polling timeout in milliseconds.
 * Returns 0 or undefined to indicate no timeout.
 *
 * @param messenger - Controller messenger.
 * @returns Polling timeout in milliseconds, or undefined when not configured.
 */
export function getRelayPollingTimeout(
  messenger: TransactionPayControllerMessenger,
): number | undefined {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const featureFlags =
    (state.remoteFeatureFlags?.confirmations_pay as
      | FeatureFlagsRaw
      | undefined) ?? {};
  return featureFlags.payStrategies?.relay?.pollingTimeout;
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
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const featureFlags =
    (state.remoteFeatureFlags?.confirmations_pay as
      | FeatureFlagsRaw
      | undefined) ?? {};

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
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const featureFlags =
    (state.remoteFeatureFlags?.confirmations_pay as
      | FeatureFlagsRaw
      | undefined) ?? {};
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
 * Get the AssetsUnifyState feature flag state.
 *
 * @param messenger - Controller messenger.
 * @returns True if the assets unify state feature is enabled, false otherwise.
 */
export function getAssetsUnifyStateFeature(
  messenger: TransactionPayControllerMessenger,
): boolean {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const assetsUnifyState = state.remoteFeatureFlags.assetsUnifyState as
    | {
        enabled: boolean;
        featureVersion: string | null;
      }
    | undefined;

  const AssetsUnifyStateFeatureVersion = '1';

  return (
    Boolean(assetsUnifyState?.enabled) &&
    assetsUnifyState?.featureVersion === AssetsUnifyStateFeatureVersion
  );
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
