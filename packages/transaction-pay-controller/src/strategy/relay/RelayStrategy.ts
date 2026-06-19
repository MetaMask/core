import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import { prefixError } from '../../utils/error-prefix';
import { getPayStrategiesConfig } from '../../utils/feature-flags';
import { getRelayQuotes } from './relay-quotes';
import { submitRelayQuotes } from './relay-submit';
import type { RelayQuote } from './types';

const ERROR_PREFIX = 'Relay: ';

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
    try {
      const result = await submitRelayQuotes(request);

      if (result.transactionHash === undefined) {
        throw new Error('Missing transaction hash');
      }

      return result;
    } catch (error) {
      throw prefixError(error, ERROR_PREFIX);
    }
  }
}
