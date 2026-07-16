import type { TransactionMeta } from '@metamask/transaction-controller';

import type { QuoteRequest } from '../../types.js';
import { isPredictWithdrawTransaction } from '../../utils/transaction.js';

/**
 * Check whether an authorization list on the original transaction is unsupported by Across.
 *
 * Predict withdraw post-quote requests do not use Across destination actions;
 * the original withdrawal is submitted by MetaMask on the source chain before
 * the Across deposit leg. That keeps a source-chain authorization list out of
 * Across' post-swap action payload.
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
