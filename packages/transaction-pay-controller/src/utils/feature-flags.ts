import type { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { uniq } from 'lodash';

import {
  isTransactionPayStrategy,
  STABLECOINS,
  TransactionPayStrategy,
} from '../constants.js';
import { projectLogger } from '../logger.js';
import type { TransactionPayFiatAsset } from '../strategy/fiat/constants.js';
import {
  ETH_MAINNET_FIAT_ASSET,
  FIAT_ASSET_ID_BY_TX_TYPE,
  FIAT_ENABLED_TYPES,
} from '../strategy/fiat/constants.js';
import {
  RELAY_EXECUTE_URL,
  RELAY_POLLING_INTERVAL,
  RELAY_QUOTE_URL,
} from '../strategy/relay/constants.js';
import {
  SERVER_POLLING_INTERVAL,
  SERVER_URL_BASE,
} from '../strategy/server/constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';

const log = createModuleLogger(projectLogger, 'feature-flags');

type StrategyOrder = TransactionPayStrategy[];

export const DEFAULT_FEE_RESERVE_MULTIPLIER = 1.2;
export const DEFAULT_MAX_RATE_DRIFT_PERCENT = 10;
export const DEFAULT_ORDER_POLL_INTERVAL_MS = 1000;
export const DEFAULT_ORDER_POLL_TIMEOUT_MS = 10 * 60 * 1000;

export const DEFAULT_GAS_BUFFER = 1.0;
export const DEFAULT_FALLBACK_GAS_ESTIMATE = 900000;
export const DEFAULT_FALLBACK_GAS_MAX = 1500000;
export const DEFAULT_RELAY_EXECUTE_URL = RELAY_EXECUTE_URL;
export const DEFAULT_RELAY_QUOTE_URL = RELAY_QUOTE_URL;
export const DEFAULT_RELAY_ORIGIN_GAS_OVERHEAD = '300000';
export const DEFAULT_SLIPPAGE = 0.005;
export const DEFAULT_HYPERLIQUID_ACTIVATION_FEE_USD = 1;
export const DEFAULT_ACROSS_API_BASE = 'https://app.across.to/api';
export const DEFAULT_SERVER_BASE_URL = SERVER_URL_BASE;
export const DEFAULT_STRATEGY_ORDER: StrategyOrder = [
  TransactionPayStrategy.Server,
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

type FiatFlags = {
  assetPerTransactionType?: Partial<
    Record<TransactionType, TransactionPayFiatAsset>
  >;
  directMoneyMusdEnabled?: boolean;
  enabledTransactionTypes: TransactionType[];
  feeReserveMultiplier?: number;
  maxRateDriftPercent?: number;
  orderPollIntervalMs?: number;
  orderPollTimeoutMs?: number;
  vaultDisabled?: boolean;
};

type HyperliquidActivationFeeFlag = {
  enabled?: boolean;
  amountUsd?: number;
};

type PostQuoteConfig = {
  hyperliquidActivationFee?: HyperliquidActivationFeeFlag;
};

type PostQuoteFeatureFlags = {
  default?: PostQuoteConfig;
  overrides?: Record<string, PostQuoteConfig>;
};

export type HyperliquidActivationFeeConfig = {
  enabled: boolean;
  amountUsd: number;
};

type StrategyRoutingConfig = {
  payStrategies: {
    across: {
      enabled: boolean;
    };
    server: {
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
    originGasOverhead?: string;
    pollingInterval?: number;
    pollingTimeout?: number;
  };
};

type FeatureFlagsExtendedRaw = {
  excludeChainIdsFromInfura?: Hex[];
  payStrategies?: {
    relay?: {
      gaslessEnabled?: boolean;
    };
    server?: {
      enabled?: boolean;
      baseUrl?: string;
      pollingInterval?: number;
      pollingTimeout?: number;
    };
  };
};

export type PayStrategiesConfig = {
  across: AcrossConfig;
  server: {
    enabled: boolean;
    baseUrl: string;
    pollingInterval: number;
    pollingTimeout?: number;
  };
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
  extendedFeatureFlags: FeatureFlagsExtendedRaw,
): StrategyRoutingConfig {
  const strategyOrder = normalizeStrategyList(featureFlags.strategyOrder);

  return {
    payStrategies: {
      across: {
        enabled: featureFlags.payStrategies?.across?.enabled ?? false,
      },
      server: {
        enabled: extendedFeatureFlags.payStrategies?.server?.enabled ?? false,
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
  const extendedFeatureFlags =
    (state.remoteFeatureFlags?.confirmations_pay_extended as
      | FeatureFlagsExtendedRaw
      | undefined) ?? {};

  return normalizeStrategyRoutingConfig(
    featureFlags ?? {},
    extendedFeatureFlags,
  );
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

    if (strategy === TransactionPayStrategy.Server) {
      return routingConfig.payStrategies.server.enabled;
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
 * @param fiatPaymentMethodId - Optional fiat payment method ID used to match route overrides.
 * @returns Ordered strategy list.
 */
export function getStrategyOrder(
  messenger: TransactionPayControllerMessenger,
  chainId?: Hex,
  tokenAddress?: Hex,
  transactionType?: string,
  fiatPaymentMethodId?: string,
): StrategyOrder {
  // If fiat payment method is selected, use Fiat strategy only
  if (fiatPaymentMethodId) {
    return [TransactionPayStrategy.Fiat];
  }

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

  const estimate = new BigNumber(
    featureFlags.relayFallbackGas?.estimate ?? DEFAULT_FALLBACK_GAS_ESTIMATE,
  ).toNumber();

  const max = new BigNumber(
    featureFlags.relayFallbackGas?.max ?? DEFAULT_FALLBACK_GAS_MAX,
  ).toNumber();

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
 * Get the stablecoins map from the `stable-tokens` feature flag.
 * Falls back to the hardcoded {@link STABLECOINS} constant when the flag is
 * absent or not a valid object.
 *
 * @param messenger - Controller messenger.
 * @returns Stablecoins keyed by chain ID.
 */
export function getStablecoins(
  messenger: TransactionPayControllerMessenger,
): Record<Hex, Hex[]> {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const flag = state.remoteFeatureFlags?.['stable-tokens'];

  if (flag && typeof flag === 'object' && !Array.isArray(flag)) {
    const raw = flag as Record<string, string[]>;
    return Object.entries(raw).reduce<Record<Hex, Hex[]>>(
      (acc, [chainId, addresses]) => {
        if (Array.isArray(addresses)) {
          acc[chainId.toLowerCase() as Hex] = addresses.map(
            (a) => a.toLowerCase() as Hex,
          );
        }
        return acc;
      },
      {},
    );
  }

  return STABLECOINS;
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
  const extendedFeatureFlags =
    (state.remoteFeatureFlags?.confirmations_pay_extended as
      | FeatureFlagsExtendedRaw
      | undefined) ?? {};
  const payStrategies = featureFlags.payStrategies ?? {};
  const extendedPayStrategies = extendedFeatureFlags.payStrategies ?? {};

  const acrossRaw = payStrategies.across ?? {};
  const serverRaw = extendedPayStrategies.server ?? {};
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

  const server = {
    enabled: serverRaw.enabled ?? false,
    baseUrl: serverRaw.baseUrl ?? DEFAULT_SERVER_BASE_URL,
    pollingInterval: serverRaw.pollingInterval ?? SERVER_POLLING_INTERVAL,
    pollingTimeout: serverRaw.pollingTimeout,
  };

  const relay = {
    enabled: relayRaw.enabled ?? true,
  };

  return {
    across,
    server,
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
    (state.remoteFeatureFlags?.confirmations_pay_extended as
      | FeatureFlagsExtendedRaw
      | undefined) ?? {};
  return featureFlags.payStrategies?.relay?.gaslessEnabled ?? false;
}

/**
 * Whether a chain is excluded from preferring Infura for balance queries.
 *
 * When a chain ID appears in the `confirmations_pay_extended.excludeChainIdsFromInfura`
 * feature flag array, the Infura RPC endpoint should not be forced for that chain.
 *
 * @param messenger - Controller messenger.
 * @param chainId - Chain ID to check.
 * @returns True if the chain should skip the Infura preference.
 */
export function isChainExcludedFromInfura(
  messenger: TransactionPayControllerMessenger,
  chainId: Hex,
): boolean {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const featureFlags =
    (state.remoteFeatureFlags?.confirmations_pay_extended as
      | FeatureFlagsExtendedRaw
      | undefined) ?? {};

  const excludedChains = featureFlags.excludeChainIdsFromInfura ?? [];

  return excludedChains.some(
    (excluded) => excluded.toLowerCase() === chainId.toLowerCase(),
  );
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
 * Get the server strategy status polling interval in milliseconds.
 *
 * @param messenger - Controller messenger.
 * @returns Polling interval in milliseconds.
 */
export function getServerPollingInterval(
  messenger: TransactionPayControllerMessenger,
): number {
  return getPayStrategiesConfig(messenger).server.pollingInterval;
}

/**
 * Get the server strategy status polling timeout in milliseconds.
 *
 * @param messenger - Controller messenger.
 * @returns Polling timeout in milliseconds, or undefined when not configured.
 */
export function getServerPollingTimeout(
  messenger: TransactionPayControllerMessenger,
): number | undefined {
  return getPayStrategiesConfig(messenger).server.pollingTimeout;
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
 * Get the fiat asset for a specific transaction type.
 *
 * Resolution order:
 * 1. Feature flag override (`confirmations_pay_fiat.assetPerTransactionType`)
 * 2. Hardcoded constant (`FIAT_ASSET_ID_BY_TX_TYPE`)
 * 3. ETH mainnet fallback
 *
 * @param messenger - Controller messenger.
 * @param transactionType - Transaction type to look up.
 * @returns The fiat asset for the given transaction type.
 */
export function getFiatAssetPerTransactionType(
  messenger: TransactionPayControllerMessenger,
  transactionType?: TransactionType,
): TransactionPayFiatAsset {
  if (!transactionType) {
    return ETH_MAINNET_FIAT_ASSET;
  }

  const state = messenger.call('RemoteFeatureFlagController:getState');
  const fiatFlags = state.remoteFeatureFlags?.confirmations_pay_fiat as
    | FiatFlags
    | undefined;

  return (
    fiatFlags?.assetPerTransactionType?.[transactionType] ??
    FIAT_ASSET_ID_BY_TX_TYPE[transactionType] ??
    ETH_MAINNET_FIAT_ASSET
  );
}

/**
 * Get the enabled fiat transaction types.
 *
 * @param messenger - Controller messenger.
 * @returns The enabled fiat transaction types.
 */
export function getFiatEnabledTypes(
  messenger: TransactionPayControllerMessenger,
): TransactionType[] {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const fiatFlags = state.remoteFeatureFlags?.confirmations_pay_fiat as
    | FiatFlags
    | undefined;

  return fiatFlags?.enabledTransactionTypes ?? FIAT_ENABLED_TYPES;
}

/**
 * Returns the fee reserve multiplier for fiat three-phase submit.
 *
 * Controls how much of the original relay fee is reserved from the discovery
 * quote source amount to prevent EXACT_OUTPUT cost overruns.
 *
 * @param messenger - Controller messenger.
 * @returns The fee reserve multiplier.
 */
export function getFiatFeeReserveMultiplier(
  messenger: TransactionPayControllerMessenger,
): number {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const fiatFlags = state.remoteFeatureFlags?.confirmations_pay_fiat as
    | FiatFlags
    | undefined;

  const multiplier = fiatFlags?.feeReserveMultiplier;

  return typeof multiplier === 'number' && multiplier > 0
    ? multiplier
    : DEFAULT_FEE_RESERVE_MULTIPLIER;
}

/**
 * Returns the maximum allowed relay rate drift percentage for fiat submit.
 *
 * Controls how much the relay exchange rate can drift between the original
 * quoting phase and the post-settlement discovery quote before failing.
 * Defaults to 10%.
 *
 * @param messenger - Controller messenger.
 * @returns The maximum rate drift percentage.
 */
export function getFiatMaxRateDriftPercent(
  messenger: TransactionPayControllerMessenger,
): number {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const fiatFlags = state.remoteFeatureFlags?.confirmations_pay_fiat as
    | FiatFlags
    | undefined;

  const maxDrift = fiatFlags?.maxRateDriftPercent;

  return typeof maxDrift === 'number' && maxDrift > 0
    ? maxDrift
    : DEFAULT_MAX_RATE_DRIFT_PERCENT;
}

export function getDirectMoneyMusdEnabled(
  messenger: TransactionPayControllerMessenger,
): boolean {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const fiatFlags = state.remoteFeatureFlags?.confirmations_pay_fiat as
    | FiatFlags
    | undefined;
  return fiatFlags?.directMoneyMusdEnabled === true;
}

export function getFiatVaultDisabled(
  messenger: TransactionPayControllerMessenger,
): boolean {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const fiatFlags = state.remoteFeatureFlags?.confirmations_pay_fiat as
    | FiatFlags
    | undefined;
  return fiatFlags?.vaultDisabled === true;
}

/**
 * Returns the fiat order poll interval in milliseconds.
 *
 * Controls how frequently the fiat order status is polled during
 * the on-ramp completion wait loop. Defaults to 1 000 ms.
 *
 * @param messenger - Controller messenger.
 * @returns The poll interval in milliseconds.
 */
export function getFiatOrderPollIntervalMs(
  messenger: TransactionPayControllerMessenger,
): number {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const fiatFlags = state.remoteFeatureFlags?.confirmations_pay_fiat as
    | FiatFlags
    | undefined;

  const interval = fiatFlags?.orderPollIntervalMs;

  return typeof interval === 'number' && interval > 0
    ? interval
    : DEFAULT_ORDER_POLL_INTERVAL_MS;
}

/**
 * Returns the fiat order poll timeout in milliseconds.
 *
 * Controls how long the fiat order polling loop waits for a terminal
 * status before timing out. Defaults to 600 000 ms (10 minutes).
 *
 * @param messenger - Controller messenger.
 * @returns The poll timeout in milliseconds.
 */
export function getFiatOrderPollTimeoutMs(
  messenger: TransactionPayControllerMessenger,
): number {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const fiatFlags = state.remoteFeatureFlags?.confirmations_pay_fiat as
    | FiatFlags
    | undefined;

  const timeout = fiatFlags?.orderPollTimeoutMs;

  return typeof timeout === 'number' && timeout > 0
    ? timeout
    : DEFAULT_ORDER_POLL_TIMEOUT_MS;
}

/**
 * Get the HyperLiquid activation-fee configuration from the
 * `confirmations_pay_post_quote` feature flag for a transaction type.
 *
 * Resolves the transaction type's
 * `overrides.<transactionType>.hyperliquidActivationFee`, falling back to
 * `default.hyperliquidActivationFee`.
 *
 * When enabled, an unactivated HyperCore account withdrawing via Pay has the
 * one-time activation fee reserved from the amount sent to HyperLiquid (so the
 * `sendAsset` step retains enough balance) and surfaced as part of the
 * provider fee. Defaults to disabled with a $1 fee.
 *
 * @param messenger - Controller messenger.
 * @param transactionType - Parent transaction type used to resolve overrides.
 * @returns The activation-fee configuration.
 */
export function getHyperliquidActivationFeeConfig(
  messenger: TransactionPayControllerMessenger,
  transactionType?: string,
): HyperliquidActivationFeeConfig {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const featureFlags = state.remoteFeatureFlags
    ?.confirmations_pay_post_quote as PostQuoteFeatureFlags | undefined;

  const override = transactionType
    ? featureFlags?.overrides?.[transactionType]
    : undefined;
  const config =
    override?.hyperliquidActivationFee ??
    featureFlags?.default?.hyperliquidActivationFee;

  const { amountUsd } = config ?? {};

  return {
    enabled: config?.enabled ?? false,
    amountUsd:
      typeof amountUsd === 'number' && amountUsd > 0
        ? amountUsd
        : DEFAULT_HYPERLIQUID_ACTIVATION_FEE_USD,
  };
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
