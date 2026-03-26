import type { Hex } from '@metamask/utils';
import { uniq } from 'lodash';

import { getConfirmationsPayFeatureFlags } from './confirmations-pay-feature-flags';
import { DEFAULT_STRATEGY_ORDER } from './feature-flags';
import { TransactionPayStrategy, isTransactionPayStrategy } from '../constants';
import type { TransactionPayControllerMessenger } from '../types';

export type TransactionPayRouteContext = {
  chainId?: Hex;
  tokenAddress?: Hex;
  transactionType?: string;
};

type StrategyOverrideRaw = {
  default?: unknown;
  chains?: Record<string, unknown>;
  tokens?: Record<string, Record<string, unknown>>;
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

type RawStrategyRoutingFlags = {
  payStrategies?: {
    across?: {
      enabled?: boolean;
    };
    relay?: {
      enabled?: boolean;
    };
  };
  strategyOverrides?: {
    default?: StrategyOverrideRaw;
    transactionTypes?: Record<string, StrategyOverrideRaw>;
  };
  strategyOrder?: string[];
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
  rawFeatureFlags: unknown,
): StrategyRoutingConfig {
  const featureFlags = (rawFeatureFlags ?? {}) as RawStrategyRoutingFlags;
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
  return normalizeStrategyRoutingConfig(
    getConfirmationsPayFeatureFlags(messenger),
  );
}

function filterEnabledStrategies(
  strategies: readonly TransactionPayStrategy[],
  routingConfig: StrategyRoutingConfig,
): TransactionPayStrategy[] {
  return strategies.filter(
    (strategy) =>
      (strategy === TransactionPayStrategy.Across &&
        routingConfig.payStrategies.across.enabled) ||
      (strategy === TransactionPayStrategy.Relay &&
        routingConfig.payStrategies.relay.enabled),
  );
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
 * Get ordered strategies for a route using generic confirmations_pay routing
 * flags.
 *
 * @param messenger - Controller messenger.
 * @param routeContext - Route context used to match transaction type, chain,
 * and token overrides.
 * @returns Ordered strategy list for the route.
 */
export function getStrategiesForRoute(
  messenger: TransactionPayControllerMessenger,
  routeContext: TransactionPayRouteContext,
): TransactionPayStrategy[] {
  return resolveStrategyOrderForRoute(
    getStrategyRoutingConfig(messenger),
    routeContext,
  );
}

/**
 * Resolve ordered strategies for a route from the normalized strategy routing
 * config.
 *
 * @param routingConfig - Normalized routing config.
 * @param routeContext - Route context used to match transaction type, chain,
 * and token overrides.
 * @returns Ordered strategy list for the route.
 */
function resolveStrategyOrderForRoute(
  routingConfig: StrategyRoutingConfig,
  routeContext: TransactionPayRouteContext,
): TransactionPayStrategy[] {
  const normalizedChainId = normalizeHex(routeContext.chainId);
  const normalizedTokenAddress = normalizeHex(routeContext.tokenAddress);
  const transactionTypeOverride = routeContext.transactionType
    ? routingConfig.strategyOverrides.transactionTypes[
        routeContext.transactionType
      ]
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
