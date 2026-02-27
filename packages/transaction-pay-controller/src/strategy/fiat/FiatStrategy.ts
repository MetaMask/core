import { getFiatQuotes } from './fiat-quotes';
import { submitFiatQuotes } from './fiat-submit';
import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';

export class FiatStrategy implements PayStrategy<unknown> {
  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<unknown>[]> {
    return getFiatQuotes(request);
  }

  async execute(
    request: PayStrategyExecuteRequest<unknown>,
  ): ReturnType<PayStrategy<unknown>['execute']> {
    return await submitFiatQuotes(request);
  }
}
