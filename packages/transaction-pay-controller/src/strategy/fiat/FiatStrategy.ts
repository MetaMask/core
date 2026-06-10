import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';
import { getUseFiatMUSDQuoteToInjectForMoneyAccount } from '../../utils/feature-flags';
import { getDirectMusdToMoneyAccountQuotes } from './fiat-direct-musd-quotes-for-money-account';
import { getFiatQuotes } from './fiat-quotes';
import { submitFiatQuotes } from './fiat-submit';
import type { FiatQuote } from './types';
import { isMoneyAccountDepositTransaction } from './utils';

export class FiatStrategy implements PayStrategy<FiatQuote> {
  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<FiatQuote>[]> {
    if (
      getUseFiatMUSDQuoteToInjectForMoneyAccount(request.messenger) &&
      isMoneyAccountDepositTransaction(request.transaction)
    ) {
      const directQuotes = await getDirectMusdToMoneyAccountQuotes(request);
      if (directQuotes.length > 0) {
        return directQuotes;
      }
    }
    return getFiatQuotes(request);
  }

  async execute(
    request: PayStrategyExecuteRequest<FiatQuote>,
  ): ReturnType<PayStrategy<FiatQuote>['execute']> {
    return await submitFiatQuotes(request);
  }
}
