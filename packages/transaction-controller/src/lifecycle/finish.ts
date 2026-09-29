import { rpcErrors } from '@metamask/rpc-errors';

import { createModuleLogger, lifecycleLogger } from '../logger.js';
import { TransactionStatus } from '../types.js';
import type { TransactionLifecycleRequest } from './types.js';

const log = createModuleLogger(lifecycleLogger, 'finish');

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
  request: TransactionLifecycleRequest,
): Promise<string> {
  const {
    lifecycle: { finishedPromise, resultCallbacks },
    transactionMeta,
  } = request;

  const { id: transactionId } = transactionMeta;

  if (transactionMeta.isStateOnly) {
    log('Skipping finish as state only', transactionId);
    return '';
  }

  const finalMeta = await finishedPromise;

  switch (finalMeta?.status) {
    case TransactionStatus.failed: {
      const error = finalMeta.error as Error;
      log('Transaction failed', transactionId, error);
      resultCallbacks?.error(error);
      throw rpcErrors.internal(error.message);
    }

    case TransactionStatus.submitted:
      log('Transaction submitted', transactionId, finalMeta.hash);
      resultCallbacks?.success();
      return finalMeta.hash as string;

    default: {
      const internalError = rpcErrors.internal(
        `MetaMask Tx Signature: Unknown problem: ${JSON.stringify(
          finalMeta ?? transactionId,
        )}`,
      );

      log(
        'Transaction ended in unexpected state',
        transactionId,
        finalMeta?.status,
      );

      resultCallbacks?.error(internalError);
      throw internalError;
    }
  }
}
