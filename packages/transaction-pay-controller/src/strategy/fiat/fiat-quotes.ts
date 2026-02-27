import type {
  PayStrategyGetQuotesRequest,
  TransactionPayQuote,
} from '../../types';

/**
 * Fetch Fiat quotes.
 *
 * @param _request - Strategy quotes request.
 * @returns Empty quotes list until fiat implementation is added.
 */
export async function getFiatQuotes(
  _request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<unknown>[]> {
  return [];
}
