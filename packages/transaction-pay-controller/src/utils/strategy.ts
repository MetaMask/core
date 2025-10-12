import type { TransactionMeta } from '@metamask/transaction-controller';

import type { TransactionPayPublishHookMessenger } from '..';
import { TransactionPayStrategy } from '../constants';
import { BridgeStrategy } from '../strategy/bridge/BridgeStrategy';
import { TestStrategy } from '../strategy/TestStrategy';
import type { PayStrategy } from '../types';

/**
 * Get the payment strategy instance.
 *
 * @param messenger - Controller messenger
 * @param transaction - Transaction to get the strategy for.
 * @returns The payment strategy instance.
 */
export async function getStrategy(
  messenger: TransactionPayPublishHookMessenger,
  transaction: TransactionMeta,
): Promise<PayStrategy<unknown>> {
  const strategyName = await messenger.call(
    'TransactionPayController:getStrategy',
    transaction,
  );

  switch (strategyName) {
    case TransactionPayStrategy.Bridge:
      return new BridgeStrategy() as never;

    case TransactionPayStrategy.Test:
      return new TestStrategy() as never;

    default:
      throw new Error(`Unknown strategy: ${strategyName as string}`);
  }
}
