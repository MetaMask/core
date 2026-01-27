import {
  StatusTypes,
  UnifiedSwapBridgeEventName,
} from '@metamask/bridge-controller';

import { BasePoller, isFinalStatus, PollerFetchResult } from './polling.base';
import type { BridgeHistoryItem } from '../../types';
import {
  fetchBridgeTxStatus,
  getStatusRequestWithSrcTxHash,
} from '../bridge-status';

export class BridgeTxPoller extends BasePoller {
  protected async fetch({
    bridgeTxMetaId,
    historyItem,
  }: {
    bridgeTxMetaId: string;
    historyItem: BridgeHistoryItem;
  }): Promise<PollerFetchResult | undefined> {
    const srcTxHash = this.context.getSrcTxHash(bridgeTxMetaId);
    if (!srcTxHash) {
      return undefined;
    }

    this.context.updateSrcTxHash(bridgeTxMetaId, srcTxHash);

    const statusRequest = getStatusRequestWithSrcTxHash(
      historyItem.quote,
      srcTxHash,
    );

    const { status, validationFailures } = await fetchBridgeTxStatus(
      statusRequest,
      this.context.clientId,
      this.context.fetchFn,
      this.context.customBridgeApiBaseUrl,
    );

    if (validationFailures.length > 0) {
      this.context.trackEvent(
        UnifiedSwapBridgeEventName.StatusValidationFailed,
        bridgeTxMetaId,
        {
          failures: validationFailures,
        },
      );
      throw new Error(
        `Bridge status validation failed: ${validationFailures.join(', ')}`,
      );
    }

    return {
      historyItemPatch: { status },
      isFinal: isFinalStatus(status.status),
    };
  }

  protected onFinalStatus({
    bridgeTxMetaId,
    historyItem,
    result,
  }: {
    bridgeTxMetaId: string;
    historyItem: BridgeHistoryItem;
    result: PollerFetchResult;
  }): void {
    if (historyItem.featureId) {
      return;
    }

    if (result.historyItemPatch.status?.status === StatusTypes.COMPLETE) {
      this.context.trackEvent(
        UnifiedSwapBridgeEventName.Completed,
        bridgeTxMetaId,
      );
      this.context.publishDestinationCompleted(
        historyItem.quote.destAsset.assetId,
      );
    } else if (result.historyItemPatch.status?.status === StatusTypes.FAILED) {
      this.context.trackEvent(
        UnifiedSwapBridgeEventName.Failed,
        bridgeTxMetaId,
      );
    }
  }

  protected onError({ error }: { error: unknown }): void {
    console.warn('Failed to fetch bridge tx status', error);
  }

  protected afterUpdate(_args: {
    bridgeTxMetaId: string;
    historyItem: BridgeHistoryItem;
    result: PollerFetchResult;
  }): void {
    return undefined;
  }
}
