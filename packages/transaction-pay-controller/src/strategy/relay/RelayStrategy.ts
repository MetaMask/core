import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetRefreshIntervalRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import { getMaxAmountRefreshInterval } from '../../utils/max-quote.js';
import { isEvmQuoteRequest } from '../../utils/token.js';
import { getRelayQuotes } from './relay-quotes.js';
import { submitRelayQuotes } from './relay-submit.js';
import type { RelayQuote } from './types.js';

/**
 * Pay strategy that quotes and submits through Relay. Only supports requests
 * with an EVM source asset.
 */
export class RelayStrategy implements PayStrategy<RelayQuote> {
  supports(request: PayStrategyGetQuotesRequest): boolean {
    const config = getPayStrategiesConfig(request.messenger);

    return config.relay.enabled && request.requests.every(isEvmQuoteRequest);
  }

  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<RelayQuote>[]> {
    return getRelayQuotes(request);
  }

  async getRefreshInterval(
    request: PayStrategyGetRefreshIntervalRequest,
  ): Promise<number | undefined> {
    return getMaxAmountRefreshInterval(request);
  }

  async execute(
    request: PayStrategyExecuteRequest<RelayQuote>,
  ): ReturnType<PayStrategy<RelayQuote>['execute']> {
    return await submitRelayQuotes(request);
  }
}
