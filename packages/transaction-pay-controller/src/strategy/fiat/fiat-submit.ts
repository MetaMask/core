import type { FiatOriginalQuote } from './types';
import type { PayStrategy, PayStrategyExecuteRequest } from '../../types';

/**
 * Submit Fiat quotes.
 *
 * @param _request - Strategy execute request.
 * @returns Empty transaction hash until fiat implementation is added.
 */
export async function submitFiatQuotes(
  _request: PayStrategyExecuteRequest<FiatOriginalQuote>,
): ReturnType<PayStrategy<FiatOriginalQuote>['execute']> {
  return { transactionHash: undefined };
}
