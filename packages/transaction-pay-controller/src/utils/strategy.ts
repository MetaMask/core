import type { TransactionMeta } from '@metamask/transaction-controller';

import { TransactionPayStrategy } from '../constants';
import { AcrossStrategy } from '../strategy/across/AcrossStrategy';
import { BridgeStrategy } from '../strategy/bridge/BridgeStrategy';
import { RelayStrategy } from '../strategy/relay/RelayStrategy';
import { TestStrategy } from '../strategy/test/TestStrategy';
import type { PayStrategy, TransactionPayControllerMessenger } from '../types';

/**
 * Get the ordered list of payment strategy instances.
 *
 * @param messenger - Controller messenger
 * @param transaction - Transaction to get the strategy for.
 * @returns The ordered payment strategy instances.
 */
export function getStrategies(
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): PayStrategy<unknown>[] {
  const strategyNames =
    messenger.call('TransactionPayController:getStrategies', transaction) ?? [];

  return strategyNames
    .map((strategyName) => {
      try {
        return getStrategyByName(strategyName);
      } catch {
        return undefined;
      }
    })
    .filter(Boolean) as PayStrategy<unknown>[];
}

/**
 * Select the first compatible strategy for a request.
 *
 * @param strategies - Ordered strategies.
 * @param request - Quote request.
 * @returns The selected strategy instance.
 */
export function selectStrategy(
  strategies: PayStrategy<unknown>[],
  request: Parameters<Required<PayStrategy<unknown>>['getQuotes']>[0],
): PayStrategy<unknown> {
  for (const strategy of strategies) {
    if (!strategy.supports || strategy.supports(request)) {
      return strategy;
    }
  }

  throw new Error('No compatible strategy found');
}

/**
 * Get the payment strategy instance.
 *
 * @param messenger - Controller messenger
 * @param transaction - Transaction to get the strategy for.
 * @returns The payment strategy instance.
 */
export function getStrategy(
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): PayStrategy<unknown> {
  const strategies = getStrategies(messenger, transaction);

  if (!strategies.length) {
    throw new Error('No strategies configured');
  }

  return strategies[0];
}

/**
 * Get strategy instance by name.
 *
 * @param strategyName - Strategy name.
 * @returns - Strategy instance.
 */
export function getStrategyByName(
  strategyName: TransactionPayStrategy,
): PayStrategy<unknown> {
  switch (strategyName) {
    case TransactionPayStrategy.Across:
      return new AcrossStrategy() as never;

    case TransactionPayStrategy.Bridge:
      return new BridgeStrategy() as never;

    case TransactionPayStrategy.Relay:
      return new RelayStrategy() as never;

    case TransactionPayStrategy.Test:
      return new TestStrategy() as never;

    default:
      throw new Error(`Unknown strategy: ${strategyName as string}`);
  }
}
