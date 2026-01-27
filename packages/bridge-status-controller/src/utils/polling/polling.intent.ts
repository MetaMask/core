import {
  StatusTypes,
  UnifiedSwapBridgeEventName,
} from '@metamask/bridge-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import { BasePoller, isFinalStatus, PollerFetchResult } from './polling.base';
import type { BridgeHistoryItem } from '../../types';
import {
  IntentApiImpl,
  mapIntentOrderStatusToTransactionStatus,
} from '../intent-api';
import { IntentOrderStatus } from '../validators';

export class IntentTxPoller extends BasePoller {
  protected async fetch({
    bridgeTxMetaId,
    historyItem,
  }: {
    bridgeTxMetaId: string;
    historyItem: BridgeHistoryItem;
  }): Promise<PollerFetchResult | undefined> {
    /* c8 ignore start */
    const orderId = bridgeTxMetaId.replace(/^intent:/u, '');
    const { srcChainId } = historyItem.quote;

    const providerName = historyItem.quote.intent?.protocol ?? '';

    const intentApi = new IntentApiImpl(
      this.context.customBridgeApiBaseUrl,
      this.context.fetchFn,
    );

    const intentOrder = await intentApi.getOrderStatus(
      orderId,
      providerName,
      srcChainId.toString(),
      this.context.clientId,
    );

    const isComplete = [
      IntentOrderStatus.CONFIRMED,
      IntentOrderStatus.COMPLETED,
    ].includes(intentOrder.status);
    const isFailed = [
      IntentOrderStatus.FAILED,
      IntentOrderStatus.EXPIRED,
      IntentOrderStatus.CANCELLED,
    ].includes(intentOrder.status);
    const isPending = [IntentOrderStatus.PENDING].includes(intentOrder.status);
    const isSubmitted = [IntentOrderStatus.SUBMITTED].includes(
      intentOrder.status,
    );

    let statusType: StatusTypes;
    if (isComplete) {
      statusType = StatusTypes.COMPLETE;
    } else if (isFailed) {
      statusType = StatusTypes.FAILED;
    } else if (isPending) {
      statusType = StatusTypes.PENDING;
    } else if (isSubmitted) {
      statusType = StatusTypes.SUBMITTED;
    } else {
      statusType = StatusTypes.UNKNOWN;
    }

    const txHash = intentOrder.txHash ?? '';
    const metadataTxHashes = Array.isArray(intentOrder.metadata.txHashes)
      ? intentOrder.metadata.txHashes
      : [];

    let allHashes: string[] = [];
    if (metadataTxHashes.length > 0) {
      allHashes = metadataTxHashes;
    } else if (txHash) {
      allHashes = [txHash];
    }

    const status = {
      status: statusType,
      srcChain: {
        chainId: srcChainId,
        txHash: txHash ?? historyItem.status.srcChain.txHash ?? '',
      },
    } as typeof historyItem.status;

    return {
      historyItemPatch: {
        status,
        srcTxHashes:
          allHashes.length > 0
            ? Array.from(
                new Set([...(historyItem.srcTxHashes ?? []), ...allHashes]),
              )
            : historyItem.srcTxHashes,
      },
      isFinal: isFinalStatus(statusType),
      intentOrder,
      txHash,
      isComplete,
    };
    /* c8 ignore stop */
  }

  protected afterUpdate({
    historyItem,
    result,
    bridgeTxMetaId,
  }: {
    bridgeTxMetaId: string;
    historyItem: BridgeHistoryItem;
    result: PollerFetchResult;
  }): void {
    const originalTxId =
      historyItem.originalTransactionId ?? historyItem.txMetaId;
    if (!originalTxId || originalTxId.startsWith('intent:')) {
      return;
    }

    try {
      const transactionStatus = mapIntentOrderStatusToTransactionStatus(
        result.intentOrder?.status ?? IntentOrderStatus.PENDING,
      );

      const existingTxMeta = this.context.getTransactionById(originalTxId);
      if (existingTxMeta) {
        const updatedTxMeta: TransactionMeta = {
          ...existingTxMeta,
          status: transactionStatus,
          ...(result.txHash ? { hash: result.txHash } : {}),
          ...(result.txHash
            ? ({
                txReceipt: {
                  ...(
                    existingTxMeta as unknown as {
                      txReceipt: Record<string, unknown>;
                    }
                  ).txReceipt,
                  transactionHash: result.txHash,
                  status: (result.isComplete
                    ? '0x1'
                    : '0x0') as unknown as string,
                },
              } as Partial<TransactionMeta>)
            : {}),
        } as TransactionMeta;

        this.context.updateTransactionFn(
          updatedTxMeta,
          `BridgeStatusController - Intent order status updated: ${result.intentOrder?.status}`,
        );
      } else {
        console.warn(
          '[fetchIntentOrderStatus] Skipping update; transaction not found',
          { originalTxId, bridgeHistoryKey: bridgeTxMetaId },
        );
      }
    } catch (error) {
      console.error(
        '[fetchIntentOrderStatus] Failed to update transaction status',
        {
          originalTxId,
          bridgeHistoryKey: bridgeTxMetaId,
          error,
        },
      );
    }
  }

  protected onFinalStatus({
    bridgeTxMetaId,
    result,
  }: {
    bridgeTxMetaId: string;
    historyItem: BridgeHistoryItem;
    result: PollerFetchResult;
  }): void {
    if (result.historyItemPatch.status?.status === StatusTypes.COMPLETE) {
      this.context.trackEvent(
        UnifiedSwapBridgeEventName.Completed,
        bridgeTxMetaId,
      );
    } else if (result.historyItemPatch.status?.status === StatusTypes.FAILED) {
      this.context.trackEvent(
        UnifiedSwapBridgeEventName.Failed,
        bridgeTxMetaId,
      );
    }
  }

  protected onError({ error }: { error: unknown }): void {
    console.error('Failed to fetch intent order status:', error);
  }
}
