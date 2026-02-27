import type { PayStrategy, PayStrategyExecuteRequest } from '../../types';

/**
 * Submit Fiat quotes.
 *
 * @param _request - Strategy execute request.
 * @returns Empty transaction hash until fiat implementation is added.
 */
export async function submitFiatQuotes(
  _request: PayStrategyExecuteRequest<unknown>,
): ReturnType<PayStrategy<unknown>['execute']> {
  return { transactionHash: undefined };
}
