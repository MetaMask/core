import type { TransactionMeta } from '@metamask/transaction-controller';

import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  PayStrategyResumeRequest,
  TransactionPayQuote,
} from '../../types.js';
import { prefixError } from '../../utils/error-prefix.js';
import { getFiatQuotes } from './fiat-quotes.js';
import { resumeFiatDirectMusd } from './fiat-resume.js';
import { submitFiatQuotes } from './fiat-submit.js';
import type { FiatQuote } from './types.js';

const ERROR_PREFIX = 'Fiat: ';

export class FiatStrategy implements PayStrategy<FiatQuote> {
  async getQuotes(
    request: PayStrategyGetQuotesRequest,
  ): Promise<TransactionPayQuote<FiatQuote>[]> {
    return getFiatQuotes(request);
  }

  async execute(
    request: PayStrategyExecuteRequest<FiatQuote>,
  ): ReturnType<PayStrategy<FiatQuote>['execute']> {
    try {
      const result = await submitFiatQuotes(request);

      if (result.transactionHash === undefined) {
        throw new Error('Missing transaction hash');
      }

      return result;
    } catch (error) {
      throw prefixError(error, ERROR_PREFIX);
    }
  }

  canResume(transaction: TransactionMeta): boolean {
    const { fiat } = transaction.metamaskPay ?? {};
    return Boolean(fiat?.orderId && fiat.provider);
  }

  async resume(
    request: PayStrategyResumeRequest,
  ): ReturnType<NonNullable<PayStrategy<FiatQuote>['resume']>> {
    try {
      const result = await resumeFiatDirectMusd(request);

      if (result.transactionHash === undefined) {
        throw new Error('Missing transaction hash after fiat resume');
      }

      return result;
    } catch (error) {
      throw prefixError(error, ERROR_PREFIX);
    }
  }
}
