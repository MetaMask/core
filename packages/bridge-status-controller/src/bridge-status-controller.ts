import type { StateMetadata } from '@metamask/base-controller';
import type {
  QuoteMetadata,
  RequiredEventContextFromClient,
  TxData,
  QuoteResponse,
  Trade,
  TronTradeData,
} from '@metamask/bridge-controller';
import {
  formatChainIdToHex,
  isNonEvmChainId,
  StatusTypes,
  getAccountHardwareType,
  UnifiedSwapBridgeEventName,
  isCrossChain,
  isTronChainId,
  isEvmTxData,
  MetricsActionType,
  MetaMetricsSwapsEventSource,
  isBitcoinTrade,
  isTronTrade,
  PollingStatus,
} from '@metamask/bridge-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import {
  TransactionStatus,
  TransactionType,
  TransactionController,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { numberToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { IntentManager } from './bridge-status-controller.intent';
import {
  BRIDGE_PROD_API_BASE_URL,
  BRIDGE_STATUS_CONTROLLER_NAME,
  DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE,
  MAX_ATTEMPTS,
  REFRESH_INTERVAL_MS,
} from './constants';
import type {
  BridgeStatusControllerState,
  StartPollingForBridgeTxStatusArgsSerialized,
  FetchFunction,
  SolanaTransactionMeta,
  BridgeHistoryItem,
} from './types';
import type { BridgeStatusControllerMessenger } from './types';
import { BridgeClientId } from './types';
import { getAccountByAddress } from './utils/accounts';
import { getJwt } from './utils/authentication';
import { stopPollingForQuotes, trackMetricsEvent } from './utils/bridge';
import {
  fetchBridgeTxStatus,
  getStatusRequestWithSrcTxHash,
  shouldSkipFetchDueToFetchFailures,
  shouldWaitForFinalBridgeStatus,
} from './utils/bridge-status';
import {
  getInitialHistoryItem,
  getMatchingHistoryEntryForTxMeta,
  rekeyHistoryItemInState,
  shouldPollHistoryItem,
  getMatchingHistoryEntryForApprovalTxMeta,
} from './utils/history';
import {
  getIntentFromQuote,
  IntentSubmissionParams,
  mapIntentOrderStatusToTransactionStatus,
  postSubmitOrder,
} from './utils/intent-api';
import { signTypedMessage } from './utils/keyring';
import {
  getFinalizedTxProperties,
  getPriceImpactFromQuote,
  getRequestMetadataFromHistory,
  getRequestParamFromHistory,
  getTradeDataFromHistory,
  getEVMTxPropertiesFromTransactionMeta,
  getTxStatusesFromHistory,
  getPreConfirmationPropertiesFromQuote,
  getPollingStatusUpdatedProperties,
} from './utils/metrics';
import {
  getNetworkClientIdByChainId,
  getSelectedChainId,
} from './utils/network';
import { handleNonEvmTx } from './utils/snaps';
import { getApprovalTraceParams, getTraceParams } from './utils/trace';
import {
  getAddTransactionBatchParams,
  handleApprovalDelay,
  handleMobileHardwareWalletDelay,
  generateActionId,
  waitForTxConfirmation,
  getTransactionMetaById,
  addTransactionBatch,
  addSyntheticTransaction,
  getTransactions,
  submitEvmTransaction,
  checkIsDelegatedAccount,
  isCrossChainTx,
} from './utils/transaction';

const metadata: StateMetadata<BridgeStatusControllerState> = {
  // We want to persist the bridge status state so that we can show the proper data for the Activity list
  // basically match the behavior of TransactionController
  txHistory: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
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
    fetchFn,
    addTransactionBatchFn,
    config,
    traceFn,
  }: {
    messenger: BridgeStatusControllerMessenger;
    state?: Partial<BridgeStatusControllerState>;
    clientId: BridgeClientId;
    fetchFn: FetchFunction;
    addTransactionBatchFn: typeof TransactionController.prototype.addTransactionBatch;
    config?: {
      customBridgeApiBaseUrl?: string;
    };
    traceFn?: TraceCallback;
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
    });

    if (txMeta.status === TransactionStatus.rejected) {
      return;
    }

    // Skip account lookup and tracking when featureId is set (e.g. PERPS)
    if (historyKey && this.state.txHistory[historyKey]?.featureId) {
      return;
    }

    // Skip tracking if this is a duplicate failed event for the same history item
    // This can happen if the transaction includes an approval tx that fails
    if (isHistoryItemAlreadyFailed) {
      return;
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

    switch (txMeta.type) {
      case TransactionType.swap:
        this.#updateHistoryItem({
          historyKey,
          status: StatusTypes.COMPLETE,
        });
        this.#trackUnifiedSwapBridgeEvent(
          UnifiedSwapBridgeEventName.Completed,
          historyKey,
        );
        break;
      default:
        if (historyKey) {
          this.#startPollingForTxId(historyKey);
        }
        break;
    }
  };

  resetState = (): void => {
    this.update((state) => {
      state.txHistory = DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE.txHistory;
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
        if (!historyItem.featureId) {
          const selectedAccount = getAccountByAddress(
            this.messenger,
            historyItem.account,
          );
          const requestParams = getRequestParamFromHistory(historyItem);
          const requestMetadata = getRequestMetadataFromHistory(
            historyItem,
            selectedAccount,
          );
          const { security_warnings: _, ...metadataWithoutWarnings } =
            requestMetadata;

          this.#trackUnifiedSwapBridgeEvent(
            UnifiedSwapBridgeEventName.PollingStatusUpdated,
            targetTxMetaId,
            {
              ...getTradeDataFromHistory(historyItem),
              ...getPriceImpactFromQuote(historyItem.quote),
              ...metadataWithoutWarnings,
              chain_id_source: requestParams.chain_id_source,
              chain_id_destination: requestParams.chain_id_destination,
              token_symbol_source: requestParams.token_symbol_source,
              token_symbol_destination: requestParams.token_symbol_destination,
              action_type: MetricsActionType.SWAPBRIDGE_V1,
              polling_status: PollingStatus.ManuallyRestarted,
              retry_attempts: previousAttempts,
            },
          );
        }
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
    ...args: Parameters<typeof getInitialHistoryItem>
  ): string => {
    const { historyKey, txHistoryItem } = getInitialHistoryItem(...args);
    this.update((state) => {
      // Use actionId as key for pre-submission, or txMeta.id for post-submission
      state.txHistory[historyKey] = txHistoryItem;
    });
    return historyKey;
  };

  /**
   * Rekeys a history item from actionId to txMeta.id after successful submission.
   * Also updates txMetaId and srcTxHash which weren't available pre-submission.
   *
   * @param actionId - The actionId used as the temporary key for the history item
   * @param txMeta - The transaction meta from the successful submission
   * @param txMeta.id - The transaction meta id to use as the new key
   * @param txMeta.hash - The transaction hash to set on the history item
   */
  readonly #rekeyHistoryItem = (
    actionId: string,
    txMeta: { id: string; hash?: string },
  ): void => {
    this.update((state) => {
      rekeyHistoryItemInState(state, actionId, txMeta);
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

    const historyKey = this.#addTxToHistory(txHistoryMeta);
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
      if (historyItem && !historyItem.featureId) {
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

    // Delete the history item so polling doesn't start over on the next restart
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
      } else {
        // We try here because we receive 500 errors from Bridge API if we try to fetch immediately after submitting the source tx
        // Oddly mostly happens on Optimism, never on Arbitrum. By the 2nd fetch, the Bridge API responds properly.
        // Also srcTxHash may not be available immediately for STX, so we don't want to fetch in those cases
        const srcTxHash = this.#setAndGetSrcTxHash(bridgeTxMetaId);

        if (!srcTxHash) {
          return;
        }

        const statusRequest = getStatusRequestWithSrcTxHash(
          historyItem.quote,
          srcTxHash,
        );
        const response = await fetchBridgeTxStatus(
          statusRequest,
          this.#clientId,
          await getJwt(this.messenger),
          this.#fetchFn,
          this.#config.customBridgeApiBaseUrl,
        );
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

      if (isFinalStatus && pollingToken) {
        this.stopPollingByPollingToken(pollingToken);
        delete this.#pollingTokensByTxMetaId[bridgeTxMetaId];

        // Skip tracking events when featureId is set (i.e. PERPS)
        if (historyItem.featureId) {
          return;
        }

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
  }: {
    historyKey?: string;
    status?: StatusTypes;
    txHash?: string;
    attempts?: BridgeHistoryItem['attempts'];
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

  readonly #handleApprovalTx = async (
    quoteResponse: QuoteResponse<Trade, Trade> & QuoteMetadata,
    isBridgeTx: boolean,
    srcChainId: QuoteResponse['quote']['srcChainId'],
    approval?: TxData | TronTradeData,
    resetApproval?: TxData,
    requireApproval?: boolean,
  ): Promise<TransactionMeta | undefined> => {
    if (approval && isEvmTxData(approval)) {
      const approveTx = async (): Promise<TransactionMeta> => {
        if (resetApproval) {
          await submitEvmTransaction({
            messenger: this.messenger,
            transactionType: TransactionType.bridgeApproval,
            trade: resetApproval,
          });
        }

        const approvalTxMeta = await submitEvmTransaction({
          messenger: this.messenger,
          transactionType: isBridgeTx
            ? TransactionType.bridgeApproval
            : TransactionType.swapApproval,
          trade: approval,
          requireApproval,
        });

        await handleApprovalDelay(srcChainId);
        return approvalTxMeta;
      };

      return await this.#trace(
        getApprovalTraceParams(quoteResponse, false),
        approveTx,
      );
    }

    return undefined;
  };

  // TODO simplify and make more readable
  /**
   * Submits batched EVM transactions to the TransactionController
   *
   * @param args - The parameters for the transaction
   * @param args.isBridgeTx - Whether the transaction is a bridge transaction
   * @param args.trade - The trade data to confirm
   * @param args.approval - The approval data to confirm
   * @param args.resetApproval - The ethereum:USDT reset approval data to confirm
   * @param args.quoteResponse - The quote response
   * @param args.requireApproval - Whether to require approval for the transaction
   * @returns The approvalMeta and tradeMeta for the batched transaction
   */
  readonly #handleEvmTransactionBatch = async (
    args: Omit<
      Parameters<typeof getAddTransactionBatchParams>[0],
      'messenger' | 'estimateGasFeeFn'
    >,
  ): Promise<{
    approvalMeta?: TransactionMeta;
    tradeMeta: TransactionMeta;
  }> => {
    const transactionParams = await getAddTransactionBatchParams({
      messenger: this.messenger,
      ...args,
    });

    return await addTransactionBatch(
      this.messenger,
      this.#addTransactionBatchFn,
      transactionParams,
    );
  };

  /**
   * Submits a cross-chain swap transaction
   *
   * @param accountAddress - The address of the account to submit the transaction for
   * @param quoteResponse - The quote response
   * @param isStxEnabledOnClient - Whether smart transactions are enabled on the client, for example the getSmartTransactionsEnabled selector value from the extension
   * @param quotesReceivedContext - The context for the QuotesReceived event
   * @param location - The entry point from which the user initiated the swap or bridge (e.g. Main View, Token View, Trending Explore)
   * @param abTests - Legacy A/B test context for `ab_tests` (backward compatibility)
   * @param activeAbTests - New A/B test context for `active_ab_tests` (migration target). Attributes events to specific experiments.
   * @param tokenSecurityTypeDestination - The security classification of the destination token, supplied by the client (e.g. from token security/scanning data). Pass `null` when no security data is available.
   * @returns The transaction meta
   */
  submitTx = async (
    accountAddress: string,
    quoteResponse: QuoteResponse<Trade, Trade> & QuoteMetadata,
    isStxEnabledOnClient: boolean,
    quotesReceivedContext?: RequiredEventContextFromClient[UnifiedSwapBridgeEventName.QuotesReceived],
    location: MetaMetricsSwapsEventSource = MetaMetricsSwapsEventSource.MainView,
    abTests?: Record<string, string>,
    activeAbTests?: { key: string; value: string }[],
    tokenSecurityTypeDestination?: string | null,
  ): Promise<TransactionMeta & Partial<SolanaTransactionMeta>> => {
    stopPollingForQuotes(
      this.messenger,
      quoteResponse.featureId,
      quotesReceivedContext,
    );

    const selectedAccount = getAccountByAddress(this.messenger, accountAddress);
    if (!selectedAccount) {
      throw new Error(
        'Failed to submit cross-chain swap transaction: undefined multichain account',
      );
    }
    const accountHardwareType = getAccountHardwareType(selectedAccount);

    const preConfirmationProperties = getPreConfirmationPropertiesFromQuote(
      quoteResponse,
      isStxEnabledOnClient,
      accountHardwareType,
      location,
      abTests,
      activeAbTests,
      tokenSecurityTypeDestination,
    );

    let txMeta: TransactionMeta & Partial<SolanaTransactionMeta>;
    let approvalTxId: string | undefined;
    let isDelegatedAccount = false;
    const startTime = Date.now();

    const isBridgeTx = isCrossChain(
      quoteResponse.quote.srcChainId,
      quoteResponse.quote.destChainId,
    );
    const isTronTx = isTronChainId(quoteResponse.quote.srcChainId);

    try {
      // Emit Submitted event after submit button is clicked
      !quoteResponse.featureId &&
        this.#trackUnifiedSwapBridgeEvent(
          UnifiedSwapBridgeEventName.Submitted,
          undefined,
          preConfirmationProperties,
        );
      // Submit non-EVM tx (Solana, BTC, Tron)
      if (isNonEvmChainId(quoteResponse.quote.srcChainId)) {
        // Handle non-EVM approval if present (e.g., Tron token approvals)
        if (quoteResponse.approval && isTronTrade(quoteResponse.approval)) {
          const approvalTxMeta = await this.#trace(
            getApprovalTraceParams(quoteResponse, false),
            async () => {
              return quoteResponse.approval &&
                isTronTrade(quoteResponse.approval)
                ? await handleNonEvmTx(
                    this.messenger,
                    quoteResponse.approval,
                    quoteResponse,
                    selectedAccount,
                  )
                : /* c8 ignore start */
                  undefined;
              /* c8 ignore end */
            },
          );

          approvalTxId = approvalTxMeta?.id;

          // Add delay after approval similar to EVM flow
          await handleApprovalDelay(quoteResponse.quote.srcChainId);
        }

        txMeta = await this.#trace(
          getTraceParams(quoteResponse, false),
          async () => {
            if (
              !(
                isTronTrade(quoteResponse.trade) ||
                isBitcoinTrade(quoteResponse.trade) ||
                typeof quoteResponse.trade === 'string'
              )
            ) {
              throw new Error(
                'Failed to submit cross-chain swap transaction: trade is not a non-EVM transaction',
              );
            }
            return await handleNonEvmTx(
              this.messenger,
              quoteResponse.trade,
              quoteResponse,
              selectedAccount,
            );
          },
        );
      } else {
        // Submit EVM tx
        // For hardware wallets on Mobile, this is fixes an issue where the Ledger does not get prompted for the 2nd approval
        // Extension does not have this issue
        const requireApproval =
          this.#clientId === BridgeClientId.MOBILE &&
          accountHardwareType !== null;

        // Handle smart transactions if enabled
        txMeta = await this.#trace(
          getTraceParams(quoteResponse, isStxEnabledOnClient),
          async () => {
            if (!isEvmTxData(quoteResponse.trade)) {
              throw new Error(
                'Failed to submit cross-chain swap transaction: trade is not an EVM transaction',
              );
            }
            // Check if the account is an EIP-7702 delegated account
            // Delegated accounts only allow 1 in-flight tx, so approve + swap
            // must be batched into a single transaction
            const hexChainId = formatChainIdToHex(
              quoteResponse.quote.srcChainId,
            );
            isDelegatedAccount = await checkIsDelegatedAccount(
              this.messenger,
              quoteResponse.trade.from as `0x`,
              [hexChainId],
            );

            if (
              isStxEnabledOnClient ||
              quoteResponse.quote.gasIncluded7702 ||
              isDelegatedAccount
            ) {
              const { tradeMeta, approvalMeta } =
                await this.#handleEvmTransactionBatch({
                  isBridgeTx,
                  resetApproval: quoteResponse.resetApproval,
                  approval:
                    quoteResponse.approval &&
                    isEvmTxData(quoteResponse.approval)
                      ? quoteResponse.approval
                      : undefined,
                  trade: quoteResponse.trade,
                  quoteResponse,
                  requireApproval,
                  isDelegatedAccount,
                });

              approvalTxId = approvalMeta?.id;
              return tradeMeta;
            }
            // Set approval time and id if an approval tx is needed
            const approvalTxMeta = await this.#handleApprovalTx(
              quoteResponse,
              isBridgeTx,
              quoteResponse.quote.srcChainId,
              quoteResponse.approval && isEvmTxData(quoteResponse.approval)
                ? quoteResponse.approval
                : undefined,
              quoteResponse.resetApproval,
              requireApproval,
            );

            approvalTxId = approvalTxMeta?.id;

            // Hardware-wallet delay first (Ledger second-prompt spacing), then wait for
            // on-chain approval confirmation so swap gas estimation runs after allowance is set.
            if (requireApproval && approvalTxMeta) {
              await handleMobileHardwareWalletDelay(requireApproval);
              await waitForTxConfirmation(this.messenger, approvalTxMeta.id);
            } else {
              await handleMobileHardwareWalletDelay(requireApproval);
            }

            // Generate actionId for pre-submission history (non-batch EVM only)
            const actionId = generateActionId().toString();

            // Add pre-submission history keyed by actionId
            // This ensures we have quote data available if transaction fails during submission
            const historyKey = this.#addTxToHistory({
              accountAddress: selectedAccount.address,
              quoteResponse,
              slippagePercentage: 0,
              isStxEnabled: isStxEnabledOnClient,
              startTime,
              approvalTxId,
              location,
              abTests,
              activeAbTests,
              actionId,
              tokenSecurityTypeDestination,
            });

            // Pass txFee when gasIncluded is true to use the quote's gas fees
            // instead of re-estimating (which would fail for max native token swaps)
            const tradeTxMeta = await submitEvmTransaction({
              messenger: this.messenger,
              transactionType: isBridgeTx
                ? TransactionType.bridge
                : TransactionType.swap,
              trade: quoteResponse.trade,
              requireApproval,
              txFee: quoteResponse.quote.gasIncluded
                ? quoteResponse.quote.feeData.txFee
                : undefined,
              actionId,
            });

            // On success, rekey from actionId to txMeta.id and update srcTxHash
            this.#rekeyHistoryItem(historyKey, tradeTxMeta);

            return tradeTxMeta;
          },
        );
      }
    } catch (error) {
      !quoteResponse.featureId &&
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

    try {
      // For non-batch EVM transactions, history was already added/rekeyed above
      // Only add history here for non-EVM and batch EVM transactions
      const isNonBatchEvm =
        !isNonEvmChainId(quoteResponse.quote.srcChainId) &&
        !isStxEnabledOnClient &&
        !quoteResponse.quote.gasIncluded7702 &&
        !isDelegatedAccount;

      let historyKey: string = txMeta.id;
      if (!isNonBatchEvm) {
        // Add swap or bridge tx to history
        historyKey = this.#addTxToHistory({
          accountAddress: selectedAccount.address,
          bridgeTxMeta: txMeta, // Only the id and hash fields are used by the BridgeStatusController
          quoteResponse,
          slippagePercentage: 0, // TODO include slippage provided by quote if using dynamic slippage, or slippage from quote request
          isStxEnabled: isStxEnabledOnClient,
          startTime,
          approvalTxId,
          location,
          abTests,
          activeAbTests,
          tokenSecurityTypeDestination,
        });
      }

      if (isNonEvmChainId(quoteResponse.quote.srcChainId)) {
        // Start polling for bridge tx status
        this.#startPollingForTxId(historyKey);
        // Track non-EVM Swap completed event
        if (!(isBridgeTx || isTronTx)) {
          this.#trackUnifiedSwapBridgeEvent(
            UnifiedSwapBridgeEventName.Completed,
            historyKey,
          );
        }
      }
    } catch {
      // Ignore errors here, we don't want to crash the app if this fails and tx submission succeeds
    }
    return txMeta;
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
   * @returns A lightweight TransactionMeta-like object for history linking
   */
  submitIntent = async (params: {
    quoteResponse: QuoteResponse<Trade, Trade> & QuoteMetadata;
    accountAddress: string;
    location?: MetaMetricsSwapsEventSource;
    abTests?: Record<string, string>;
    activeAbTests?: { key: string; value: string }[];
    tokenSecurityTypeDestination?: string | null;
  }): Promise<Pick<TransactionMeta, 'id' | 'chainId' | 'type' | 'status'>> => {
    const {
      quoteResponse,
      accountAddress,
      location,
      abTests,
      activeAbTests,
      tokenSecurityTypeDestination,
    } = params;

    // TODO add metrics context
    stopPollingForQuotes(this.messenger);

    const startTime = Date.now();

    // Build pre-confirmation properties for error tracking parity with submitTx
    const account = getAccountByAddress(this.messenger, accountAddress);
    const accountHardwareType = getAccountHardwareType(account);
    const preConfirmationProperties = getPreConfirmationPropertiesFromQuote(
      quoteResponse,
      false,
      accountHardwareType,
      location,
      abTests,
      activeAbTests,
      tokenSecurityTypeDestination,
    );

    try {
      const intent = getIntentFromQuote(quoteResponse);

      // If backend provided an approval tx for this intent quote, submit it first (on-chain),
      // then proceed with off-chain intent submission.
      const isBridgeTx = isCrossChain(
        quoteResponse.quote.srcChainId,
        quoteResponse.quote.destChainId,
      );

      const requireApproval =
        this.#clientId === BridgeClientId.MOBILE &&
        accountHardwareType !== null;
      // Handle approval silently for better UX in intent flows
      const approvalTxMeta = await this.#handleApprovalTx(
        quoteResponse,
        isBridgeTx,
        quoteResponse.quote.srcChainId,
        quoteResponse.approval,
        quoteResponse.resetApproval,
        requireApproval,
      );

      const approvalTxId = approvalTxMeta?.id;

      if (approvalTxId) {
        await waitForTxConfirmation(this.messenger, approvalTxId);
      }

      const { srcChainId, requestId } = quoteResponse.quote;

      const signature = await signTypedMessage({
        messenger: this.messenger,
        accountAddress,
        typedData: intent.typedData,
      });

      const submissionParams: IntentSubmissionParams = {
        srcChainId,
        quoteId: requestId,
        signature,
        order: intent.order,
        userAddress: accountAddress,
        aggregatorId: intent.protocol,
      };

      const { id: orderUid, status } = await postSubmitOrder({
        params: submissionParams,
        clientId: this.#clientId,
        jwt: await getJwt(this.messenger),
        fetchFn: this.#fetchFn,
        bridgeApiBaseUrl: this.#config.customBridgeApiBaseUrl,
      });

      // Determine transaction type: swap for same-chain, bridge for cross-chain
      const transactionType = isBridgeTx
        ? /* c8 ignore start */
          TransactionType.bridge
        : /* c8 ignore end */
          TransactionType.swap;

      // Create actual transaction in Transaction Controller first
      const networkClientId = getNetworkClientIdByChainId(
        this.messenger,
        srcChainId,
      );

      // This is a synthetic transaction whose purpose is to be able
      // to track the order status via the history
      const intentTransactionParams = {
        chainId: formatChainIdToHex(srcChainId),
        from: accountAddress,
        to:
          intent.settlementContract ??
          '0x9008D19f58AAbd9eD0D60971565AA8510560ab41', // Default settlement contract
        data: `0x${orderUid.slice(-8)}`, // Use last 8 chars of orderUid to make each transaction unique
        value: '0x0',
        gas: '0x5208', // Minimal gas for display purposes
        gasPrice: '0x3b9aca00', // 1 Gwei - will be converted to EIP-1559 fees if network supports it
      };

      const initialTxMeta = await addSyntheticTransaction(
        this.messenger,
        intentTransactionParams,
        {
          requireApproval: false,
          networkClientId,
          type: transactionType,
        },
      );

      // Update txHistory with actual transaction metadata
      const syntheticMeta = {
        ...initialTxMeta,
        // Map intent order status to TransactionController status
        status: mapIntentOrderStatusToTransactionStatus(status),
        isIntentTx: true,
        orderUid,
      };

      // Record in bridge history with actual transaction metadata
      try {
        // Create a bridge transaction metadata that includes the original txId
        const bridgeTxMetaForHistory = {
          ...syntheticMeta,
          id: orderUid,
          originalTransactionId: syntheticMeta.id, // Keep original txId for TransactionController updates
        };

        // Use orderId as the history key for intent transactions
        const historyKey = this.#addTxToHistory({
          accountAddress,
          bridgeTxMeta: bridgeTxMetaForHistory,
          quoteResponse,
          slippagePercentage: 0,
          isStxEnabled: false,
          approvalTxId,
          startTime,
          location,
          abTests,
          activeAbTests,
          tokenSecurityTypeDestination,
        });

        // Start polling using the orderId key to route to intent manager
        this.#startPollingForTxId(historyKey);
      } catch (error) {
        console.error(
          '📝 [submitIntent] Failed to add to bridge history',
          error,
        );
        // non-fatal but log the error
      }
      return syntheticMeta;
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

  readonly #trackPollingStatusUpdatedEvent = (
    historyKey: string,
    pollingStatus: PollingStatus,
  ): void => {
    // Track polling status updated event
    const historyItem = this.state.txHistory[historyKey];
    if (historyItem && !historyItem.featureId) {
      this.#trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.PollingStatusUpdated,
        historyKey,
        getPollingStatusUpdatedProperties(
          this.messenger,
          pollingStatus,
          historyItem,
        ),
      );
    }
  };

  /**
   * Tracks post-submission events for a cross-chain swap based on the history item
   *
   * @param eventName - The name of the event to track
   * @param txMetaId - The txMetaId of the history item to track the event for
   * @param eventProperties - The properties for the event
   */
  readonly #trackUnifiedSwapBridgeEvent = <
    EventName extends
      | typeof UnifiedSwapBridgeEventName.Submitted
      | typeof UnifiedSwapBridgeEventName.Failed
      | typeof UnifiedSwapBridgeEventName.Completed
      | typeof UnifiedSwapBridgeEventName.StatusValidationFailed
      | typeof UnifiedSwapBridgeEventName.PollingStatusUpdated,
  >(
    eventName: EventName,
    txMetaId?: string,
    eventProperties?: Pick<
      RequiredEventContextFromClient,
      EventName
    >[EventName],
  ): void => {
    // Legacy/new metrics fields are intentionally kept independent during migration.
    const historyAbTests = txMetaId
      ? this.state.txHistory?.[txMetaId]?.abTests
      : undefined;
    const historyActiveAbTests = txMetaId
      ? this.state.txHistory?.[txMetaId]?.activeAbTests
      : undefined;
    const resolvedAbTests = eventProperties?.ab_tests ?? historyAbTests;
    const resolvedActiveAbTests =
      eventProperties?.active_ab_tests ?? historyActiveAbTests;

    const baseProperties = {
      action_type: MetricsActionType.SWAPBRIDGE_V1,
      location:
        eventProperties?.location ??
        (txMetaId ? this.state.txHistory?.[txMetaId]?.location : undefined) ??
        MetaMetricsSwapsEventSource.MainView,
      ...(eventProperties ?? {}),
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
    if (!txMetaId) {
      trackMetricsEvent({
        messenger: this.messenger,
        eventName,
        properties: baseProperties,
      });
      return;
    }

    const historyItem: BridgeHistoryItem | undefined =
      this.state.txHistory[txMetaId];

    if (!historyItem) {
      trackMetricsEvent({
        messenger: this.messenger,
        eventName,
        properties: baseProperties,
      });
      return;
    }

    const { featureId, approvalTxId, quote } = historyItem;
    const requestParamProperties = getRequestParamFromHistory(historyItem);
    // Always publish StatusValidationFailed event, regardless of featureId
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

    // Skip tracking all other events when featureId is set (i.e. PERPS)
    if (featureId) {
      return;
    }

    const selectedAccount = getAccountByAddress(
      this.messenger,
      historyItem.account,
    );

    const transactions = getTransactions(this.messenger);
    const txMeta = transactions.find(
      (tx: TransactionMeta) => tx.id === txMetaId,
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
    };

    trackMetricsEvent({
      messenger: this.messenger,
      eventName,
      properties: requiredEventProperties,
    });
  };
}
