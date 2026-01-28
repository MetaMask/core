import { StatusTypes } from '@metamask/bridge-controller';
import type { TransactionController } from '@metamask/transaction-controller';
import { TransactionMeta } from '@metamask/transaction-controller';

import type { BridgeStatusControllerMessenger } from './types';
import type { BridgeHistoryItem } from './types';
import { translateIntentOrderToBridgeStatus } from './utils/intent-api';

export class IntentStatusManager {
  readonly #messenger: BridgeStatusControllerMessenger;

  readonly #updateTransactionFn: typeof TransactionController.prototype.updateTransaction;

  constructor({
    messenger,
    updateTransactionFn,
  }: {
    messenger: BridgeStatusControllerMessenger;
    updateTransactionFn: typeof TransactionController.prototype.updateTransaction;
  }) {
    this.#messenger = messenger;
    this.#updateTransactionFn = updateTransactionFn;
  }

  syncTransactionFromIntentStatus = (
    bridgeTxMetaId: string,
    historyItem: BridgeHistoryItem,
    intentTranslation: ReturnType<typeof translateIntentOrderToBridgeStatus>,
    intentOrderStatus: string,
  ): void => {
    // Update the actual transaction in TransactionController to sync with intent status
    // Use the original transaction ID (not the bridge history key)
    const originalTxId =
      historyItem.originalTransactionId ?? historyItem.txMetaId;
    if (!originalTxId) {
      return;
    }

    try {
      // Merge with existing TransactionMeta to avoid wiping required fields
      const { transactions } = this.#messenger.call(
        'TransactionController:getState',
      );
      const existingTxMeta = transactions.find(
        (tx: TransactionMeta) => tx.id === originalTxId,
      );
      if (!existingTxMeta) {
        console.warn(
          '📝 [Intent polling] Skipping update; transaction not found',
          { originalTxId, bridgeHistoryKey: bridgeTxMetaId },
        );
        return;
      }

      const { txHash } = intentTranslation;
      const isComplete =
        intentTranslation.status.status === StatusTypes.COMPLETE;
      const existingTxReceipt = (
        existingTxMeta as { txReceipt?: Record<string, unknown> }
      ).txReceipt;
      const txReceiptUpdate = txHash
        ? {
            txReceipt: {
              ...existingTxReceipt,
              transactionHash: txHash,
              status: (isComplete ? '0x1' : '0x0') as unknown as string,
            },
          }
        : {};

      const updatedTxMeta: TransactionMeta = {
        ...existingTxMeta,
        status: intentTranslation.transactionStatus,
        ...(txHash ? { hash: txHash } : {}),
        ...txReceiptUpdate,
      } as TransactionMeta;

      this.#updateTransactionFn(
        updatedTxMeta,
        `BridgeStatusController - Intent order status updated: ${intentOrderStatus}`,
      );
    } catch (error) {
      console.error('📝 [Intent polling] Failed to update transaction status', {
        originalTxId,
        bridgeHistoryKey: bridgeTxMetaId,
        error,
      });
    }
  };
}
