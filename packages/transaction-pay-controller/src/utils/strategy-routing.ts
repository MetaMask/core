import type { Hex } from '@metamask/utils';
import { uniq } from 'lodash';

import { TransactionPayStrategy, isTransactionPayStrategy } from '../constants';
import type { TransactionPayControllerMessenger } from '../types';
import {
  DEFAULT_STRATEGY_ORDER,
  getConfirmationsPayFeatureFlags,
} from './feature-flags';

export type TransactionPayRouteContext = {
  chainId?: Hex;
  tokenAddress?: Hex;
  transactionType?: string;
};

type RoutingOverrideRaw = {
  default?: unknown;
  chains?: Record<string, unknown>;
  tokens?: Record<string, Record<string, unknown>>;
};

type RoutingOverride = {
  chains: Record<Hex, TransactionPayStrategy[]>;
  default?: TransactionPayStrategy[];
  tokens: Record<Hex, Record<Hex, TransactionPayStrategy[]>>;
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
  routingOverrides?: {
    overrides?: Record<string, RoutingOverrideRaw>;
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
  routingOverrides: {
    overrides: Record<string, RoutingOverride>;
  };
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

function normalizeRoutingOverride(
  override: RoutingOverrideRaw | undefined,
): RoutingOverride {
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
    routingOverrides: {
      overrides: Object.entries(
        featureFlags.routingOverrides?.overrides ?? {},
      ).reduce<Record<string, RoutingOverride>>((result, [type, override]) => {
        result[type] = normalizeRoutingOverride(override);
        return result;
      }, {}),
    },
    strategyOrder:
      strategyOrder.length > 0 ? strategyOrder : [...DEFAULT_STRATEGY_ORDER],
  };
}

function filterEnabledStrategies(
  strategies: readonly TransactionPayStrategy[] | undefined,
  routingConfig: StrategyRoutingConfig,
): TransactionPayStrategy[] {
  if (!strategies?.length) {
    return [];
  }

  return strategies.filter(
    (strategy) =>
      (strategy === TransactionPayStrategy.Across &&
        routingConfig.payStrategies.across.enabled) ||
      (strategy === TransactionPayStrategy.Relay &&
        routingConfig.payStrategies.relay.enabled),
  );
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
export function getStrategyOrderForRoute(
  messenger: TransactionPayControllerMessenger,
  routeContext: TransactionPayRouteContext,
): TransactionPayStrategy[] {
  return getStrategyOrderForRouteFromFeatureFlags(
    getConfirmationsPayFeatureFlags(messenger),
    routeContext,
  );
}

/**
 * Resolve ordered strategies for a route from raw confirmations_pay feature
 * flags.
 *
 * @param rawFeatureFlags - Raw confirmations_pay flag block.
 * @param routeContext - Route context used to match transaction type, chain,
 * and token overrides.
 * @returns Ordered strategy list for the route.
 */
export function getStrategyOrderForRouteFromFeatureFlags(
  rawFeatureFlags: unknown,
  routeContext: TransactionPayRouteContext,
): TransactionPayStrategy[] {
  const routingConfig = normalizeStrategyRoutingConfig(rawFeatureFlags);
  const { chainId, tokenAddress, transactionType } = routeContext;
  const normalizedChainId = normalizeHex(chainId);
  const normalizedTokenAddress = normalizeHex(tokenAddress);
  const override = transactionType
    ? routingConfig.routingOverrides.overrides[transactionType]
    : undefined;

  const candidates: (readonly TransactionPayStrategy[] | undefined)[] = [
    normalizedChainId && normalizedTokenAddress
      ? override?.tokens[normalizedChainId]?.[normalizedTokenAddress]
      : undefined,
    normalizedChainId ? override?.chains[normalizedChainId] : undefined,
    override?.default,
    routingConfig.strategyOrder,
  ];

  for (const strategies of candidates) {
    const resolvedStrategies = filterEnabledStrategies(
      strategies,
      routingConfig,
    );

    if (resolvedStrategies.length) {
      return resolvedStrategies;
    }
  }

  return [];
}
