import type { StateMetadata } from '@metamask/base-controller';
import {
  QuoteMetadata,
  RequiredEventContextFromClient,
  QuoteResponse,
  Trade,
  FeatureId,
  BatchSellTradesResponse,
  InputPrimaryDenomination,
} from '@metamask/bridge-controller';
import {
  isNonEvmChainId,
  StatusTypes,
  getAccountHardwareType,
  UnifiedSwapBridgeEventName,
  isCrossChain,
  MetricsActionType,
  MetaMetricsSwapsEventSource,
  PollingStatus,
  formatChainIdToHex,
} from '@metamask/bridge-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import {
  TransactionStatus,
  TransactionType,
  TransactionController,
  generateBatchId,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { numberToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { IntentManager } from './bridge-status-controller.intent.js';
import {
  ALLOWED_FEATURE_IDS_FOR_STATUS_EVENTS,
  BRIDGE_PROD_API_BASE_URL,
  BRIDGE_STATUS_CONTROLLER_NAME,
  DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE,
  MAX_ATTEMPTS,
  REFRESH_INTERVAL_MS,
} from './constants.js';
import {
  QUOTE_STATUS_BACKFILL_WINDOW_MS,
  QUOTE_STATUS_UPDATE_ENTRY_TTL,
  QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS,
} from './quote-status-manager/constants.js';
import {
  QuoteStatusGetError,
  QuoteStatusUpdateError,
} from './quote-status-manager/errors.js';
import { QuoteStatusManager } from './quote-status-manager/quotes-status-manager.js';
import executeSubmitStrategy from './strategy/index.js';
import { SubmitStep } from './strategy/types.js';
import type { SubmitStrategyParams } from './strategy/types.js';
import type {
  BridgeStatusControllerState,
  StartPollingForBridgeTxStatusArgsSerialized,
  FetchFunction,
  BridgeHistoryItem,
} from './types.js';
import type { BridgeStatusControllerMessenger } from './types.js';
import { BridgeClientId } from './types.js';
import { getAccountByAddress } from './utils/accounts.js';
import { getJwt } from './utils/authentication.js';
import {
  fetchBridgeTxStatus,
  fetchBridgeQuoteStatus,
  getStatusRequestWithSrcTxHash,
  shouldSkipFetchDueToFetchFailures,
  shouldWaitForFinalBridgeStatus,
} from './utils/bridge-status.js';
import {
  getBatchSellTrades,
  stopPollingForQuotes,
  trackMetricsEvent,
} from './utils/bridge.js';
import {
  getInitialHistoryItem,
  getMatchingHistoryEntryForTxMeta,
  rekeyHistoryItemInState,
  shouldPollHistoryItem,
  getMatchingHistoryEntryForApprovalTxMeta,
} from './utils/history.js';
import {
  getFinalizedTxProperties,
  getPriceImpactFromQuote,
  getRequestMetadataFromHistory,
  getRequestParamFromHistory,
  getTradeDataFromHistory,
  getEVMTxPropertiesFromTransactionMeta,
  getTxStatusesFromHistory,
  getPreConfirmationPropertiesFromQuote,
} from './utils/metrics.js';
import { getSelectedChainId } from './utils/network.js';
import { getTraceParams } from './utils/trace.js';
import {
  getTransactionMetaById,
  getTransactions,
  checkIsDelegatedAccount,
  isCrossChainTx,
  updateTransactionsInBatch,
  hasNestedSwapTransactions,
} from './utils/transaction.js';

const metadata: StateMetadata<BridgeStatusControllerState> = {
  // We want to persist the bridge status state so that we can show the proper data for the Activity list
  // basically match the behavior of TransactionController
  txHistory: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  // Deferred status updates used by QuoteStatusUpdateManager
  quoteUpdateStatusStore: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
};

/** The input to start polling for the {@link BridgeStatusController} */
type BridgeStatusPollingInput = FetchBridgeTxStatusArgs;

type SrcTxMetaId = string;
export type FetchBridgeTxStatusArgs = {
  bridgeTxMetaId: string;
};

const MESSENGER_EXPOSED_METHODS = [
  'startPollingForBridgeTxStatus',
  'wipeBridgeStatus',
  'resetState',
  'submitTx',
  'submitIntent',
  'submitBatchSell',
  'restartPollingForFailedAttempts',
  'getBridgeHistoryItemByTxMetaId',
] as const;

export class BridgeStatusController extends StaticIntervalPollingController<BridgeStatusPollingInput>()<
  typeof BRIDGE_STATUS_CONTROLLER_NAME,
  BridgeStatusControllerState,
  BridgeStatusControllerMessenger
> {
  #pollingTokensByTxMetaId: Record<SrcTxMetaId, string> = {};

  readonly #intentManager: IntentManager;

  readonly #quoteStatusManager: QuoteStatusManager;

  readonly #clientId: BridgeClientId;

  readonly #fetchFn: FetchFunction;

  readonly #config: {
    customBridgeApiBaseUrl: string;
  };

  readonly #addTransactionBatchFn: typeof TransactionController.prototype.addTransactionBatch;

  readonly #trace: TraceCallback;

  constructor({
    messenger,
    state,
    clientId,
    clientProduct,
    clientVersion,
    fetchFn,
    addTransactionBatchFn,
    config,
    traceFn,
    onQuoteStatusManagerError,
    isQuoteStatusManagerEnabled,
  }: {
    messenger: BridgeStatusControllerMessenger;
    state?: Partial<BridgeStatusControllerState>;
    clientId: BridgeClientId;
    clientProduct: string;
    clientVersion?: string;
    fetchFn: FetchFunction;
    addTransactionBatchFn: typeof TransactionController.prototype.addTransactionBatch;
    config?: {
      customBridgeApiBaseUrl?: string;
    };
    traceFn?: TraceCallback;
    onQuoteStatusManagerError?: (
      error: QuoteStatusUpdateError | QuoteStatusGetError,
    ) => void;
    isQuoteStatusManagerEnabled?: () => boolean;
  }) {
    super({
      name: BRIDGE_STATUS_CONTROLLER_NAME,
      metadata,
      messenger,
      // Restore the persisted state
      state: {
        ...DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE,
        ...state,
      },
    });

    this.#clientId = clientId;
    this.#fetchFn = fetchFn;
    this.#addTransactionBatchFn = addTransactionBatchFn;
    this.#config = {
      customBridgeApiBaseUrl:
        config?.customBridgeApiBaseUrl ?? BRIDGE_PROD_API_BASE_URL,
    };
    this.#trace = traceFn ?? (((_request, fn) => fn?.()) as TraceCallback);
    this.#intentManager = new IntentManager({
      messenger: this.messenger,
      customBridgeApiBaseUrl: this.#config.customBridgeApiBaseUrl,
      fetchFn: this.#fetchFn,
    });
    this.#quoteStatusManager = new QuoteStatusManager({
      messenger: this.messenger,
      clientId: this.#clientId,
      clientProduct,
      clientVersion,
      apiBaseUrl: this.#config.customBridgeApiBaseUrl,
      initialData: this.state.quoteUpdateStatusStore,
      onPersistUpdates: (updates): void => {
        this.update((draft) => {
          draft.quoteUpdateStatusStore = updates;
        });
      },
      entryTtlMs: QUOTE_STATUS_UPDATE_ENTRY_TTL,
      updateIntervalMs: QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS,
      onError: onQuoteStatusManagerError,
      isEnabled: isQuoteStatusManagerEnabled,
    });

    // Register action handlers
    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    // Set interval
    this.setIntervalLength(REFRESH_INTERVAL_MS);

    this.messenger.subscribe<
      'TransactionController:transactionStatusUpdated',
      {
        historyKey?: string;
        historyItem?: BridgeHistoryItem;
        txMeta: TransactionMeta;
        isApprovalTxMeta: boolean;
      }
    >(
      'TransactionController:transactionStatusUpdated',
      ({ txMeta, historyKey, historyItem, isApprovalTxMeta }) => {
        if (!txMeta) {
          return;
        }
        const { type, status } = txMeta;

        // Allow event publishing if the txMeta is a swap/bridge OR if the
        // corresponding history item exists
        const isSwapOrBridgeTransaction = type && isCrossChainTx(type);
        if (!isSwapOrBridgeTransaction && !historyKey && !historyItem) {
          return;
        }

        switch (status) {
          case TransactionStatus.submitted:
            // EVM txs report SUBMITTED here (not via transactionSubmitted) so hash
            // replacements before confirmation still reach the Bridge API.
            if (
              txMeta.hash &&
              txMeta.type &&
              isCrossChainTx(txMeta.type) &&
              !isApprovalTxMeta &&
              historyKey
            ) {
              this.#reportSubmittedOnce(historyKey, txMeta.hash, txMeta.id);
            }
            break;
          case TransactionStatus.confirmed:
            this.#onTransactionConfirmed({
              txMeta,
              historyKey,
              isApprovalTxMeta,
            });
            break;
          case TransactionStatus.failed:
          case TransactionStatus.dropped:
          case TransactionStatus.rejected:
            this.#onTransactionFailed({ txMeta, historyKey, isApprovalTxMeta });
            break;
          default:
            break;
        }
      },
      ({ transactionMeta }) => {
        const entry = getMatchingHistoryEntryForTxMeta(
          this.state.txHistory,
          transactionMeta,
        );
        const approvalEntry = getMatchingHistoryEntryForApprovalTxMeta(
          this.state.txHistory,
          transactionMeta,
        );
        const entryToUse = entry ?? approvalEntry;

        return {
          historyKey: entryToUse?.[0],
          historyItem: entryToUse?.[1],
          txMeta: transactionMeta,
          isApprovalTxMeta:
            entryToUse?.[1]?.approvalTxId === transactionMeta.id,
        };
      },
    );

    // Seed any missing quote-status entries from persisted history before
    // init(), so init()'s reconciliation loop can finalize quotes whose
    // deferred entry was never created (e.g. the client closed before
    // reportSubmitted ran).
    this.#seedQuoteStatusEntriesFromHistory();

    // Replay swap/bridge finalizations that resolved while the client was
    // closed, before resuming polling (which recovers in-flight bridges).
    this.#quoteStatusManager.init();

    // If you close the extension, but keep the browser open, the polling continues
    // If you close the browser, the polling stops
    // Check for historyItems that do not have a status of complete and restart polling
    this.#restartPollingForIncompleteHistoryItems();
  }

  readonly #onTransactionFailed = ({
    txMeta,
    historyKey,
    isApprovalTxMeta,
  }: {
    txMeta: TransactionMeta;
    historyKey?: string;
    isApprovalTxMeta: boolean;
  }): void => {
    // Check if the history item is already marked as a failure
    const isHistoryItemAlreadyFailed = historyKey
      ? this.state.txHistory[historyKey]?.status.status === StatusTypes.FAILED
      : false;

    this.#updateHistoryItem({
      historyKey,
      status: StatusTypes.FAILED,
      txHash: isApprovalTxMeta ? undefined : txMeta.hash,
      completionTime: Date.now(),
    });

    if (txMeta.status === TransactionStatus.rejected) {
      return;
    }

    // Skip tracking if this is a duplicate failed event for the same history item
    // This can happen if the transaction includes an approval tx that fails
    if (isHistoryItemAlreadyFailed) {
      return;
    }

    // Report finalized failure for swap/bridge transactions.
    // Note: TransactionStatus.rejected means the user cancelled signing, so the tx was never broadcast.
    // `hasNestedSwapTransactions` also covers batch/7702 swaps whose type may
    // still read as `batch` rather than `swap`.
    if (
      (txMeta.type && isCrossChainTx(txMeta.type)) ||
      hasNestedSwapTransactions(txMeta)
    ) {
      this.#quoteStatusManager.reportFinalised(txMeta.id, false);
    }

    this.#trackUnifiedSwapBridgeEvent(
      UnifiedSwapBridgeEventName.Failed,
      historyKey,
      getEVMTxPropertiesFromTransactionMeta(txMeta),
    );
  };

  // Only EVM txs
  readonly #onTransactionConfirmed = ({
    txMeta,
    historyKey,
    isApprovalTxMeta,
  }: {
    txMeta: TransactionMeta;
    historyKey?: string;
    isApprovalTxMeta: boolean;
  }): void => {
    // Return early if the confirmed txMeta is for an approval since we
    // still need to wait for the trade to be confirmed
    if (isApprovalTxMeta) {
      return;
    }

    this.#updateHistoryItem({
      historyKey,
      txHash: txMeta.hash,
    });

    const isSwap =
      txMeta.type === TransactionType.swap || hasNestedSwapTransactions(txMeta);

    if (isSwap) {
      this.#updateHistoryItem({
        historyKey,
        status: StatusTypes.COMPLETE,
        completionTime: Date.now(),
      });

      // For EVM intent-based swaps the synthetic tx transitions
      // submitted→confirmed in a single update that carries the CoW
      // settlement hash, so the submitted status handler never has a hash
      // and reportSubmitted is never called. Call it here (before
      // reportFinalised) so the deferred-queue entry is created.
      const historyItem = historyKey
        ? this.state.txHistory[historyKey]
        : undefined;
      if (
        historyKey &&
        historyItem &&
        txMeta.hash &&
        !isNonEvmChainId(historyItem.quote.srcChainId)
      ) {
        this.#reportSubmittedOnce(historyKey, txMeta.hash, txMeta.id);
      }
      this.#quoteStatusManager.reportFinalised(txMeta.id, true);
      this.#trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.Completed,
        historyKey,
      );
    } else if (historyKey) {
      this.#startPollingForTxId(historyKey);
    }
  };

  /**
   * Reports the SUBMITTED quote status for non-EVM transactions.
   *
   * EVM transactions report SUBMITTED via the
   * `TransactionController:transactionStatusUpdated` subscription, which also
   * picks up hash replacements (speed-up/cancel) and the late hash assignment
   * of smart/batch transactions. Non-EVM transactions (Solana, Bitcoin, Tron)
   * are submitted through Snaps and never emit TransactionController lifecycle
   * events, so they are reported here once the history item exists and the
   * source tx hash is known.
   *
   * @param historyKey - The key of the history item in `txHistory`
   * @param txMeta - The submitted trade transaction's id and hash
   * @param txMeta.id - The transaction meta id, used for finalization matching
   * @param txMeta.hash - The source chain transaction hash
   */
  readonly #reportSubmittedForNonEvmTx = (
    historyKey: string,
    txMeta?: { id?: string; hash?: string },
  ): void => {
    if (!txMeta?.id || !txMeta.hash) {
      return;
    }
    const historyItem = this.state.txHistory[historyKey];
    if (!historyItem || !isNonEvmChainId(historyItem.quote.srcChainId)) {
      return;
    }
    this.#reportSubmittedOnce(historyKey, txMeta.hash, txMeta.id);
  };

  /**
   * Reports a SUBMITTED quote status update exactly once per source tx hash.
   *
   * SUBMITTED can be triggered from several code paths (submission, the first
   * poll where the hash is known, and the final-status branch) and the poll
   * path runs on every interval.
   *
   * For 7702/nested batch sells a single source transaction carries multiple
   * quotes: the parent history item lists all of them in `quoteIds` (each a key
   * into `txHistory`). In that case every quote is reported under the shared
   * source tx hash and `txMetaId`.
   *
   * @param historyKey - The key of the history item in `txHistory`
   * @param srcTxHash - The source chain transaction hash
   * @param txMetaId - The transaction meta id, used for finalization matching
   */
  readonly #reportSubmittedOnce = (
    historyKey: string,
    srcTxHash: string,
    txMetaId: string,
  ): void => {
    const historyItem = this.state.txHistory[historyKey];
    if (!historyItem) {
      return;
    }

    // For a 7702/nested batch the parent item lists every quote in `quoteIds`
    // (keys into `txHistory`); resolve each to its real quote id. Otherwise fall
    // back to the item's own single quote id.
    let quoteIds: string[];
    if (historyItem.quoteIds?.length) {
      quoteIds = historyItem.quoteIds
        .map((quoteKey) => this.state.txHistory[quoteKey]?.quoteId)
        .filter((quoteId): quoteId is string => Boolean(quoteId));
    } else if (historyItem.quoteId) {
      quoteIds = [historyItem.quoteId];
    } else {
      quoteIds = [];
    }

    if (quoteIds.length === 0) {
      return;
    }

    // `reportedSubmittedTxHash` is set once `reportSubmitted` is called.
    // This avoids processing multiple `eportSubmitted` for the
    // same swap/bridge.
    if (historyItem.reportedSubmittedTxHash === srcTxHash) {
      return;
    }

    for (const quoteId of quoteIds) {
      this.#quoteStatusManager.reportSubmitted(quoteId, srcTxHash, txMetaId);
    }

    this.update((state) => {
      const item = state.txHistory[historyKey];
      if (item) {
        item.reportedSubmittedTxHash = srcTxHash;
      }
    });
  };

  resetState = (): void => {
    this.#quoteStatusManager.destroy();
    this.update((state) => {
      state.txHistory = DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE.txHistory;
      state.quoteUpdateStatusStore =
        DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE.quoteUpdateStatusStore;
    });
  };

  wipeBridgeStatus = ({
    address,
    ignoreNetwork,
  }: {
    address: string;
    ignoreNetwork: boolean;
  }): void => {
    // Wipe all networks for this address
    if (ignoreNetwork) {
      this.update((state) => {
        state.txHistory = DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE.txHistory;
      });
    } else {
      const selectedChainId = getSelectedChainId(this.messenger);

      this.#wipeBridgeStatusByChainId(address, selectedChainId);
    }
  };

  /**
   * Resets the attempts counter for a bridge transaction history item
   * and restarts polling if it was previously stopped due to max attempts
   *
   * @param identifier - Object containing either txMetaId or txHash to identify the history item
   * @param identifier.txMetaId - The transaction meta ID
   * @param identifier.txHash - The transaction hash
   */
  restartPollingForFailedAttempts = (identifier: {
    txMetaId?: string;
    txHash?: string;
  }): void => {
    const { txMetaId, txHash } = identifier;

    if (!txMetaId && !txHash) {
      throw new Error('Either txMetaId or txHash must be provided');
    }

    // Find the history item by txMetaId or txHash
    let targetTxMetaId: string | undefined;

    if (txMetaId) {
      // Direct lookup by txMetaId
      if (this.state.txHistory[txMetaId]) {
        targetTxMetaId = txMetaId;
      }
    } else if (txHash) {
      // Search by txHash in status.srcChain.txHash
      targetTxMetaId = Object.keys(this.state.txHistory).find(
        (id) => this.state.txHistory[id].status.srcChain.txHash === txHash,
      );
    }

    if (!targetTxMetaId) {
      throw new Error(
        `No bridge transaction history found for ${
          txMetaId ? `txMetaId: ${txMetaId}` : `txHash: ${txHash}`
        }`,
      );
    }

    const historyItem = this.state.txHistory[targetTxMetaId];

    // Capture attempts count before resetting for metrics
    const previousAttempts = historyItem.attempts?.counter ?? 0;

    // Reset the attempts counter
    this.update((state) => {
      if (targetTxMetaId) {
        state.txHistory[targetTxMetaId].attempts = undefined;
      }
    });

    // Restart polling if it was stopped and this tx still needs status updates
    if (shouldPollHistoryItem(historyItem)) {
      // Check if polling was stopped (no active polling token)
      const existingPollingToken =
        this.#pollingTokensByTxMetaId[targetTxMetaId];

      if (!existingPollingToken) {
        // Restart polling
        this.#startPollingForTxId(targetTxMetaId);

        // Track polling manually restarted event
        this.#trackUnifiedSwapBridgeEvent(
          UnifiedSwapBridgeEventName.PollingStatusUpdated,
          targetTxMetaId,
          {
            polling_status: PollingStatus.ManuallyRestarted,
            retry_attempts: previousAttempts,
          },
        );
      }
    }
  };

  /**
   * Gets a bridge history item from the history by its transaction meta ID
   *
   * @param txMetaId - The transaction meta ID to look up
   * @returns The bridge history item if found, undefined otherwise
   */
  getBridgeHistoryItemByTxMetaId = (
    txMetaId: string,
  ): BridgeHistoryItem | undefined => {
    return this.state.txHistory[txMetaId];
  };

  /**
   * Seeds missing quote-status entries from persisted history on startup.
   *
   * The deferred quote-status entry (keyed by `${quoteId}:${srcTxHash}`) is only
   * created when `reportSubmitted` runs. If the client closes after a swap/bridge
   * is submitted but before that happens, the entry is never created and
   * `QuoteStatusManager.init()` has nothing to reconcile. The persisted history
   * item carries the `quoteId`, source tx hash, and `txMetaId` needed to rebuild
   * the entry, so we replay `reportSubmitted` here (idempotent via
   * `#reportSubmittedOnce`) before `init()` runs.
   */
  readonly #seedQuoteStatusEntriesFromHistory = (): void => {
    if (!this.#quoteStatusManager.enabled) {
      // Skip seeding to prevent `#reportSubmittedOnce` from persisting
      // `reportedSubmittedTxHash` so recent bridge history cannot be marked as
      //  already reported with no store entry or backend update.
      return;
    }

    for (const [historyKey, historyItem] of Object.entries(
      this.state.txHistory,
    )) {
      const { quoteId, quoteIds, txMetaId } = historyItem;
      // A 7702/nested batch parent reports its quotes via `quoteIds` rather than
      // its own single `quoteId`, so accept either. `#reportSubmittedOnce`
      // resolves the actual set of quotes to report.
      if ((!quoteId && !quoteIds?.length) || !txMetaId) {
        continue;
      }

      // Skip items older than the backfill window: the backend would reject
      // a status report for a quote that old, so there is no point creating
      // an entry or making a request.
      if (
        Date.now() - historyItem.startTime >
        QUOTE_STATUS_BACKFILL_WINDOW_MS
      ) {
        continue;
      }

      // Prefer the history hash; fall back to the tx hash (covers STX swaps
      // confirmed while closed, where the history hash was never written).
      const srcTxHash =
        historyItem.status.srcChain.txHash ??
        getTransactionMetaById(this.messenger, txMetaId)?.hash;
      if (!srcTxHash) {
        continue;
      }

      // Call `reportSubmittedOnce` for each history item that satisfies
      // the above criteria. The method will then take care the rest
      // (ie. if it actually needs to be reported or not because it already has been).
      this.#reportSubmittedOnce(historyKey, srcTxHash, txMetaId);
    }
  };

  /**
   * Restart polling for txs that are not in a final state
   * This is called during initialization
   */
  readonly #restartPollingForIncompleteHistoryItems = (): void => {
    // Check for historyItems that do not have a status of complete and restart polling
    const { txHistory } = this.state;
    const historyItems = Object.entries(txHistory);
    const incompleteHistoryItems = historyItems
      .filter(
        ([_, historyItem]) =>
          historyItem.status.status === StatusTypes.PENDING ||
          historyItem.status.status === StatusTypes.UNKNOWN,
      )
      // Only poll items with txMetaId (post-submission items)
      .filter(([_, historyItem]: [string, BridgeHistoryItem]) => {
        if (!historyItem.txMetaId) {
          return false;
        }
        // Check if we are already polling this tx, if so, skip restarting polling for that
        const pollingToken =
          this.#pollingTokensByTxMetaId[historyItem.txMetaId];
        return !pollingToken;
      })
      // Only restart polling for items that still require status updates
      .filter(([_, historyItem]: [string, BridgeHistoryItem]) => {
        return shouldPollHistoryItem(historyItem);
      });

    incompleteHistoryItems.forEach(
      ([historyKey, historyItem]: [string, BridgeHistoryItem]) => {
        const shouldSkipFetch = shouldSkipFetchDueToFetchFailures(
          historyItem.attempts,
        );
        if (shouldSkipFetch) {
          return;
        }

        // We manually call startPolling() here rather than go through startPollingForBridgeTxStatus()
        // because we don't want to overwrite the existing historyItem in state
        this.#startPollingForTxId(historyKey);
      },
    );
  };

  readonly #addTxToHistory = (
    historyKey: string,
    ...args: Parameters<typeof getInitialHistoryItem>
  ): string => {
    const txHistoryItem = getInitialHistoryItem(...args);
    this.update((state) => {
      state.txHistory[historyKey] = txHistoryItem;
    });
    return historyKey;
  };

  /**
   * Rekeys a history item from actionId to txMeta.id after successful submission.
   * Also updates txMetaId and srcTxHash which weren't available pre-submission.
   *
   * @param oldKey - The temporary key to use for the history item, usually the actionId
   * @param newKey - The new key to use, typcally the txmeta.id
   * @param txMeta - The transaction meta from the successful submission
   * @param txMeta.id - The transaction meta id to use as the new key
   * @param txMeta.hash - The transaction hash to set on the history item
   */
  readonly #rekeyHistoryItem = (
    oldKey: string,
    newKey: string,
    txMeta: { id: string; hash?: string },
  ): void => {
    this.update((state) => {
      rekeyHistoryItemInState(state, oldKey, newKey, txMeta);
    });
  };

  readonly #startPollingForTxId = (txId: string): void => {
    // If we are already polling for this tx, stop polling for it before restarting
    const existingPollingToken = this.#pollingTokensByTxMetaId[txId];
    if (existingPollingToken) {
      this.stopPollingByPollingToken(existingPollingToken);
    }

    const txHistoryItem = this.state.txHistory[txId];
    if (txHistoryItem && shouldPollHistoryItem(txHistoryItem)) {
      this.#pollingTokensByTxMetaId[txId] = this.startPolling({
        bridgeTxMetaId: txId,
      });
    }
  };

  /**
   * @deprecated For EVM/Solana swap/bridge txs we add tx to history in submitTx()
   * For Solana swap/bridge we start polling in submitTx()
   * For EVM bridge we listen for 'TransactionController:transactionConfirmed' and start polling there
   * No clients currently call this, safe to remove in future versions
   *
   * Adds tx to history and starts polling for the bridge tx status
   *
   * @param txHistoryMeta - The parameters for creating the history item
   */
  startPollingForBridgeTxStatus = (
    txHistoryMeta: StartPollingForBridgeTxStatusArgsSerialized,
  ): void => {
    const { bridgeTxMeta } = txHistoryMeta;

    if (!bridgeTxMeta?.id) {
      throw new Error(
        'Cannot start polling: bridgeTxMeta.id is required for polling',
      );
    }

    const historyKey = this.#addTxToHistory(bridgeTxMeta.id, txHistoryMeta);
    this.#startPollingForTxId(historyKey);
  };

  // This will be called after you call this.startPolling()
  // The args passed in are the args you passed in to startPolling()
  _executePoll = async (
    pollingInput: BridgeStatusPollingInput,
  ): Promise<void> => {
    await this.#fetchBridgeTxStatus(pollingInput);
  };

  /**
   * Handles the failure to fetch the bridge tx status
   * We eventually stop polling for the tx if we fail too many times
   * Failures (500 errors) can be due to:
   * - The srcTxHash not being available immediately for STX
   * - The srcTxHash being invalid for the chain. This case will never resolve so we stop polling for it to avoid hammering the Bridge API forever.
   *
   * @param bridgeTxMetaId - The txMetaId of the bridge tx
   */
  readonly #handleFetchFailure = (bridgeTxMetaId: string): void => {
    const { attempts } = this.state.txHistory[bridgeTxMetaId];

    const newAttempts = attempts
      ? {
          counter: attempts.counter + 1,
          lastAttemptTime: Date.now(),
        }
      : {
          counter: 1,
          lastAttemptTime: Date.now(),
        };

    // If we've failed too many times, stop polling for the tx
    const pollingToken = this.#pollingTokensByTxMetaId[bridgeTxMetaId];
    if (newAttempts.counter >= MAX_ATTEMPTS && pollingToken) {
      this.stopPollingByPollingToken(pollingToken);
      delete this.#pollingTokensByTxMetaId[bridgeTxMetaId];

      // Track max polling reached event
      const historyItem = this.state.txHistory[bridgeTxMetaId];
      if (historyItem) {
        // Track polling status updated event
        this.#trackPollingStatusUpdatedEvent(
          bridgeTxMetaId,
          PollingStatus.MaxPollingReached,
        );
      }
    }

    // Update the attempts counter
    this.#updateHistoryItem({
      historyKey: bridgeTxMetaId,
      attempts: newAttempts,
    });
  };

  /**
   * Checks if the history item should be preserved so its status can be fetched.
   *
   * @param bridgeTxMetaId - The txMetaId of the bridge tx
   */
  readonly #handleOldHistoryItem = async (
    bridgeTxMetaId: string,
  ): Promise<void> => {
    // Continue polling on next restart if the history item is valid
    if (
      this.state.txHistory[bridgeTxMetaId] &&
      (await shouldWaitForFinalBridgeStatus(
        this.messenger,
        this.state.txHistory[bridgeTxMetaId],
      ))
    ) {
      return;
    }

    const pollingToken = this.#pollingTokensByTxMetaId[bridgeTxMetaId];

    // Track polling status updated event
    this.#trackPollingStatusUpdatedEvent(
      bridgeTxMetaId,
      PollingStatus.InvalidTransactionHash,
    );

    // If we've failed too many times, stop polling for the tx
    if (pollingToken) {
      this.stopPollingByPollingToken(pollingToken);
      delete this.#pollingTokensByTxMetaId[bridgeTxMetaId];
    }

    // Delete the history item so polling doesn't start over on the next restart.
    // Report finalization as a failure here, this is the only place that
    // permanently ends polling, so it's the correct and non-duplicative point
    // to emit the final status.
    this.#quoteStatusManager.reportFinalised(bridgeTxMetaId, false);
    this.#deleteHistoryItem(bridgeTxMetaId);
  };

  readonly #fetchBridgeTxStatus = async ({
    bridgeTxMetaId,
  }: FetchBridgeTxStatusArgs): Promise<void> => {
    // 1. Check for history item

    const { txHistory } = this.state;
    const historyItem = txHistory[bridgeTxMetaId];
    if (!historyItem) {
      return;
    }

    // 2. Check for previous failures

    if (shouldSkipFetchDueToFetchFailures(historyItem.attempts)) {
      return;
    }

    // 3. Fetch transaction status

    try {
      let status: BridgeHistoryItem['status'];
      let validationFailures: string[] = [];

      if (historyItem.quote.intent) {
        const intentTxStatus =
          await this.#intentManager.getIntentTransactionStatus(
            bridgeTxMetaId,
            historyItem.quote.srcChainId,
            historyItem.quote.intent.protocol,
            this.#clientId,
            historyItem.status.srcChain.txHash,
          );

        if (
          intentTxStatus?.bridgeStatus === null ||
          intentTxStatus?.bridgeStatus === undefined
        ) {
          return;
        }
        status = intentTxStatus.bridgeStatus.status;

        // Report SUBMITTED as soon as the intent's source/settlement hash is
        // known at poll time, before the order reaches a terminal status.
        const intentSrcTxHash = status.srcChain.txHash;
        if (intentSrcTxHash) {
          this.#reportSubmittedOnce(
            bridgeTxMetaId,
            intentSrcTxHash,
            bridgeTxMetaId,
          );
        }
      } else {
        // We try here because we receive 500 errors from Bridge API if we try to fetch immediately after submitting the source tx
        // Oddly mostly happens on Optimism, never on Arbitrum. By the 2nd fetch, the Bridge API responds properly.
        // Also srcTxHash may not be available immediately for STX, so we don't want to fetch in those cases
        const srcTxHash = this.#setAndGetSrcTxHash(bridgeTxMetaId);

        if (!srcTxHash) {
          return;
        }

        // Report SUBMITTED as soon as a srcTxHash is known at poll time, for
        // every chain not just non-EVM sources.
        this.#reportSubmittedOnce(bridgeTxMetaId, srcTxHash, bridgeTxMetaId);

        const statusRequest = getStatusRequestWithSrcTxHash(
          historyItem.quote,
          srcTxHash,
        );
        const response =
          (historyItem.quoteId
            ? await fetchBridgeQuoteStatus(
                this.#quoteStatusManager,
                historyItem.quoteId,
              )
            : null) ??
          (await fetchBridgeTxStatus(
            statusRequest,
            this.#clientId,
            await getJwt(this.messenger),
            this.#fetchFn,
            this.#config.customBridgeApiBaseUrl,
          ));
        status = response.status;
        validationFailures = response.validationFailures;
      }

      if (validationFailures.length > 0) {
        this.#trackUnifiedSwapBridgeEvent(
          UnifiedSwapBridgeEventName.StatusValidationFailed,
          bridgeTxMetaId,
          {
            failures: validationFailures,
            refresh_count: historyItem.attempts?.counter ?? 0,
          },
        );
        throw new Error(
          `Bridge status validation failed: ${validationFailures.join(', ')}`,
        );
      }

      // 4. Create bridge history item

      const newBridgeHistoryItem = {
        ...historyItem,
        status,
        completionTime:
          status.status === StatusTypes.COMPLETE ||
          status.status === StatusTypes.FAILED
            ? Date.now()
            : undefined, // TODO make this more accurate by looking up dest txHash block time
        attempts: undefined,
      };

      // No need to purge these on network change or account change, TransactionController does not purge either.
      // TODO In theory we can skip checking status if it's not the current account/network
      // we need to keep track of the account that this is associated with as well so that we don't show it in Activity list for other accounts
      // First stab at this will not stop polling when you are on a different account
      this.update((state) => {
        state.txHistory[bridgeTxMetaId] = newBridgeHistoryItem;
      });

      if (historyItem.quote.intent) {
        this.#intentManager.syncTransactionFromIntentStatus(
          bridgeTxMetaId,
          historyItem,
        );
      }

      // 5. After effects

      const pollingToken = this.#pollingTokensByTxMetaId[bridgeTxMetaId];

      const isFinalStatus =
        status.status === StatusTypes.COMPLETE ||
        status.status === StatusTypes.FAILED;

      if (isFinalStatus) {
        if (pollingToken) {
          this.stopPollingByPollingToken(pollingToken);
          delete this.#pollingTokensByTxMetaId[bridgeTxMetaId];
        }

        // Ensure a deferred entry exists before reportFinalised is called.
        const settlementTxHash = newBridgeHistoryItem.status.srcChain.txHash;
        if (settlementTxHash) {
          this.#reportSubmittedOnce(
            bridgeTxMetaId,
            settlementTxHash,
            bridgeTxMetaId,
          );
        }

        this.#quoteStatusManager.reportFinalised(
          bridgeTxMetaId,
          status.status === StatusTypes.COMPLETE,
        );

        if (status.status === StatusTypes.COMPLETE) {
          this.#trackUnifiedSwapBridgeEvent(
            UnifiedSwapBridgeEventName.Completed,
            bridgeTxMetaId,
          );
          this.messenger.publish(
            'BridgeStatusController:destinationTransactionCompleted',
            historyItem.quote.destAsset.assetId,
          );
        }
        if (status.status === StatusTypes.FAILED) {
          this.#trackUnifiedSwapBridgeEvent(
            UnifiedSwapBridgeEventName.Failed,
            bridgeTxMetaId,
          );
        }
      }
    } catch (error) {
      console.warn('Failed to fetch bridge tx status', error);
      this.#handleFetchFailure(bridgeTxMetaId);
    } finally {
      await this.#handleOldHistoryItem(bridgeTxMetaId);
    }
  };

  /**
   * Returns the srcTxHash for a non-STX EVM tx, the hash from the bridge status api,
   * or the local hash from the TransactionController if the tx is in a finalized state
   *
   * @param bridgeTxMetaId - The bridge tx meta id
   * @returns The srcTxHash
   */
  readonly #setAndGetSrcTxHash = (
    bridgeTxMetaId: string,
  ): string | undefined => {
    const { txHistory } = this.state;
    // Prefer the srcTxHash from bridgeStatusState so we don't have to look up in TransactionController
    // But it is possible to have bridgeHistoryItem in state without the srcTxHash yet when it is an STX
    const srcTxHash = txHistory[bridgeTxMetaId].status.srcChain.txHash;

    if (
      srcTxHash ||
      isNonEvmChainId(txHistory[bridgeTxMetaId].quote.srcChainId)
    ) {
      return srcTxHash;
    }

    // Update history with TransactionController's hash if it has been updated
    const txMeta = getTransactionMetaById(this.messenger, bridgeTxMetaId);

    if (!txMeta) {
      return undefined;
    }

    // Wait for finalized status before updating the history item
    const localTxHash = [
      TransactionStatus.confirmed,
      TransactionStatus.dropped,
      TransactionStatus.rejected,
      TransactionStatus.failed,
    ].includes(txMeta.status)
      ? txMeta.hash
      : undefined;
    this.#updateHistoryItem({
      historyKey: bridgeTxMetaId,
      txHash: localTxHash,
    });

    return localTxHash;
  };

  readonly #updateHistoryItem = ({
    historyKey,
    status,
    txHash,
    attempts,
    completionTime,
  }: {
    historyKey?: string;
    status?: StatusTypes;
    txHash?: string;
    attempts?: BridgeHistoryItem['attempts'];
    completionTime?: BridgeHistoryItem['completionTime'];
  }): void => {
    if (!historyKey) {
      return;
    }
    this.update((currentState) => {
      if (status) {
        currentState.txHistory[historyKey].status.status = status;
      }
      if (txHash) {
        currentState.txHistory[historyKey].status.srcChain.txHash = txHash;
      }
      if (attempts) {
        currentState.txHistory[historyKey].attempts = attempts;
      }
      if (completionTime) {
        currentState.txHistory[historyKey].completionTime = completionTime;
      }
    });
  };

  readonly #deleteHistoryItem = (historyKey: string): void => {
    this.update((currentState) => {
      delete currentState.txHistory[historyKey];
    });
  };

  // Wipes the bridge status for the given address and chainId
  // Will match only source chainId to the selectedChainId
  readonly #wipeBridgeStatusByChainId = (
    address: string,
    selectedChainId: Hex,
  ): void => {
    const sourceTxMetaIdsToDelete = Object.keys(this.state.txHistory).filter(
      (txMetaId) => {
        const bridgeHistoryItem = this.state.txHistory[txMetaId];

        const hexSourceChainId = numberToHex(
          bridgeHistoryItem.quote.srcChainId,
        );

        return (
          bridgeHistoryItem.account === address &&
          hexSourceChainId === selectedChainId
        );
      },
    );

    sourceTxMetaIdsToDelete.forEach((sourceTxMetaId) => {
      const pollingToken = this.#pollingTokensByTxMetaId[sourceTxMetaId];

      if (pollingToken) {
        this.stopPollingByPollingToken(
          this.#pollingTokensByTxMetaId[sourceTxMetaId],
        );
        delete this.#pollingTokensByTxMetaId[sourceTxMetaId];
      }
    });

    this.update((state) => {
      state.txHistory = sourceTxMetaIdsToDelete.reduce(
        (acc, sourceTxMetaId) => {
          delete acc[sourceTxMetaId];
          return acc;
        },
        state.txHistory,
      );
    });
  };

  /**
   * ******************************************************
   * TX SUBMISSION HANDLING
   *******************************************************
   */

  readonly #executeSubmitStrategy = async (
    params: SubmitStrategyParams<Trade>,
    sharedHistoryItemProperties: {
      startTime: number;
      location: MetaMetricsSwapsEventSource;
      abTests?: Record<string, string>;
      activeAbTests?: { key: string; value: string }[];
      tokenSecurityTypeDestination?: string | null;
      inputPrimaryDenomination?: InputPrimaryDenomination;
    },
  ): Promise<TransactionMeta> => {
    let tradeTxMeta!: TransactionMeta;

    const steps = executeSubmitStrategy(params);

    // Each submission strategy determines when to execute step, which means these actions can happen in any order
    for await (const { type, payload } of steps) {
      try {
        switch (type) {
          case SubmitStep.RekeyHistoryItem:
            this.#rekeyHistoryItem(
              payload.oldHistoryKey,
              payload.newHistoryKey,
              payload.tradeMeta,
            );
            // Report SUBMITTED as soon as the trade hash is known at submission
            // time, instead of waiting for the delayed transactionStatusUpdated
            // (submitted) event.
            if (payload.tradeMeta.hash) {
              this.#reportSubmittedOnce(
                payload.newHistoryKey,
                payload.tradeMeta.hash,
                payload.tradeMeta.id,
              );
            }
            break;

          case SubmitStep.UpdateBatchTransactions:
            updateTransactionsInBatch({
              messenger: this.messenger,
              allTradesWithMetadata: payload.quoteAndTxMetas,
            });
            break;

          case SubmitStep.SetTradeMeta:
            tradeTxMeta = payload.tradeMeta;
            break;

          case SubmitStep.AddHistoryItem:
            this.#addTxToHistory(payload.historyKey, {
              ...payload,
              ...sharedHistoryItemProperties,
              quoteResponse: payload.quoteResponse,
              accountAddress: params.selectedAccount.address,
              isStxEnabled: params.isStxEnabled,
              slippagePercentage: 0, // TODO include slippage provided by quote if using dynamic slippage, or slippage from quote request
            });
            this.#reportSubmittedForNonEvmTx(
              payload.historyKey,
              payload.bridgeTxMeta,
            );
            break;

          case SubmitStep.StartPolling:
            this.#startPollingForTxId(payload.historyKey);
            break;

          case SubmitStep.PublishCompletedEvent:
            this.#quoteStatusManager.reportFinalised(payload.historyKey, true);
            this.#trackUnifiedSwapBridgeEvent(
              UnifiedSwapBridgeEventName.Completed,
              payload.historyKey,
            );
            break;

          /* c8 ignore start */
          default:
            throw new Error(`Unknown submit step type: ${String(type)}`);
          /* c8 ignore end */
        }
      } catch (error) {
        console.error(
          'Failed to add to bridge history and start polling.',
          error,
        );
      }
    }

    return tradeTxMeta;
  };

  /**
   * Submits a cross-chain swap transaction
   *
   * @param accountAddress - The address of the account to submit the transaction for
   * @param maybeQuoteResponses - A single quote response or an array of quote responses
   * @param isStxEnabled - Whether smart transactions are enabled on the client, for example the getSmartTransactionsEnabled selector value from the extension
   * @param quotesReceivedContext - The context for the QuotesReceived event
   * @param location - The entry point from which the user initiated the swap or bridge (e.g. Main View, Token View, Trending Explore)
   * @param abTests - Legacy A/B test context for `ab_tests` (backward compatibility)
   * @param activeAbTests - New A/B test context for `active_ab_tests` (migration target). Attributes events to specific experiments.
   * @param tokenSecurityTypeDestination - The security classification of the destination token, supplied by the client (e.g. from token security/scanning data). Pass `null` when no security data is available.
   * @param batchSellTrades - Contains transaction data for the quotes, provided by the obtainGaslessBatch API
   * @param inputPrimaryDenomination - The denomination shown as the primary source amount input at submission time.
   * @returns The transaction meta
   * @throws An error if transaction submission fails before it gets published
   */
  submitTx = async (
    accountAddress: string,
    maybeQuoteResponses:
      | (QuoteResponse<Trade, Trade> & QuoteMetadata)
      | (QuoteResponse<Trade, Trade> & QuoteMetadata)[],
    isStxEnabled: boolean,
    quotesReceivedContext?: RequiredEventContextFromClient[UnifiedSwapBridgeEventName.QuotesReceived],
    location: MetaMetricsSwapsEventSource = MetaMetricsSwapsEventSource.Unknown,
    abTests?: Record<string, string>,
    activeAbTests?: { key: string; value: string }[],
    tokenSecurityTypeDestination?: string | null,
    batchSellTrades?: BatchSellTradesResponse | null,
    inputPrimaryDenomination?: InputPrimaryDenomination,
  ): Promise<TransactionMeta> => {
    /**
     * If there are multiple quote responses, we assume that they all originate from the same src chain
     * and the same account. In this case its safe to use the first quote response's properties for
     * metrics and other pre-submission logic
     */
    const quoteResponses = Array.isArray(maybeQuoteResponses)
      ? maybeQuoteResponses
      : [maybeQuoteResponses];
    const quoteResponse = quoteResponses[0];

    const { quote } = quoteResponse;
    const startTime = Date.now();

    stopPollingForQuotes(this.messenger, quotesReceivedContext);

    const selectedAccount = getAccountByAddress(this.messenger, accountAddress);
    if (!selectedAccount) {
      throw new Error(
        'Failed to submit cross-chain swap transaction: undefined multichain account',
      );
    }
    const accountHardwareType = getAccountHardwareType(selectedAccount);

    /**
     * For hardware wallets on Mobile, this is fixes an issue where the Ledger does not get prompted for the 2nd approval.
     * Extension does not have this issue
     */
    const requireApproval =
      this.#clientId === BridgeClientId.MOBILE && accountHardwareType !== null;
    const isBridgeTx = isCrossChain(quote.srcChainId, quote.destChainId);

    const batchId = quoteResponses.some(
      ({ featureId: quoteFeatureId }) =>
        quoteFeatureId === FeatureId.BATCH_SELL,
    )
      ? generateBatchId()
      : undefined;

    const preConfirmationProperties = getPreConfirmationPropertiesFromQuote(
      quoteResponse,
      isStxEnabled,
      accountHardwareType,
      location,
      abTests,
      activeAbTests,
      tokenSecurityTypeDestination,
      batchSellTrades,
      batchId,
    );

    try {
      // Emit Submitted event after submit button is clicked
      this.#trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.Submitted,
        undefined,
        {
          ...preConfirmationProperties,
          ...(inputPrimaryDenomination && {
            input_primary_denomination: inputPrimaryDenomination,
          }),
        },
      );

      /**
       * Check if the account is an EIP-7702 delegated account.
       * Delegated accounts only allow 1 in-flight tx, so approve + swap
       * must be batched into a single transaction
       */
      const isDelegatedAccount = isNonEvmChainId(quote.srcChainId)
        ? false
        : await checkIsDelegatedAccount(
            this.messenger,
            selectedAccount.address as Hex,
            [formatChainIdToHex(quote.srcChainId)],
          );

      const strategyParams: SubmitStrategyParams<Trade> = {
        messenger: this.messenger,
        quoteResponses,
        batchSellTrades,
        isStxEnabled,
        isBridgeTx,
        isDelegatedAccount,
        selectedAccount,
        requireApproval,
        clientId: this.#clientId,
        bridgeApiBaseUrl: this.#config.customBridgeApiBaseUrl,
        addTransactionBatchFn: this.#addTransactionBatchFn,
        fetchFn: this.#fetchFn,
        traceFn: this.#trace,
        batchId,
      };

      return await this.#trace(
        getTraceParams(quoteResponse, isStxEnabled),
        async () =>
          await this.#executeSubmitStrategy(strategyParams, {
            startTime,
            location,
            abTests,
            activeAbTests,
            tokenSecurityTypeDestination,
            inputPrimaryDenomination,
          }),
      );
    } catch (error) {
      this.#trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.Failed,
        undefined,
        {
          error_message: (error as Error)?.message,
          ...preConfirmationProperties,
        },
      );
      throw error;
    }
  };

  /**
   * Submits an intent order and creates a synthetic history entry for UX.
   * The EIP-712 payload is always signed inside this controller via KeyringController.
   *
   * @param params - Object containing intent submission parameters
   * @param params.quoteResponse - Quote carrying intent data
   * @param params.accountAddress - The EOA submitting the order
   * @param params.location - The entry point from which the user initiated the swap or bridge
   * @param params.abTests - Legacy A/B test context for `ab_tests` (backward compatibility)
   * @param params.activeAbTests - New A/B test context for `active_ab_tests` (migration target). Attributes events to specific experiments.
   * @param params.tokenSecurityTypeDestination - The security classification of the destination token, supplied by the client (e.g. from token security/scanning data). Pass `null` when no security data is available.
   * @param params.inputPrimaryDenomination - The denomination shown as the primary source amount input at submission time.
   * @param params.isStxEnabled - Whether smart transactions are enabled on the client, for example the getSmartTransactionsEnabled selector value from the extension
   * @param params.quotesReceivedContext - The context for the QuotesReceived event
   * @returns A lightweight TransactionMeta-like object for history linking
   * @throws An error if intent or transaction submission fails before they get published
   */
  submitIntent = async (params: {
    quoteResponse: QuoteResponse<Trade, Trade> & QuoteMetadata;
    accountAddress: string;
    location?: MetaMetricsSwapsEventSource;
    abTests?: Record<string, string>;
    activeAbTests?: { key: string; value: string }[];
    tokenSecurityTypeDestination?: string | null;
    inputPrimaryDenomination?: InputPrimaryDenomination;
    isStxEnabled?: boolean;
    quotesReceivedContext?: RequiredEventContextFromClient[UnifiedSwapBridgeEventName.QuotesReceived];
  }): Promise<TransactionMeta> => {
    const {
      quoteResponse,
      accountAddress,
      location,
      abTests,
      activeAbTests,
      tokenSecurityTypeDestination,
      inputPrimaryDenomination,
      isStxEnabled = false,
      quotesReceivedContext,
    } = params;

    // TODO add metrics context
    return await this.submitTx(
      accountAddress,
      quoteResponse,
      isStxEnabled,
      quotesReceivedContext,
      location,
      abTests,
      activeAbTests,
      tokenSecurityTypeDestination,
      undefined,
      inputPrimaryDenomination,
    );
  };

  submitBatchSell = async (params: {
    quoteResponses: ((QuoteResponse<Trade, Trade> & QuoteMetadata) | null)[];
    accountAddress: string;
    location?: MetaMetricsSwapsEventSource;
    abTests?: Record<string, string>;
    activeAbTests?: { key: string; value: string }[];
    isStxEnabled?: boolean;
    quotesReceivedContext?: RequiredEventContextFromClient[UnifiedSwapBridgeEventName.QuotesReceived];
    tokenSecurityTypeDestination?: string | null;
  }): Promise<TransactionMeta> => {
    /**
     * Retrieve the batch sell trades from the BridgeController's state to ensure we submit
     * the original response data from the bridge-api
     */
    const batchSellTrades = getBatchSellTrades(this.messenger);
    return await this.submitTx(
      params.accountAddress,
      params.quoteResponses.filter(
        (
          quoteResponse,
        ): quoteResponse is QuoteResponse<Trade, Trade> & QuoteMetadata =>
          quoteResponse !== null,
      ),
      params.isStxEnabled ?? false,
      params.quotesReceivedContext,
      params.location,
      params.abTests,
      params.activeAbTests,
      params.tokenSecurityTypeDestination,
      batchSellTrades,
    );
  };

  readonly #trackPollingStatusUpdatedEvent = (
    historyKey: string,
    pollingStatus: PollingStatus,
  ): void => {
    // Track polling status updated event
    const historyItem = this.state.txHistory[historyKey];
    this.#trackUnifiedSwapBridgeEvent(
      UnifiedSwapBridgeEventName.PollingStatusUpdated,
      historyKey,
      {
        polling_status: pollingStatus,
        retry_attempts: historyItem.attempts?.counter ?? 0,
      },
    );
  };

  /**
   * Tracks post-submission events for a cross-chain swap based on the history item
   *
   * @param eventName - The name of the event to track
   * @param txHistoryKey - The txMetaId, actionId or intentUid of the history item to track the event for
   * @param eventProperties - The properties for the event
   */
  readonly #trackUnifiedSwapBridgeEvent = <
    EventName extends
      | typeof UnifiedSwapBridgeEventName.Submitted
      | typeof UnifiedSwapBridgeEventName.Failed
      | typeof UnifiedSwapBridgeEventName.Completed
      | typeof UnifiedSwapBridgeEventName.StatusValidationFailed
      | typeof UnifiedSwapBridgeEventName.PollingStatusUpdated,
    EventProperties extends Omit<
      RequiredEventContextFromClient[EventName],
      'feature_id'
    > & {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      feature_id?: FeatureId;
    },
  >(
    eventName: EventName,
    txHistoryKey?: string,
    eventProperties?: EventProperties,
  ): void => {
    const historyItem: BridgeHistoryItem | undefined = txHistoryKey
      ? this.state.txHistory[txHistoryKey]
      : undefined;

    const featureId =
      eventProperties?.feature_id ??
      historyItem?.featureId ??
      FeatureId.UNIFIED_SWAP_BRIDGE;

    if (
      !(
        ALLOWED_FEATURE_IDS_FOR_STATUS_EVENTS.includes(featureId) ||
        eventName === UnifiedSwapBridgeEventName.StatusValidationFailed
      )
    ) {
      return;
    }

    // Legacy/new metrics fields are intentionally kept independent during migration.
    const historyAbTests = txHistoryKey
      ? this.state.txHistory?.[txHistoryKey]?.abTests
      : undefined;
    const historyActiveAbTests = txHistoryKey
      ? this.state.txHistory?.[txHistoryKey]?.activeAbTests
      : undefined;
    const resolvedAbTests = eventProperties?.ab_tests ?? historyAbTests;
    const resolvedActiveAbTests =
      eventProperties?.active_ab_tests ?? historyActiveAbTests;

    const location =
      historyItem?.location ??
      eventProperties?.location ??
      MetaMetricsSwapsEventSource.Unknown;

    const baseProperties = {
      action_type: MetricsActionType.SWAPBRIDGE_V1,
      feature_id: featureId ?? FeatureId.UNIFIED_SWAP_BRIDGE,
      ...(historyItem?.batchId ? { batch_id: historyItem.batchId } : {}),
      ...(eventProperties ?? {}),
      location,
      ...(resolvedAbTests &&
        Object.keys(resolvedAbTests).length > 0 && {
          ab_tests: resolvedAbTests,
        }),
      ...(resolvedActiveAbTests &&
        resolvedActiveAbTests.length > 0 && {
          active_ab_tests: resolvedActiveAbTests,
        }),
    };

    // This will publish events for PERPS dropped tx failures as well
    if (!historyItem) {
      trackMetricsEvent({
        messenger: this.messenger,
        eventName,
        properties: baseProperties,
      });
      return;
    }

    const { approvalTxId, quote } = historyItem;
    const requestParamProperties = getRequestParamFromHistory(historyItem);

    if (eventName === UnifiedSwapBridgeEventName.StatusValidationFailed) {
      trackMetricsEvent({
        messenger: this.messenger,
        eventName,
        properties: {
          ...baseProperties,
          chain_id_source: requestParamProperties.chain_id_source,
          chain_id_destination: requestParamProperties.chain_id_destination,
          token_address_source: requestParamProperties.token_address_source,
          token_address_destination:
            requestParamProperties.token_address_destination,
          token_security_type_destination:
            requestParamProperties.token_security_type_destination,
          refresh_count: historyItem.attempts?.counter ?? 0,
        },
      });
      return;
    }

    const selectedAccount = getAccountByAddress(
      this.messenger,
      historyItem.account,
    );

    const transactions = getTransactions(this.messenger);
    const txMeta = transactions.find(
      (tx: TransactionMeta) => tx.id === txHistoryKey,
    );
    const approvalTxMeta = transactions.find(
      (tx: TransactionMeta) => tx.id === approvalTxId,
    );

    const requiredEventProperties = {
      ...baseProperties,
      ...requestParamProperties,
      ...getRequestMetadataFromHistory(historyItem, selectedAccount),
      ...getTradeDataFromHistory(historyItem),
      ...getTxStatusesFromHistory(historyItem),
      ...getFinalizedTxProperties(historyItem, txMeta, approvalTxMeta),
      ...getPriceImpactFromQuote(quote),
      ...(eventName === UnifiedSwapBridgeEventName.Completed && {
        ...(!isNonEvmChainId(historyItem.quote.srcChainId) &&
          historyItem.txMetaId && {
            transaction_internal_id: historyItem.txMetaId,
          }),
        ...(historyItem.inputPrimaryDenomination && {
          input_primary_denomination: historyItem.inputPrimaryDenomination,
        }),
      }),
    };

    trackMetricsEvent({
      messenger: this.messenger,
      eventName,
      properties: requiredEventProperties,
    });
  };
}
