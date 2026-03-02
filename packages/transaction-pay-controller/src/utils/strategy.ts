import { TransactionPayStrategy } from '../constants';
import { BridgeStrategy } from '../strategy/bridge/BridgeStrategy';
import { FiatStrategy } from '../strategy/fiat/FiatStrategy';
import { RelayStrategy } from '../strategy/relay/RelayStrategy';
import { TestStrategy } from '../strategy/test/TestStrategy';
import type { PayStrategy } from '../types';

export type NamedStrategy = {
  name: TransactionPayStrategy;
  strategy: PayStrategy<unknown>;
};

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

    case TransactionPayStrategy.Fiat:
      return new FiatStrategy() as never;

    case TransactionPayStrategy.Test:
      return new TestStrategy() as never;

    default:
      throw new Error(`Unknown strategy: ${strategyName as string}`);
  }
}

/**
 * Resolve strategy names into strategy instances, skipping unknown entries.
 *
 * @param strategyNames - Ordered strategy names.
 * @param onUnknownStrategy - Callback invoked for unknown strategies.
 * @returns Ordered valid strategies with names.
 */
export function getStrategiesByName(
  strategyNames: TransactionPayStrategy[],
  onUnknownStrategy?: (strategyName: TransactionPayStrategy) => void,
): NamedStrategy[] {
  return strategyNames
    .map((strategyName) => {
      try {
        return {
          name: strategyName,
          strategy: getStrategyByName(strategyName),
        };
      } catch {
        onUnknownStrategy?.(strategyName);
        return undefined;
      }
    })
    .filter(
      (namedStrategy): namedStrategy is NamedStrategy =>
        namedStrategy !== undefined,
    );
}
