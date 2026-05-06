import type { TransactionMeta } from '@metamask/transaction-controller';

import type { QuoteRequest } from '../../types';
import { isPredictWithdrawTransaction } from '../../utils/transaction';

/**
 * Check whether an authorization list on the original transaction is unsupported by Across.
 *
 * Predict withdraw post-quote requests have no Across destination actions, so
 * the authorization list applies to MetaMask's source-chain batch instead of an
 * Across post-swap action.
 *
 * @param transaction - Original transaction metadata.
 * @param requests - Across quote requests.
 * @returns `true` if the authorization list should block Across.
 */
export function hasUnsupportedTransactionAuthorizationList(
  transaction: TransactionMeta,
  requests: QuoteRequest[],
): boolean {
  if (!transaction.txParams?.authorizationList?.length) {
    return false;
  }

  return (
    !isPredictWithdrawTransaction(transaction) ||
    requests.some((request) => request.isPostQuote !== true)
  );
}
