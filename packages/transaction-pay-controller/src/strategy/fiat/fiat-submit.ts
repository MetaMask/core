import type { PayStrategy, PayStrategyExecuteRequest } from '../../types';
import type { FiatQuote } from './types';

/**
 * Submit Fiat quotes.
 *
 * @param _request - Strategy execute request.
 * @returns Empty transaction hash until fiat submit implementation is added.
 */
export async function submitFiatQuotes(
  _request: PayStrategyExecuteRequest<FiatQuote>,
): ReturnType<PayStrategy<FiatQuote>['execute']> {
  return { transactionHash: undefined };
}
