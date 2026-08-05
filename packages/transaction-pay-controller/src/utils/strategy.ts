import { TransactionPayStrategy } from '../constants.js';
import { AcrossStrategy } from '../strategy/across/AcrossStrategy.js';
import { FiatStrategy } from '../strategy/fiat/FiatStrategy.js';
import { RelayStrategy } from '../strategy/relay/RelayStrategy.js';
import { ServerStrategy } from '../strategy/server/ServerStrategy.js';
import type {
  PayStrategy,
  PayStrategyCheckQuoteSupportRequest,
  PayStrategyGetQuotesRequest,
} from '../types.js';

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
    case TransactionPayStrategy.Across:
      return new AcrossStrategy() as never;

    case TransactionPayStrategy.Relay:
      return new RelayStrategy() as never;

    case TransactionPayStrategy.Fiat:
      return new FiatStrategy() as never;

    case TransactionPayStrategy.Server:
      return new ServerStrategy() as never;

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

/**
 * Check whether a strategy supports a quote request.
 *
 * Defaults to supported when the strategy has no request-level limitations.
 *
 * @param strategy - Strategy instance.
 * @param request - Quote request.
 * @returns Whether the strategy supports the request.
 */
export async function checkStrategySupport(
  strategy: PayStrategy<unknown>,
  request: PayStrategyGetQuotesRequest,
): Promise<boolean> {
  return strategy.supports ? await strategy.supports(request) : true;
}

/**
 * Check whether a strategy supports quotes after quote construction.
 *
 * Defaults to supported when the strategy has no post-quote limitations.
 *
 * @param strategy - Strategy instance.
 * @param request - Post-quote support request.
 * @returns Whether the strategy supports the quotes.
 */
export async function checkStrategyQuoteSupport(
  strategy: PayStrategy<unknown>,
  request: PayStrategyCheckQuoteSupportRequest<unknown>,
): Promise<boolean> {
  if (strategy.checkQuoteSupport) {
    return await strategy.checkQuoteSupport(request);
  }

  return true;
}
