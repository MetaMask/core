import type { BridgeStatusControllerMessenger } from '../types';
import type { BridgeStatusControllerState } from '../types';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionStatus } from '@metamask/transaction-controller';

export const rekeyHistoryItemInState = (
  state: BridgeStatusControllerState,
  actionId: string,
  txMeta: { id: string; hash?: string },
): boolean => {
  const historyItem = state.txHistory[actionId];
  if (!historyItem) {
    return false;
  }

  state.txHistory[txMeta.id] = {
    ...historyItem,
    txMetaId: txMeta.id,
    originalTransactionId: historyItem.originalTransactionId ?? txMeta.id,
    status: {
      ...historyItem.status,
      srcChain: {
        ...historyItem.status.srcChain,
        txHash: txMeta.hash ?? historyItem.status.srcChain?.txHash,
      },
    },
  };
  delete state.txHistory[actionId];
  return true;
};

export const waitForTxConfirmation = async (
  messenger: BridgeStatusControllerMessenger,
  txId: string,
  {
    timeoutMs = 5 * 60_000,
    pollMs = 3_000,
  }: { timeoutMs?: number; pollMs?: number } = {},
): Promise<TransactionMeta> => {
  const start = Date.now();
  while (true) {
    const { transactions } = messenger.call('TransactionController:getState');
    const meta = transactions.find((tx: TransactionMeta) => tx.id === txId);

    if (meta) {
      if (meta.status === TransactionStatus.confirmed) {
        return meta;
      }
      if (
        meta.status === TransactionStatus.failed ||
        meta.status === TransactionStatus.dropped ||
        meta.status === TransactionStatus.rejected
      ) {
        throw new Error('Approval transaction did not confirm');
      }
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for approval confirmation');
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
};
