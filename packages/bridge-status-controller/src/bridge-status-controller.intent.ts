import { StatusTypes } from '@metamask/bridge-controller';
import type { TransactionController } from '@metamask/transaction-controller';
import { TransactionMeta } from '@metamask/transaction-controller';

import type { BridgeStatusControllerMessenger, FetchFunction } from './types';
import type { BridgeHistoryItem } from './types';
import {
  GetJwtFn,
  IntentApi,
  IntentApiImpl,
  IntentBridgeStatus,
  IntentSubmissionParams,
  translateIntentOrderToBridgeStatus,
} from './utils/intent-api';
import { IntentOrder, IntentOrderStatus } from './utils/validators';

type IntentStatuses = {
  orderStatus: IntentOrderStatus;
  bridgeStatus: IntentBridgeStatus | null;
};

export class IntentManager {
  readonly #messenger: BridgeStatusControllerMessenger;

  readonly #updateTransactionFn: typeof TransactionController.prototype.updateTransaction;

  readonly intentApi: IntentApi;

  #intentStatuses: IntentStatuses;

  constructor({
    messenger,
    updateTransactionFn,
    customBridgeApiBaseUrl,
    fetchFn,
    getJwt,
  }: {
    messenger: BridgeStatusControllerMessenger;
    updateTransactionFn: typeof TransactionController.prototype.updateTransaction;
    customBridgeApiBaseUrl: string;
    fetchFn: FetchFunction;
    getJwt: GetJwtFn;
  }) {
    this.#messenger = messenger;
    this.#updateTransactionFn = updateTransactionFn;
    this.intentApi = new IntentApiImpl(customBridgeApiBaseUrl, fetchFn, getJwt);
    this.#intentStatuses = {
      orderStatus: IntentOrderStatus.PENDING,
      bridgeStatus: null,
    };
  }

  /**
   * Set the intent statuses.
   *
   * @param orderStatus - The intent order status.
   * @param srcChainId - The source chain ID.
  /**
   * Set the intent statuses.
   *
   * @param order - The intent order.
   * @param srcChainId - The source chain ID.
   * @param txHash - The transaction hash.
   * @returns The intent statuses.
   */

  #setIntentStatuses(
    order: IntentOrder,
    srcChainId: number,
    txHash: string,
  ): IntentStatuses {
    const bridgeStatus = translateIntentOrderToBridgeStatus(
      order,
      srcChainId,
      txHash.toString(),
    );
    this.#intentStatuses = {
      orderStatus: order.status,
      bridgeStatus,
    };

    return this.#intentStatuses;
  }

  /**
   * Get the status of an intent order.
   *
   * @param bridgeTxMetaId - The bridge transaction meta ID.
   * @param protocol - The protocol of the intent.
   * @param clientId - The client ID.
   * @returns The intent order mapped status.
   */

  getIntentTransactionStatus = async (
    bridgeTxMetaId: string,
    historyItem: BridgeHistoryItem,
    clientId: string,
  ): Promise<IntentStatuses | undefined> => {
    const {
      status: { srcChain: { chainId: txHash } = {} } = {},
      quote: { srcChainId, intent: { protocol = '' } = {} },
    } = historyItem;
    try {
      const orderStatus = await this.intentApi.getOrderStatus(
        bridgeTxMetaId,
        protocol,
        srcChainId.toString(),
        clientId,
      );

      return this.#setIntentStatuses(
        orderStatus,
        srcChainId,
        txHash?.toString() ?? '',
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(
          `[Intent polling] Failed to get intent order status from API: ${error.message}`,
        );
      }
      return undefined;
    }
  };

  /**
   * Sync the transaction status from the intent status.
   *
   * @param bridgeTxMetaId - The bridge transaction meta ID.
   * @param historyItem - The history item.
   */

  syncTransactionFromIntentStatus = (
    bridgeTxMetaId: string,
    historyItem: BridgeHistoryItem,
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
          '[Intent polling] Skipping update, transaction not found',
          { originalTxId, bridgeHistoryKey: bridgeTxMetaId },
        );
        return;
      }
      const { bridgeStatus, orderStatus } = this.#intentStatuses;
      const txHash = bridgeStatus?.txHash;
      const isComplete = bridgeStatus?.status.status === StatusTypes.COMPLETE;
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
        status: bridgeStatus?.transactionStatus,
        ...(txHash ? { hash: txHash } : {}),
        ...txReceiptUpdate,
      } as TransactionMeta;

      this.#updateTransactionFn(
        updatedTxMeta,
        `BridgeStatusController - Intent order status updated: ${orderStatus}`,
      );
    } catch (error) {
      console.error('[Intent polling] Failed to update transaction status', {
        originalTxId,
        bridgeHistoryKey: bridgeTxMetaId,
        error,
      });
    }
  };

  /**
   * Submit an intent order.
   *
   * @param submissionParams - The submission parameters.
   * @param clientId - The client ID.
   * @returns The intent order.
   */
  submitIntent = async (
    submissionParams: IntentSubmissionParams,
    clientId: string,
  ): Promise<IntentOrder> => {
    return this.intentApi.submitIntent(submissionParams, clientId);
  };
}
