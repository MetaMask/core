import { projectLogger as log } from '../logger.js';
import { TransactionEnvelopeType, TransactionStatus } from '../types.js';
import { getNextNonce } from '../utils/nonce.js';
import {
  getTransactionOrThrow,
  isTransactionCompleted,
} from '../utils/state.js';
import { isEIP1559Transaction } from '../utils/utils.js';
import type { TransactionLifecycleContext } from './state.js';
import type { TransactionStageDependencies } from './types.js';

/** Dependencies needed to reserve a nonce and mark a transaction approved. */
export type ApproveTransactionRequest = TransactionLifecycleContext & {
  dependencies: Pick<
    TransactionStageDependencies,
    | 'approvingTransactionIds'
    | 'getNonceLock'
    | 'getState'
    | 'messenger'
    | 'updateTransactionInternal'
  >;
};

/** Reserve execution resources after approval, without signing or publishing. */
export async function approveTransaction(
  request: ApproveTransactionRequest,
): Promise<void> {
  const {
    dependencies,
    lifecycle,
    transactionMeta: originalTransactionMeta,
  } = request;
  const { approvingTransactionIds, getState, messenger } = dependencies;
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

  if (approvingTransactionIds.has(transactionId)) {
    log('Skipping approval as signing in progress', transactionId);
    delete lifecycle.execution;
    return;
  }

  approvingTransactionIds.add(transactionId);
  lifecycle.execution.releaseApproval = (): void => {
    approvingTransactionIds.delete(transactionId);
  };

  const [nonce, releaseNonce] = await getNextNonce(transactionMeta, (address) =>
    dependencies.getNonceLock(address, transactionMeta.networkClientId),
  );
  lifecycle.execution.releaseNonce = releaseNonce;

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
