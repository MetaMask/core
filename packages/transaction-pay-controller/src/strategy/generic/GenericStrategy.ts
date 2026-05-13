import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import { getPayStrategiesConfig } from '../../utils/feature-flags';
import { getGenericQuotes } from './generic-quotes';
import { submitGenericQuotes } from './generic-submit';
import type { GenericQuote } from './types';

export class GenericStrategy implements PayStrategy<GenericQuote> {
  supports(request: PayStrategyGetQuotesRequest): boolean {
    const config = getPayStrategiesConfig(request.messenger);
    return config.generic.enabled;
  }

  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<GenericQuote>[]> {
    return getGenericQuotes(request);
  }

  async getBatchTransactions(): Promise<[]> {
    return [];
  }

  async execute(
    request: PayStrategyExecuteRequest<GenericQuote>,
  ): ReturnType<PayStrategy<GenericQuote>['execute']> {
    try {
      return await submitGenericQuotes(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Generic submit: ${message}`);
    }
  }
}
