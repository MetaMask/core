import { rpcErrors } from '@metamask/rpc-errors';
import { TransactionStatus } from '../types.js';
import type { TransactionLifecycleContext } from './state.js';

/**
 * Resolve the result of a transaction once it has reached a final state.
 *
 * Settles the approval request and returns the transaction hash, or throws if
 * the transaction failed or ended in an unexpected state.
 *
 * @param request - Context for the transaction.
 * @returns The hash of the submitted transaction.
 */
export async function finishTransaction(
  request: TransactionLifecycleContext,
): Promise<string> {
  const {
    lifecycle: { finishedPromise, resultCallbacks },
    transactionMeta,
  } = request;
  const { id: transactionId } = transactionMeta;
  if (transactionMeta.isStateOnly) {
    return '';
  }

  const finalMeta = await finishedPromise;

  switch (finalMeta?.status) {
    case TransactionStatus.failed: {
      const error = finalMeta.error as Error;
      resultCallbacks?.error(error);
      throw rpcErrors.internal(error.message);
    }

    case TransactionStatus.submitted:
      resultCallbacks?.success();
      return finalMeta.hash as string;

    default: {
      const internalError = rpcErrors.internal(
        `MetaMask Tx Signature: Unknown problem: ${JSON.stringify(
          finalMeta ?? transactionId,
        )}`,
      );

      resultCallbacks?.error(internalError);
      throw internalError;
    }
  }
}
