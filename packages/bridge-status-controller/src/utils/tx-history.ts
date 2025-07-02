import { StatusTypes } from '@metamask/bridge-controller';
import {
  TransactionStatus,
  TransactionType,
  type TransactionMeta,
} from '@metamask/transaction-controller';

import type { BridgeStatusControllerState } from '../types';

export const replaceBatchHistoryItem = (
  txHistory: BridgeStatusControllerState['txHistory'],
  { id, batchId, type, status }: TransactionMeta,
) => {
  const newTxHistory: BridgeStatusControllerState['txHistory'] = {
    ...txHistory,
  };
  const keysToDelete: string[] = [];
  // If the tx is batched and is not in txHistory yet
  if (id && batchId && type && txHistory[batchId] && !txHistory[id]) {
    // If the tx is a swap or bridge, replace the existing item
    if ([TransactionType.swap, TransactionType.bridge].includes(type)) {
      newTxHistory[id] = {
        ...txHistory[batchId],
        txMetaId: id,
      };
      delete newTxHistory[batchId];
      keysToDelete.push(batchId);
    }
    // If the tx is an approval, update the approvalTxId for batchId or txMeta.id
    if (
      [TransactionType.bridgeApproval, TransactionType.swapApproval].includes(
        type,
      )
    ) {
      if (newTxHistory[batchId]) {
        newTxHistory[batchId] = {
          ...newTxHistory[batchId],
          approvalTxId: id,
        };
      }
    }
  }
  // Mark tx as failed in txHistory
  if (status === TransactionStatus.failed) {
    if (newTxHistory[id]) {
      newTxHistory[id] = {
        ...newTxHistory[id],
        status: {
          ...newTxHistory[id].status,
          status: StatusTypes.FAILED,
        },
      };
    }
    if (batchId && newTxHistory[batchId]) {
      newTxHistory[batchId] = {
        ...newTxHistory[batchId],
        status: {
          ...newTxHistory[batchId].status,
          status: StatusTypes.FAILED,
        },
      };
    }
  }
  return { newTxHistory, keysToDelete };
};
