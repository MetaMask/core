import type {
  PayStrategy,
  PayStrategyCheckQuoteSupportRequest,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  PayStrategyQuoteSupportResult,
  TransactionPayQuote,
} from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';
import { getRelayQuotes } from './relay-quotes';
import { submitRelayQuotes } from './relay-submit';
import { validateRelayQuoteSupport } from './relay-validation';
import type { RelayQuote } from './types';

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

  async checkQuoteSupport(
    request: PayStrategyCheckQuoteSupportRequest<RelayQuote>,
  ): Promise<PayStrategyQuoteSupportResult> {
    return await validateRelayQuoteSupport(request);
  }

  async execute(
    request: PayStrategyExecuteRequest<RelayQuote>,
  ): ReturnType<PayStrategy<RelayQuote>['execute']> {
    try {
      return await submitRelayQuotes(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Relay submit: ${message}`);
    }
  }
}
