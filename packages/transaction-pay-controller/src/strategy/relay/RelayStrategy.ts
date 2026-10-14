import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types.js';
import { getPayStrategiesConfig } from '../../utils/feature-flags.js';
import { getRelayQuotes } from './relay-quotes.js';
import { submitRelayQuotes } from './relay-submit.js';
import type { RelayQuote } from './types.js';

export class RelayStrategy implements PayStrategy<RelayQuote> {
  supports(request: PayStrategyGetQuotesRequest): boolean {
    const config = getPayStrategiesConfig(request.messenger);
    return config.relay.enabled;
  }

  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<RelayQuote>[]> {
    return getRelayQuotes(request);
  }

  async execute(
    request: PayStrategyExecuteRequest<RelayQuote>,
  ): ReturnType<PayStrategy<RelayQuote>['execute']> {
    return await submitRelayQuotes(request);
  }
}
