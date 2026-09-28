import { createModuleLogger, lifecycleLogger } from '../logger.js';
import { TransactionEnvelopeType, TransactionStatus } from '../types.js';
import { getNextNonce } from '../utils/nonce.js';
import {
  getTransactionOrThrow,
  isTransactionCompleted,
} from '../utils/state.js';
import { isEIP1559Transaction } from '../utils/utils.js';
import { isTransactionApproving, startTransactionApproval } from './state.js';
import type { TransactionLifecycleRequest } from './types.js';

const log = createModuleLogger(lifecycleLogger, 'approve');

/**
 * Reserve execution resources after approval, without signing or publishing.
 *
 * @param request - Transaction metadata, lifecycle state, and dependencies.
 */
export async function approveTransaction(
  request: TransactionLifecycleRequest,
): Promise<void> {
  const {
    dependencies,
    lifecycle,
    transactionMeta: originalTransactionMeta,
  } = request;

  const { getState, messenger } = dependencies;
  const { id: transactionId } = originalTransactionMeta;

  if (
    !lifecycle.onError ||
    isTransactionCompleted(getState(), transactionId).isCompleted
  ) {
    return;
  }

  request.transactionMeta = getTransactionOrThrow(getState(), transactionId);
  const { transactionMeta } = request;
  log('Approving transaction', transactionMeta);

  lifecycle.execution = { networkClientId: transactionMeta.networkClientId };

  if (!transactionMeta.chainId) {
    throw new Error('No chainId defined.');
  }

  if (isTransactionApproving(dependencies, transactionId)) {
    log('Skipping approval as signing in progress', transactionId);
    delete lifecycle.execution;
    return;
  }

  lifecycle.execution.releaseApproval = startTransactionApproval(
    dependencies,
    transactionId,
  );

  const [nonce, releaseNonce] = await getNextNonce(transactionMeta, (address) =>
    dependencies.getNonceLock(address, transactionMeta.networkClientId),
  );

  lifecycle.execution.releaseNonce = releaseNonce;

  // The request is owned by a single execution, so there is no concurrent writer.
  // eslint-disable-next-line require-atomic-updates
  request.transactionMeta = dependencies.updateTransactionInternal(
    { transactionId },
    (draft) => {
      const { chainId, txParams } = draft;
      const { gas, type } = txParams;
      draft.status = TransactionStatus.approved;
      draft.txParams.chainId = chainId;
      draft.txParams.gasLimit = gas;
      draft.txParams.nonce = nonce;

      if (!type && isEIP1559Transaction(txParams)) {
        draft.txParams.type = TransactionEnvelopeType.feeMarket;
      }
    },
  );

  messenger.publish('TransactionController:transactionStatusUpdated', {
    transactionMeta: request.transactionMeta,
  });
}
