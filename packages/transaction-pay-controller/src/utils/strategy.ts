import type { TransactionMeta } from '@metamask/transaction-controller';

import { TransactionPayStrategy } from '../constants';
import { BridgeStrategy } from '../strategy/bridge/BridgeStrategy';
import { RelayStrategy } from '../strategy/relay/RelayStrategy';
import { TestStrategy } from '../strategy/test/TestStrategy';
import type { PayStrategy, TransactionPayControllerMessenger } from '../types';

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
  const strategyName = messenger.call(
    'TransactionPayController:getStrategy',
    transaction,
  );

  return getStrategyByName(strategyName);
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
