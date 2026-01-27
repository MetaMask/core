import type { RequiredEventContextFromClient } from '@metamask/bridge-controller';
import {
  StatusTypes,
  UnifiedSwapBridgeEventName,
} from '@metamask/bridge-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import type {
  BridgeHistoryItem,
  BridgeStatusControllerState,
  FetchFunction,
} from '../../types';
import { BridgeClientId } from '../../types';
import { shouldSkipFetchDueToFetchFailures } from '../bridge-status';
import type { IntentOrder } from '../validators';

export type PollerContext = {
  clientId: BridgeClientId;
  fetchFn: FetchFunction;
  customBridgeApiBaseUrl: string;
  update: (updater: (state: BridgeStatusControllerState) => void) => void;
  getState: () => BridgeStatusControllerState;
  stopPollingByPollingToken: (pollingToken: string) => void;
  getPollingToken: (bridgeTxMetaId: string) => string | undefined;
  clearPollingToken: (bridgeTxMetaId: string) => void;
  handleFetchFailure: (bridgeTxMetaId: string) => void;
  trackEvent: <
    EventName extends
      | typeof UnifiedSwapBridgeEventName.Completed
      | typeof UnifiedSwapBridgeEventName.Failed
      | typeof UnifiedSwapBridgeEventName.StatusValidationFailed,
  >(
    eventName: EventName,
    txMetaId?: string,
    eventProperties?: Pick<
      RequiredEventContextFromClient,
      EventName
    >[EventName],
  ) => void;
  publishDestinationCompleted: (
    assetId: BridgeHistoryItem['quote']['destAsset']['assetId'],
  ) => void;
  getTransactionById: (txId: string) => TransactionMeta | undefined;
  updateTransactionFn: (
    updatedTransactionMeta: TransactionMeta,
    note: string,
  ) => void;
  getSrcTxHash: (bridgeTxMetaId: string) => string | undefined;
  updateSrcTxHash: (bridgeTxMetaId: string, srcTxHash: string) => void;
};

export type PollerFetchResult = {
  historyItemPatch: Partial<BridgeHistoryItem>;
  isFinal: boolean;
  intentOrder?: IntentOrder;
  txHash?: string;
  isComplete?: boolean;
};

export const isFinalStatus = (status: StatusTypes): boolean =>
  status === StatusTypes.COMPLETE || status === StatusTypes.FAILED;

export abstract class BasePoller {
  protected readonly context: PollerContext;

  constructor(context: PollerContext) {
    this.context = context;
  }

  async run(bridgeTxMetaId: string): Promise<void> {
    const { txHistory } = this.context.getState();
    const historyItem = txHistory[bridgeTxMetaId];

    // 1) Ensure the history item exists before doing any work.
    if (!historyItem) {
      return;
    }

    // 2) Check backoff/attempts for shared retry behavior.
    if (shouldSkipFetchDueToFetchFailures(historyItem.attempts)) {
      return;
    }

    try {
      // 3) Provider-specific fetch + map to a normalized patch.
      const result = await this.fetch({
        bridgeTxMetaId,
        historyItem,
      });

      if (!result) {
        return;
      }

      // 4) Apply a normalized history update (status, hashes, attempts, completion time).
      const completionTime =
        result.isFinal && !result.historyItemPatch.completionTime
          ? Date.now()
          : result.historyItemPatch.completionTime;

      const newBridgeHistoryItem: BridgeHistoryItem = {
        ...historyItem,
        ...result.historyItemPatch,
        completionTime,
        attempts: undefined,
      };

      this.context.update((state) => {
        state.txHistory[bridgeTxMetaId] = newBridgeHistoryItem;
      });

      await this.afterUpdate({
        bridgeTxMetaId,
        historyItem: newBridgeHistoryItem,
        result,
      });

      // 5) Stop polling on final status.
      if (!result.isFinal) {
        return;
      }

      const pollingToken = this.context.getPollingToken(bridgeTxMetaId);
      if (!pollingToken) {
        return;
      }

      this.context.stopPollingByPollingToken(pollingToken);
      this.context.clearPollingToken(bridgeTxMetaId);

      // 6) Run final-status side effects (metrics, events, etc.).
      await this.onFinalStatus({
        bridgeTxMetaId,
        historyItem: newBridgeHistoryItem,
        result,
      });
    } catch (error) {
      this.onError({ bridgeTxMetaId, error });
      this.context.handleFetchFailure(bridgeTxMetaId);
    }
  }

  protected abstract fetch(args: {
    bridgeTxMetaId: string;
    historyItem: BridgeHistoryItem;
  }): Promise<PollerFetchResult | undefined>;

  protected abstract afterUpdate(args: {
    bridgeTxMetaId: string;
    historyItem: BridgeHistoryItem;
    result: PollerFetchResult;
  }): void | Promise<void>;

  protected abstract onFinalStatus(args: {
    bridgeTxMetaId: string;
    historyItem: BridgeHistoryItem;
    result: PollerFetchResult;
  }): void | Promise<void>;

  protected abstract onError(args: {
    bridgeTxMetaId: string;
    error: unknown;
  }): void;
}
