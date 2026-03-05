import { getFiatQuotes } from './fiat-quotes';
import { submitFiatQuotes } from './fiat-submit';
import type { FiatOriginalQuote } from './types';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';

export class FiatStrategy implements PayStrategy<FiatOriginalQuote> {
  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<FiatOriginalQuote>[]> {
    return getFiatQuotes(request);
  }

  async execute(
    request: PayStrategyExecuteRequest<FiatOriginalQuote>,
  ): ReturnType<PayStrategy<FiatOriginalQuote>['execute']> {
    return await submitFiatQuotes(request);
  }
}
