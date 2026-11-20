import type { BridgeStatusControllerMessenger } from '../types.js';
import { getTransactionMetaByBatchId } from './transaction.js';

export const acceptApprovalRequest = async (
  messenger: BridgeStatusControllerMessenger,
  txMetaId: string,
): Promise<void> => {
  await messenger.call('ApprovalController:acceptRequest', txMetaId);
};

const rejectApprovalRequest = (
  messenger: BridgeStatusControllerMessenger,
  txMetaId: string,
  error: Error,
): void => {
  messenger.call('ApprovalController:rejectRequest', txMetaId, error);
};

/**
 * Rejects the approval requests for all transactions with the given batchId
 * @param messenger - the messenger instance
 * @param batchId - the batchId of the transactions to reject
 * @param errorMessage - the error message to reject the approval requests with
 */
export const safeRejectTxBatch = (
  messenger: BridgeStatusControllerMessenger,
  batchId: string,
  errorMessage: string,
): void => {
  const txIds = [
    ...getTransactionMetaByBatchId({ messenger, batchId }).flatMap(({ id }) =>
      id ? [id] : [],
    ),
    batchId,
  ];

  for (const id of txIds) {
    try {
      rejectApprovalRequest(messenger, id, new Error(errorMessage));
      return;
    } catch {
      // try next id
    }
  }
};
