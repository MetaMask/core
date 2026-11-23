import type { TransactionMeta } from '@metamask/transaction-controller';

import type {
  PayStrategy,
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  PayStrategyResumeRequest,
  TransactionPayQuote,
} from '../../types.js';
import { prefixError } from '../../utils/error-prefix.js';
import { isEvmQuoteRequest } from '../../utils/token.js';
import { getFiatQuotes } from './fiat-quotes.js';
import { resumeFiatDirectMusd } from './fiat-resume.js';
import { submitFiatQuotes } from './fiat-submit.js';
import type { FiatQuote } from './types.js';
import { isMoneyAccountDepositTransaction } from './utils.js';

const ERROR_PREFIX = 'Fiat: ';

export class FiatStrategy implements PayStrategy<FiatQuote> {
  supports(request: PayStrategyGetQuotesRequest): boolean {
    return request.requests.every(isEvmQuoteRequest);
  }

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

  /**
   * Only the direct mUSD Money Account flow can be resumed, so the
   * transaction must be a Money Account deposit with persisted order metadata.
   *
   * @param transaction - The transaction to check.
   * @returns True if the transaction can be resumed.
   */
  canResume(transaction: TransactionMeta): boolean {
    const { fiat } = transaction.metamaskPay ?? {};

    return Boolean(
      fiat?.orderId &&
      fiat.provider &&
      isMoneyAccountDepositTransaction(transaction),
    );
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
