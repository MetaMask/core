import type { AccountsControllerState } from '@metamask/accounts-controller';
import type { StateMetadata } from '@metamask/base-controller';
import type {
  QuoteMetadata,
  RequiredEventContextFromClient,
  TxData,
  QuoteResponse,
  Intent,
} from '@metamask/bridge-controller';
import {
  formatChainIdToHex,
  isSolanaChainId,
  StatusTypes,
  UnifiedSwapBridgeEventName,
  formatChainIdToCaip,
  isCrossChain,
  isHardwareWallet,
  MetricsActionType,
} from '@metamask/bridge-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import { toHex } from '@metamask/controller-utils';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type {
  TransactionController,
  TransactionParams,
} from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
  type TransactionMeta,
} from '@metamask/transaction-controller';
import { numberToHex, type Hex } from '@metamask/utils';

import {
  BRIDGE_PROD_API_BASE_URL,
  BRIDGE_STATUS_CONTROLLER_NAME,
  DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE,
  MAX_ATTEMPTS,
  REFRESH_INTERVAL_MS,
  TraceName,
} from './constants';
import type {
  BridgeStatusControllerState,
  StartPollingForBridgeTxStatusArgsSerialized,
  FetchFunction,
  SolanaTransactionMeta,
  BridgeHistoryItem,
} from './types';
import { type BridgeStatusControllerMessenger } from './types';
import { BridgeClientId } from './types';
import {
  fetchBridgeTxStatus,
  getStatusRequestWithSrcTxHash,
  shouldSkipFetchDueToFetchFailures,
} from './utils/bridge-status';
import { getTxGasEstimates } from './utils/gas';
import {
  getFinalizedTxProperties,
  getPriceImpactFromQuote,
  getRequestMetadataFromHistory,
  getRequestParamFromHistory,
  getTradeDataFromHistory,
  getEVMTxPropertiesFromTransactionMeta,
  getTxStatusesFromHistory,
  getPreConfirmationPropertiesFromQuote,
} from './utils/metrics';
import {
  findAndUpdateTransactionsInBatch,
  getAddTransactionBatchParams,
  getClientRequest,
  getStatusRequestParams,
  getUSDTAllowanceResetTx,
  handleLineaDelay,
  handleMobileHardwareWalletDelay,
  handleSolanaTxResponse,
} from './utils/transaction';
import { generateActionId } from './utils/transaction';

// CoW intent: API base and network path mapping (adjust as needed)
const COW_API_BASE = 'https://api.cow.fi';
const COW_NETWORK_PATHS: Record<number, string> = {
  // Ethereum Mainnet
  1: 'mainnet',
  // Arbitrum One
  42161: 'arbitrum_one',
  // Base
  8453: 'base',
  // Avalanche C-Chain
  43114: 'avalanche',
  // Polygon PoS
  137: 'polygon',
};

const metadata: StateMetadata<BridgeStatusControllerState> = {
  // We want to persist the bridge status state so that we can show the proper data for the Activity list
  // basically match the behavior of TransactionController
  txHistory: {
    persist: true,
    anonymous: false,
  },
};

/** The input to start polling for the {@link BridgeStatusController} */
type BridgeStatusPollingInput = FetchBridgeTxStatusArgs;

type SrcTxMetaId = string;
export type FetchBridgeTxStatusArgs = {
  bridgeTxMetaId: string;
};
export class BridgeStatusController extends StaticIntervalPollingController<BridgeStatusPollingInput>()<
  typeof BRIDGE_STATUS_CONTROLLER_NAME,
  BridgeStatusControllerState,
  BridgeStatusControllerMessenger
> {
  #pollingTokensByTxMetaId: Record<SrcTxMetaId, string> = {};

  readonly #clientId: BridgeClientId;

  readonly #fetchFn: FetchFunction;

  readonly #config: {
    customBridgeApiBaseUrl: string;
  };

  readonly #addTransactionFn: typeof TransactionController.prototype.addTransaction;

  readonly #addTransactionBatchFn: typeof TransactionController.prototype.addTransactionBatch;

  readonly #updateTransactionFn: typeof TransactionController.prototype.updateTransaction;

  readonly #estimateGasFeeFn: typeof TransactionController.prototype.estimateGasFee;

  readonly #trace: TraceCallback;

  constructor({
    messenger,
    state,
    clientId,
    fetchFn,
    addTransactionFn,
    addTransactionBatchFn,
    updateTransactionFn,
    estimateGasFeeFn,
    config,
    traceFn,
  }: {
    messenger: BridgeStatusControllerMessenger;
    state?: Partial<BridgeStatusControllerState>;
    clientId: BridgeClientId;
    fetchFn: FetchFunction;
    addTransactionFn: typeof TransactionController.prototype.addTransaction;
    addTransactionBatchFn: typeof TransactionController.prototype.addTransactionBatch;
    updateTransactionFn: typeof TransactionController.prototype.updateTransaction;
    estimateGasFeeFn: typeof TransactionController.prototype.estimateGasFee;
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
    this.#addTransactionFn = addTransactionFn;
    this.#addTransactionBatchFn = addTransactionBatchFn;
    this.#updateTransactionFn = updateTransactionFn;
    this.#estimateGasFeeFn = estimateGasFeeFn;
    this.#config = {
      customBridgeApiBaseUrl:
        config?.customBridgeApiBaseUrl ?? BRIDGE_PROD_API_BASE_URL,
    };
    this.#trace = traceFn ?? (((_request, fn) => fn?.()) as TraceCallback);

    // Register action handlers
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_STATUS_CONTROLLER_NAME}:startPollingForBridgeTxStatus`,
      this.startPollingForBridgeTxStatus.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_STATUS_CONTROLLER_NAME}:wipeBridgeStatus`,
      this.wipeBridgeStatus.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_STATUS_CONTROLLER_NAME}:resetState`,
      this.resetState.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_STATUS_CONTROLLER_NAME}:submitTx`,
      this.submitTx.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_STATUS_CONTROLLER_NAME}:submitIntent`,
      this.submitIntent.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_STATUS_CONTROLLER_NAME}:restartPollingForFailedAttempts`,
      this.restartPollingForFailedAttempts.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      `${BRIDGE_STATUS_CONTROLLER_NAME}:getBridgeHistoryItemByTxMetaId`,
      this.getBridgeHistoryItemByTxMetaId.bind(this),
    );

    // Set interval
    this.setIntervalLength(REFRESH_INTERVAL_MS);

    this.messagingSystem.subscribe(
      'TransactionController:transactionFailed',
      ({ transactionMeta }) => {
        const { type, status, id } = transactionMeta;

        // Skip intent transactions - they have their own tracking via CoW API
        // Skip intent transactions - they have their own tracking via CoW API
        if (
          (transactionMeta as { swapMetaData?: { isIntentTx?: boolean } })
            .swapMetaData?.isIntentTx
        ) {
          return;
        }

        if (
          type &&
          [
            TransactionType.bridge,
            TransactionType.swap,
            TransactionType.bridgeApproval,
            TransactionType.swapApproval,
          ].includes(type) &&
          [
            TransactionStatus.failed,
            TransactionStatus.dropped,
            TransactionStatus.rejected,
          ].includes(status)
        ) {
          // Mark tx as failed in txHistory
          this.#markTxAsFailed(transactionMeta);
          // Track failed event
          if (status !== TransactionStatus.rejected) {
            this.#trackUnifiedSwapBridgeEvent(
              UnifiedSwapBridgeEventName.Failed,
              id,
              getEVMTxPropertiesFromTransactionMeta(transactionMeta),
            );
          }
        }
      },
    );

    this.messagingSystem.subscribe(
      'TransactionController:transactionConfirmed',
      (transactionMeta) => {
        const { type, id, chainId } = transactionMeta;
        if (type === TransactionType.swap) {
          this.#trackUnifiedSwapBridgeEvent(
            UnifiedSwapBridgeEventName.Completed,
            id,
          );
        }
        if (type === TransactionType.bridge && !isSolanaChainId(chainId)) {
          this.#startPollingForTxId(id);
        }
      },
    );

    // If you close the extension, but keep the browser open, the polling continues
    // If you close the browser, the polling stops
    // Check for historyItems that do not have a status of complete and restart polling
    this.#restartPollingForIncompleteHistoryItems();
  }

  // Mark tx as failed in txHistory if either the approval or trade fails
  readonly #markTxAsFailed = ({ id }: TransactionMeta) => {
    const txHistoryKey = this.state.txHistory[id]
      ? id
      : Object.keys(this.state.txHistory).find(
          (key) => this.state.txHistory[key].approvalTxId === id,
        );
    if (!txHistoryKey) {
      return;
    }
    this.update((statusState) => {
      statusState.txHistory[txHistoryKey].status.status = StatusTypes.FAILED;
    });
  };

  resetState = () => {
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
  }) => {
    // Wipe all networks for this address
    if (ignoreNetwork) {
      this.update((state) => {
        state.txHistory = DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE.txHistory;
      });
    } else {
      const { selectedNetworkClientId } = this.messagingSystem.call(
        'NetworkController:getState',
      );
      const selectedNetworkClient = this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        selectedNetworkClientId,
      );
      const selectedChainId = selectedNetworkClient.configuration.chainId;

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
  }) => {
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

    // Reset the attempts counter
    this.update((state) => {
      if (targetTxMetaId) {
        state.txHistory[targetTxMetaId].attempts = undefined;
      }
    });

    // Restart polling if it was stopped and this is a bridge transaction
    const isBridgeTx = isCrossChain(
      historyItem.quote.srcChainId,
      historyItem.quote.destChainId,
    );

    if (isBridgeTx) {
      // Check if polling was stopped (no active polling token)
      const existingPollingToken =
        this.#pollingTokensByTxMetaId[targetTxMetaId];

      if (!existingPollingToken) {
        // Restart polling
        this.#startPollingForTxId(targetTxMetaId);
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
  readonly #restartPollingForIncompleteHistoryItems = () => {
    // Check for historyItems that do not have a status of complete and restart polling
    const { txHistory } = this.state;
    const historyItems = Object.values(txHistory);
    const incompleteHistoryItems = historyItems
      .filter(
        (historyItem) =>
          historyItem.status.status === StatusTypes.PENDING ||
          historyItem.status.status === StatusTypes.UNKNOWN,
      )
      .filter((historyItem) => {
        // Check if we are already polling this tx, if so, skip restarting polling for that
        const pollingToken =
          this.#pollingTokensByTxMetaId[historyItem.txMetaId];
        return !pollingToken;
      })
      // Swap txs don't need to have their statuses polled
      .filter((historyItem) => {
        const isBridgeTx = isCrossChain(
          historyItem.quote.srcChainId,
          historyItem.quote.destChainId,
        );
        return isBridgeTx;
      });

    incompleteHistoryItems.forEach((historyItem) => {
      const bridgeTxMetaId = historyItem.txMetaId;
      const shouldSkipFetch = shouldSkipFetchDueToFetchFailures(
        historyItem.attempts,
      );
      if (shouldSkipFetch) {
        return;
      }

      // We manually call startPolling() here rather than go through startPollingForBridgeTxStatus()
      // because we don't want to overwrite the existing historyItem in state
      this.#startPollingForTxId(bridgeTxMetaId);
    });
  };

  readonly #addTxToHistory = (
    startPollingForBridgeTxStatusArgs: StartPollingForBridgeTxStatusArgsSerialized,
  ) => {
    const {
      bridgeTxMeta,
      statusRequest,
      quoteResponse,
      startTime,
      slippagePercentage,
      initialDestAssetBalance,
      targetContractAddress,
      approvalTxId,
      isStxEnabled,
      accountAddress: selectedAddress,
    } = startPollingForBridgeTxStatusArgs;

    // Write all non-status fields to state so we can reference the quote in Activity list without the Bridge API
    // We know it's in progress but not the exact status yet
    const txHistoryItem = {
      txMetaId: bridgeTxMeta.id,

      originalTransactionId:
        (bridgeTxMeta as unknown as { originalTransactionId: string })
          .originalTransactionId || bridgeTxMeta.id, // Keep original for intent transactions
      batchId: bridgeTxMeta.batchId,
      quote: quoteResponse.quote,
      startTime,
      estimatedProcessingTimeInSeconds:
        quoteResponse.estimatedProcessingTimeInSeconds,
      slippagePercentage,
      pricingData: {
        amountSent: quoteResponse.sentAmount.amount,
        amountSentInUsd: quoteResponse.sentAmount.usd ?? undefined,
        quotedGasInUsd: quoteResponse.gasFee.effective?.usd ?? undefined,
        quotedReturnInUsd: quoteResponse.toTokenAmount.usd ?? undefined,
        quotedGasAmount: quoteResponse.gasFee.effective?.amount ?? undefined,
      },
      initialDestAssetBalance,
      targetContractAddress,
      account: selectedAddress,
      status: {
        // We always have a PENDING status when we start polling for a tx, don't need the Bridge API for that
        // Also we know the bare minimum fields for status at this point in time
        status: StatusTypes.PENDING,
        srcChain: {
          chainId: statusRequest.srcChainId,
          txHash: statusRequest.srcTxHash,
        },
      },
      hasApprovalTx: Boolean(quoteResponse.approval),
      approvalTxId,
      isStxEnabled: isStxEnabled ?? false,
    };
    this.update((state) => {
      // Use the txMeta.id as the key so we can reference the txMeta in TransactionController
      state.txHistory[bridgeTxMeta.id] = txHistoryItem;
    });
  };

  readonly #startPollingForTxId = (txId: string) => {
    // If we are already polling for this tx, stop polling for it before restarting
    const existingPollingToken = this.#pollingTokensByTxMetaId[txId];
    if (existingPollingToken) {
      this.stopPollingByPollingToken(existingPollingToken);
    }

    const txHistoryItem = this.state.txHistory[txId];
    if (!txHistoryItem) {
      return;
    }
    const { quote } = txHistoryItem;
    const isIntent = txId.startsWith('intent:');
    const isBridgeTx = isCrossChain(quote.srcChainId, quote.destChainId);
    if (isBridgeTx || isIntent) {
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
  ) => {
    const { bridgeTxMeta } = txHistoryMeta;

    this.#addTxToHistory(txHistoryMeta);
    this.#startPollingForTxId(bridgeTxMeta.id);
  };

  // This will be called after you call this.startPolling()
  // The args passed in are the args you passed in to startPolling()
  _executePoll = async (pollingInput: BridgeStatusPollingInput) => {
    await this.#fetchBridgeTxStatus(pollingInput);
  };

  #getMultichainSelectedAccount() {
    return this.messagingSystem.call(
      'AccountsController:getSelectedMultichainAccount',
    );
  }

  /**
   * Handles the failure to fetch the bridge tx status
   * We eventually stop polling for the tx if we fail too many times
   * Failures (500 errors) can be due to:
   * - The srcTxHash not being available immediately for STX
   * - The srcTxHash being invalid for the chain. This case will never resolve so we stop polling for it to avoid hammering the Bridge API forever.
   *
   * @param bridgeTxMetaId - The txMetaId of the bridge tx
   */
  readonly #handleFetchFailure = (bridgeTxMetaId: string) => {
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
    }

    // Update the attempts counter
    this.update((state) => {
      state.txHistory[bridgeTxMetaId].attempts = newAttempts;
    });
  };

  readonly #fetchBridgeTxStatus = async ({
    bridgeTxMetaId,
  }: FetchBridgeTxStatusArgs) => {
    const { txHistory } = this.state;

    // Intent-based items: poll CoW API instead of Bridge API
    if (bridgeTxMetaId.startsWith('intent:')) {
      await this.#fetchCowOrderStatus({ bridgeTxMetaId });
      return;
    }

    if (
      shouldSkipFetchDueToFetchFailures(txHistory[bridgeTxMetaId]?.attempts)
    ) {
      return;
    }

    try {
      // We try here because we receive 500 errors from Bridge API if we try to fetch immediately after submitting the source tx
      // Oddly mostly happens on Optimism, never on Arbitrum. By the 2nd fetch, the Bridge API responds properly.
      // Also srcTxHash may not be available immediately for STX, so we don't want to fetch in those cases
      const historyItem = txHistory[bridgeTxMetaId];
      const srcTxHash = this.#getSrcTxHash(bridgeTxMetaId);
      if (!srcTxHash) {
        return;
      }

      this.#updateSrcTxHash(bridgeTxMetaId, srcTxHash);

      const statusRequest = getStatusRequestWithSrcTxHash(
        historyItem.quote,
        srcTxHash,
      );
      const { status, validationFailures } = await fetchBridgeTxStatus(
        statusRequest,
        this.#clientId,
        this.#fetchFn,
        this.#config.customBridgeApiBaseUrl,
      );

      if (validationFailures.length > 0) {
        this.#trackUnifiedSwapBridgeEvent(
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

      const pollingToken = this.#pollingTokensByTxMetaId[bridgeTxMetaId];

      const isFinalStatus =
        status.status === StatusTypes.COMPLETE ||
        status.status === StatusTypes.FAILED;

      if (isFinalStatus && pollingToken) {
        this.stopPollingByPollingToken(pollingToken);
        delete this.#pollingTokensByTxMetaId[bridgeTxMetaId];

        if (status.status === StatusTypes.COMPLETE) {
          this.#trackUnifiedSwapBridgeEvent(
            UnifiedSwapBridgeEventName.Completed,
            bridgeTxMetaId,
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
    }
  };

  readonly #fetchCowOrderStatus = async ({
    bridgeTxMetaId,
  }: FetchBridgeTxStatusArgs) => {
    const { txHistory } = this.state;
    const historyItem = txHistory[bridgeTxMetaId];
    if (!historyItem) {
      return;
    }

    // Backoff handling
    if (shouldSkipFetchDueToFetchFailures(historyItem.attempts)) {
      return;
    }

    const orderUid = bridgeTxMetaId.replace(/^intent:/u, '');
    const { srcChainId } = historyItem.quote;
    const networkPath = COW_NETWORK_PATHS[srcChainId];
    if (!networkPath) {
      // Unsupported mapping: stop polling with failure
      this.update((state) => {
        state.txHistory[bridgeTxMetaId].status = {
          status: StatusTypes.FAILED,
          srcChain: {
            chainId: srcChainId,
            txHash: '',
          },
        } as unknown as (typeof state.txHistory)[string]['status'];
      });
      return;
    }

    try {
      const url = `${COW_API_BASE}/${networkPath}/api/v1/orders/${orderUid}`;
      const res = await this.#fetchFn(url, { method: 'GET' });

      // CoW API status enum mapping
      const rawStatus =
        typeof res === 'object' && res !== null && 'status' in res
          ? ((res as { status?: string }).status ?? '')
          : '';
      const isComplete = rawStatus === 'fulfilled';
      const isFailed = ['cancelled', 'expired'].includes(rawStatus);
      const isPending = ['presignaturePending', 'open'].includes(rawStatus);

      // Try to find a tx hash in common fields
      let txHash = '';
      let allHashes: string[] = [];

      if (isComplete) {
        // Prefer authoritative trades endpoint for one or multiple fills
        const tradesUrl = `${COW_API_BASE}/${networkPath}/api/v1/trades?orderUid=${orderUid}`;
        const trades =
          (await this.#fetchFn(tradesUrl, { method: 'GET' })) ?? [];
        allHashes = Array.isArray(trades)
          ? trades
              .map(
                (t: { txHash?: unknown; transactionHash?: unknown }) =>
                  t?.txHash || t?.transactionHash,
              )
              .filter(
                (h: unknown): h is string =>
                  typeof h === 'string' && h.length > 0,
              )
          : [];
        // Fallback to any hash on order if trades missing
        if (allHashes.length === 0) {
          const possible = [
            (res as { txHash?: string }).txHash,
            (res as { transactionHash?: string }).transactionHash,
            (res as { executedTransaction?: string }).executedTransaction,
            (res as { executedTransactionHash?: string })
              .executedTransactionHash,
          ].filter(
            (h: unknown): h is string => typeof h === 'string' && h.length > 0,
          );
          allHashes = possible;
        }
        txHash = allHashes[allHashes.length - 1] || '';
      }

      let statusType: StatusTypes;
      if (isComplete) {
        statusType = StatusTypes.COMPLETE;
      } else if (isFailed) {
        statusType = StatusTypes.FAILED;
      } else if (isPending) {
        statusType = StatusTypes.PENDING;
      } else {
        statusType = StatusTypes.PENDING; // Default to pending for unknown statuses
      }

      const newStatus = {
        status: statusType,
        srcChain: {
          chainId: srcChainId,
          txHash: txHash || historyItem.status.srcChain.txHash || '',
        },
      } as typeof historyItem.status;

      const newBridgeHistoryItem = {
        ...historyItem,
        status: newStatus,
        completionTime:
          newStatus.status === StatusTypes.COMPLETE ||
          newStatus.status === StatusTypes.FAILED
            ? Date.now()
            : undefined,
        attempts: undefined,
        srcTxHashes:
          allHashes.length > 0
            ? Array.from(
                new Set([...(historyItem.srcTxHashes ?? []), ...allHashes]),
              )
            : historyItem.srcTxHashes,
      };

      this.update((state) => {
        state.txHistory[bridgeTxMetaId] = newBridgeHistoryItem;
      });

      // Update the actual transaction in TransactionController to sync with CoW status
      // Use the original transaction ID (not the intent: prefixed bridge history key)
      const originalTxId =
        (historyItem as unknown as { originalTransactionId: string })
          .originalTransactionId || historyItem.txMetaId;
      if (originalTxId && !originalTxId.startsWith('intent:')) {
        try {
          let transactionStatus: TransactionStatus;
          if (isComplete) {
            transactionStatus = TransactionStatus.confirmed;
          } else if (isFailed) {
            transactionStatus = TransactionStatus.failed;
          } else if (isPending) {
            transactionStatus = TransactionStatus.submitted;
          } else {
            transactionStatus = TransactionStatus.submitted; // Default to submitted for unknown statuses
          }

          // Merge with existing TransactionMeta to avoid wiping required fields
          const { transactions } = this.messagingSystem.call(
            'TransactionController:getState',
          );
          const existingTxMeta = (transactions as TransactionMeta[]).find(
            (t) => t.id === originalTxId,
          );

          if (!existingTxMeta) {
            console.warn(
              '📝 [fetchCowOrderStatus] Skipping update; transaction not found',
              { originalTxId, bridgeHistoryKey: bridgeTxMetaId },
            );
          } else {
            const updatedTxMeta: TransactionMeta = {
              ...existingTxMeta,
              status: transactionStatus,
              ...(txHash ? { hash: txHash } : {}),
              ...(txHash
                ? ({
                    txReceipt: {
                      ...(
                        existingTxMeta as unknown as {
                          txReceipt: Record<string, unknown>;
                        }
                      ).txReceipt,
                      transactionHash: txHash,
                      status: (isComplete ? '0x1' : '0x0') as unknown as string,
                    },
                  } as Partial<TransactionMeta>)
                : {}),
            } as TransactionMeta;

            this.#updateTransactionFn(
              updatedTxMeta,
              `BridgeStatusController - CoW order status updated: ${rawStatus}`,
            );
          }
        } catch (error) {
          console.error(
            '📝 [fetchCowOrderStatus] Failed to update transaction status',
            {
              originalTxId,
              bridgeHistoryKey: bridgeTxMetaId,
              error,
            },
          );
        }
      }

      const pollingToken = this.#pollingTokensByTxMetaId[bridgeTxMetaId];
      const isFinal =
        newStatus.status === StatusTypes.COMPLETE ||
        newStatus.status === StatusTypes.FAILED;
      if (isFinal && pollingToken) {
        this.stopPollingByPollingToken(pollingToken);
        delete this.#pollingTokensByTxMetaId[bridgeTxMetaId];

        if (newStatus.status === StatusTypes.COMPLETE) {
          this.#trackUnifiedSwapBridgeEvent(
            UnifiedSwapBridgeEventName.Completed,
            bridgeTxMetaId,
          );
        } else if (newStatus.status === StatusTypes.FAILED) {
          this.#trackUnifiedSwapBridgeEvent(
            UnifiedSwapBridgeEventName.Failed,
            bridgeTxMetaId,
          );
        }
      }
    } catch {
      // Network or API error: apply backoff
      this.#handleFetchFailure(bridgeTxMetaId);
    }
  };

  readonly #getSrcTxHash = (bridgeTxMetaId: string): string | undefined => {
    const { txHistory } = this.state;
    // Prefer the srcTxHash from bridgeStatusState so we don't have to l ook up in TransactionController
    // But it is possible to have bridgeHistoryItem in state without the srcTxHash yet when it is an STX
    const srcTxHash = txHistory[bridgeTxMetaId].status.srcChain.txHash;

    if (srcTxHash) {
      return srcTxHash;
    }

    // Look up in TransactionController if txMeta has been updated with the srcTxHash
    const txControllerState = this.messagingSystem.call(
      'TransactionController:getState',
    );
    const txMeta = txControllerState.transactions.find(
      (tx: TransactionMeta) => tx.id === bridgeTxMetaId,
    );
    return txMeta?.hash;
  };

  readonly #updateSrcTxHash = (bridgeTxMetaId: string, srcTxHash: string) => {
    const { txHistory } = this.state;
    if (txHistory[bridgeTxMetaId].status.srcChain.txHash) {
      return;
    }

    this.update((state) => {
      state.txHistory[bridgeTxMetaId].status.srcChain.txHash = srcTxHash;
    });
  };

  // Wipes the bridge status for the given address and chainId
  // Will match only source chainId to the selectedChainId
  readonly #wipeBridgeStatusByChainId = (
    address: string,
    selectedChainId: Hex,
  ) => {
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

  /**
   * Submits the transaction to the snap using the keyring rpc method
   * This adds an approval tx to the ApprovalsController in the background
   * The client needs to handle the approval tx by redirecting to the confirmation page with the approvalTxId in the URL
   *
   * @param quoteResponse - The quote response
   * @param quoteResponse.quote - The quote
   * @param selectedAccount - The account to submit the transaction for
   * @returns The transaction meta
   */
  readonly #handleSolanaTx = async (
    quoteResponse: QuoteResponse<string> & QuoteMetadata,
    selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string],
  ) => {
    if (!selectedAccount.metadata?.snap?.id) {
      throw new Error(
        'Failed to submit cross-chain swap transaction: undefined snap id',
      );
    }

    const request = getClientRequest(quoteResponse, selectedAccount);
    const requestResponse = (await this.messagingSystem.call(
      'SnapController:handleRequest',
      request,
    )) as string | { result: Record<string, string> } | { signature: string };

    // The extension client actually redirects before it can do anytyhing with this meta
    const txMeta = handleSolanaTxResponse(
      requestResponse,
      quoteResponse,
      selectedAccount,
    );

    // TODO remove this eventually, just returning it now to match extension behavior
    // OR if the snap can propagate the snapRequestId or keyringReqId to the ApprovalsController, this can return the approvalTxId instead and clients won't need to subscribe to the ApprovalsController state to redirect
    return txMeta;
  };

  readonly #waitForHashAndReturnFinalTxMeta = async (
    hashPromise?: Awaited<
      ReturnType<TransactionController['addTransaction']>
    >['result'],
  ): Promise<TransactionMeta> => {
    const transactionHash = await hashPromise;
    const finalTransactionMeta: TransactionMeta | undefined =
      this.messagingSystem
        .call('TransactionController:getState')
        .transactions.find(
          (tx: TransactionMeta) => tx.hash === transactionHash,
        );
    if (!finalTransactionMeta) {
      throw new Error(
        'Failed to submit cross-chain swap tx: txMeta for txHash was not found',
      );
    }
    return finalTransactionMeta;
  };

  // Waits until a given transaction (by id) reaches confirmed/finalized status or fails/times out.
  readonly #waitForTxConfirmation = async (
    txId: string,
    {
      timeoutMs = 5 * 60_000, // 5 minutes default
      pollMs = 2_000,
    }: { timeoutMs?: number; pollMs?: number } = {},
  ): Promise<TransactionMeta> => {
    const start = Date.now();
    // Poll the TransactionController state for status changes
    // We intentionally keep this simple to avoid extra wiring/subscriptions in this controller
    // and because we only need it for the rare intent+approval path.
    while (true) {
      const { transactions } = this.messagingSystem.call(
        'TransactionController:getState',
      );
      const meta = transactions.find((t: TransactionMeta) => t.id === txId);

      if (meta) {
        // Treat both 'confirmed' and 'finalized' as success to match TC lifecycle
        if (
          meta.status === TransactionStatus.confirmed ||
          // Some environments move directly to finalized
          (TransactionStatus as unknown as { finalized: string }).finalized ===
            meta.status
        ) {
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

  readonly #handleApprovalTx = async (
    isBridgeTx: boolean,
    quoteResponse: QuoteResponse<string | TxData> & QuoteMetadata,
    requireApproval?: boolean,
  ): Promise<TransactionMeta | undefined> => {
    const { approval } = quoteResponse;

    if (approval) {
      const approveTx = async () => {
        await this.#handleUSDTAllowanceReset(quoteResponse);

        const approvalTxMeta = await this.#handleEvmTransaction({
          transactionType: isBridgeTx
            ? TransactionType.bridgeApproval
            : TransactionType.swapApproval,
          trade: approval,
          requireApproval,
        });

        await handleLineaDelay(quoteResponse);
        return approvalTxMeta;
      };

      return await this.#trace(
        {
          name: isBridgeTx
            ? TraceName.BridgeTransactionApprovalCompleted
            : TraceName.SwapTransactionApprovalCompleted,
          data: {
            srcChainId: formatChainIdToCaip(quoteResponse.quote.srcChainId),
            stxEnabled: false,
          },
        },
        approveTx,
      );
    }

    return undefined;
  };

  /**
   * Submits an EVM transaction to the TransactionController
   *
   * @param params - The parameters for the transaction
   * @param params.transactionType - The type of transaction to submit
   * @param params.trade - The trade data to confirm
   * @param params.requireApproval - Whether to require approval for the transaction
   * @returns The transaction meta
   */
  readonly #handleEvmTransaction = async ({
    transactionType,
    trade,
    requireApproval = false,
  }: {
    transactionType: TransactionType;
    trade: TxData;
    requireApproval?: boolean;
  }): Promise<TransactionMeta> => {
    const actionId = generateActionId().toString();

    const selectedAccount = this.messagingSystem.call(
      'AccountsController:getAccountByAddress',
      trade.from,
    );
    if (!selectedAccount) {
      throw new Error(
        'Failed to submit cross-chain swap transaction: unknown account in trade data',
      );
    }
    const hexChainId = formatChainIdToHex(trade.chainId);
    const networkClientId = this.messagingSystem.call(
      'NetworkController:findNetworkClientIdByChainId',
      hexChainId,
    );

    const requestOptions = {
      actionId,
      networkClientId,
      requireApproval,
      type: transactionType,
      origin: 'metamask',
    };
    // Exclude gasLimit from trade to avoid type issues (it can be null)
    const { gasLimit: tradeGasLimit, ...tradeWithoutGasLimit } = trade;

    const transactionParams: Parameters<
      TransactionController['addTransaction']
    >[0] = {
      ...tradeWithoutGasLimit,
      chainId: hexChainId,
      // Only add gasLimit and gas if they're valid (not undefined/null/zero)
      ...(tradeGasLimit &&
        tradeGasLimit !== 0 && {
          gasLimit: tradeGasLimit.toString(),
          gas: tradeGasLimit.toString(),
        }),
    };
    const transactionParamsWithMaxGas: TransactionParams = {
      ...transactionParams,
      ...(await this.#calculateGasFees(
        transactionParams,
        networkClientId,
        hexChainId,
      )),
    };

    const { result } = await this.#addTransactionFn(
      transactionParamsWithMaxGas,
      requestOptions,
    );

    return await this.#waitForHashAndReturnFinalTxMeta(result);
  };

  readonly #handleUSDTAllowanceReset = async (
    quoteResponse: QuoteResponse<TxData | string> & QuoteMetadata,
  ) => {
    const resetApproval = await getUSDTAllowanceResetTx(
      this.messagingSystem,
      quoteResponse,
    );
    if (resetApproval) {
      await this.#handleEvmTransaction({
        transactionType: TransactionType.bridgeApproval,
        trade: resetApproval,
      });
    }
  };

  readonly #calculateGasFees = async (
    transactionParams: TransactionParams,
    networkClientId: string,
    chainId: Hex,
  ) => {
    const { gasFeeEstimates } = this.messagingSystem.call(
      'GasFeeController:getState',
    );
    const { estimates: txGasFeeEstimates } = await this.#estimateGasFeeFn({
      transactionParams,
      chainId,
      networkClientId,
    });
    const { maxFeePerGas, maxPriorityFeePerGas } = getTxGasEstimates({
      networkGasFeeEstimates: gasFeeEstimates,
      txGasFeeEstimates,
    });

    // Let the TransactionController handle gas limit estimation when no gas is provided
    // This fixes the issue where approval transactions had zero gas
    const maxGasLimit = transactionParams.gas
      ? toHex(transactionParams.gas)
      : undefined;

    return {
      maxFeePerGas,
      maxPriorityFeePerGas,
      gas: maxGasLimit,
    };
  };

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
      'messagingSystem' | 'estimateGasFeeFn'
    >,
  ) => {
    const transactionParams = await getAddTransactionBatchParams({
      messagingSystem: this.messagingSystem,
      estimateGasFeeFn: this.#estimateGasFeeFn,
      ...args,
    });
    const txDataByType = {
      [TransactionType.bridgeApproval]: transactionParams.transactions.find(
        ({ type }) => type === TransactionType.bridgeApproval,
      )?.params.data,
      [TransactionType.swapApproval]: transactionParams.transactions.find(
        ({ type }) => type === TransactionType.swapApproval,
      )?.params.data,
      [TransactionType.bridge]: transactionParams.transactions.find(
        ({ type }) => type === TransactionType.bridge,
      )?.params.data,
      [TransactionType.swap]: transactionParams.transactions.find(
        ({ type }) => type === TransactionType.swap,
      )?.params.data,
    };

    const { batchId } = await this.#addTransactionBatchFn(transactionParams);

    const { approvalMeta, tradeMeta } = findAndUpdateTransactionsInBatch({
      messagingSystem: this.messagingSystem,
      updateTransactionFn: this.#updateTransactionFn,
      batchId,
      txDataByType,
    });

    if (!tradeMeta) {
      throw new Error(
        'Failed to update cross-chain swap transaction batch: tradeMeta not found',
      );
    }

    return { approvalMeta, tradeMeta };
  };

  /**
   * Submits a cross-chain swap transaction
   *
   * @param quoteResponse - The quote response
   * @param isStxEnabledOnClient - Whether smart transactions are enabled on the client, for example the getSmartTransactionsEnabled selector value from the extension
   * @returns The transaction meta
   */
  submitTx = async (
    quoteResponse: QuoteResponse<TxData | string> & QuoteMetadata,
    isStxEnabledOnClient: boolean,
  ): Promise<TransactionMeta & Partial<SolanaTransactionMeta>> => {
    this.messagingSystem.call('BridgeController:stopPollingForQuotes');

    const selectedAccount = this.#getMultichainSelectedAccount();
    if (!selectedAccount) {
      throw new Error(
        'Failed to submit cross-chain swap transaction: undefined multichain account',
      );
    }
    const isHardwareAccount = isHardwareWallet(selectedAccount);

    const preConfirmationProperties = getPreConfirmationPropertiesFromQuote(
      quoteResponse,
      isStxEnabledOnClient,
      isHardwareAccount,
    );
    // Emit Submitted event after submit button is clicked
    this.#trackUnifiedSwapBridgeEvent(
      UnifiedSwapBridgeEventName.Submitted,
      undefined,
      preConfirmationProperties,
    );

    let txMeta: TransactionMeta & Partial<SolanaTransactionMeta>;
    let approvalTxId: string | undefined;
    const startTime = Date.now();

    const isBridgeTx = isCrossChain(
      quoteResponse.quote.srcChainId,
      quoteResponse.quote.destChainId,
    );

    // Submit SOLANA tx
    if (
      isSolanaChainId(quoteResponse.quote.srcChainId) &&
      typeof quoteResponse.trade === 'string'
    ) {
      txMeta = await this.#trace(
        {
          name: isBridgeTx
            ? TraceName.BridgeTransactionCompleted
            : TraceName.SwapTransactionCompleted,
          data: {
            srcChainId: formatChainIdToCaip(quoteResponse.quote.srcChainId),
            stxEnabled: false,
          },
        },
        async () => {
          try {
            return await this.#handleSolanaTx(
              quoteResponse as QuoteResponse<string> & QuoteMetadata,
              selectedAccount,
            );
          } catch (error) {
            this.#trackUnifiedSwapBridgeEvent(
              UnifiedSwapBridgeEventName.Failed,
              txMeta?.id,
              {
                error_message: (error as Error)?.message,
                ...preConfirmationProperties,
              },
            );
            throw error;
          }
        },
      );
    } else {
      // Submit EVM tx
      // For hardware wallets on Mobile, this is fixes an issue where the Ledger does not get prompted for the 2nd approval
      // Extension does not have this issue
      const requireApproval =
        this.#clientId === BridgeClientId.MOBILE && isHardwareAccount;

      // Handle smart transactions if enabled
      txMeta = await this.#trace(
        {
          name: isBridgeTx
            ? TraceName.BridgeTransactionCompleted
            : TraceName.SwapTransactionCompleted,
          data: {
            srcChainId: formatChainIdToCaip(quoteResponse.quote.srcChainId),
            stxEnabled: isStxEnabledOnClient,
          },
        },
        async () => {
          if (isStxEnabledOnClient || quoteResponse.quote.gasIncluded7702) {
            const { tradeMeta, approvalMeta } =
              await this.#handleEvmTransactionBatch({
                isBridgeTx,
                resetApproval: await getUSDTAllowanceResetTx(
                  this.messagingSystem,
                  quoteResponse,
                ),
                approval: quoteResponse.approval,
                trade: quoteResponse.trade as TxData,
                quoteResponse,
                requireApproval,
              });

            approvalTxId = approvalMeta?.id;
            return tradeMeta;
          }
          // Set approval time and id if an approval tx is needed
          const approvalTxMeta = await this.#handleApprovalTx(
            isBridgeTx,
            quoteResponse,
            requireApproval,
          );

          approvalTxId = approvalTxMeta?.id;

          await handleMobileHardwareWalletDelay(requireApproval);

          return await this.#handleEvmTransaction({
            transactionType: isBridgeTx
              ? TransactionType.bridge
              : TransactionType.swap,
            trade: quoteResponse.trade as TxData,
            requireApproval,
          });
        },
      );
    }

    try {
      // Add swap or bridge tx to history
      this.#addTxToHistory({
        accountAddress: selectedAccount.address,
        bridgeTxMeta: txMeta, // Only the id field is used by the BridgeStatusController
        statusRequest: {
          ...getStatusRequestParams(quoteResponse),
          srcTxHash: txMeta.hash,
        },
        quoteResponse,
        slippagePercentage: 0, // TODO include slippage provided by quote if using dynamic slippage, or slippage from quote request
        isStxEnabled: isStxEnabledOnClient,
        startTime,
        approvalTxId,
      });

      if (isSolanaChainId(quoteResponse.quote.srcChainId)) {
        // Start polling for bridge tx status
        this.#startPollingForTxId(txMeta.id);
        // Track Solana Swap completed event
        if (!isBridgeTx) {
          this.#trackUnifiedSwapBridgeEvent(
            UnifiedSwapBridgeEventName.Completed,
            txMeta.id,
          );
        }
      }
    } catch {
      // Ignore errors here, we don't want to crash the app if this fails and tx submission succeeds
    }
    return txMeta;
  };

  /**
   * UI-signed intent submission (fast path): the UI generates the EIP-712 signature and calls this with the raw signature.
   * Here we POST the order to the intent backend (e.g., CoW) and create a synthetic history entry for UX.
   *
   * @param params - Object containing intent submission parameters
   * @param params.quoteResponse - Quote carrying intent data
   * @param params.signature - Hex signature produced by eth_signTypedData_v4
   * @param params.accountAddress - The EOA submitting the order
   * @returns A lightweight TransactionMeta-like object for history linking
   */
  submitIntent = async (params: {
    quoteResponse: QuoteResponse<TxData | string> & QuoteMetadata;
    signature: string;
    accountAddress: string;
  }): Promise<Pick<TransactionMeta, 'id' | 'chainId' | 'type' | 'status'>> => {
    const { quoteResponse, signature, accountAddress } = params;

    // Build pre-confirmation properties for error tracking parity with submitTx
    const account = this.messagingSystem.call(
      'AccountsController:getAccountByAddress',
      accountAddress,
    );
    const isHardwareAccount = Boolean(account) && isHardwareWallet(account);
    const preConfirmationProperties = getPreConfirmationPropertiesFromQuote(
      quoteResponse,
      false,
      isHardwareAccount,
    );

    try {
      const { intent } = (quoteResponse as QuoteResponse & { intent?: Intent })
        .quote;
      if (!intent || intent.protocol !== 'cowswap') {
        throw new Error('submitIntent: missing or unsupported intent');
      }

      // If backend provided an approval tx for this intent quote, submit it first (on-chain),
      // then proceed with off-chain intent submission.
      let approvalTxId: string | undefined;
      if (quoteResponse.approval) {
        const isBridgeTx = isCrossChain(
          quoteResponse.quote.srcChainId,
          quoteResponse.quote.destChainId,
        );

        // Handle approval silently for better UX in intent flows
        const approvalTxMeta = await this.#handleApprovalTx(
          isBridgeTx,
          quoteResponse,
          /* requireApproval */ false,
        );
        approvalTxId = approvalTxMeta?.id;

        // Optionally wait for approval confirmation with timeout and graceful fallback
        // CoW order can be created before allowance is mined, but waiting helps avoid MEV issues
        if (approvalTxId) {
          try {
            // Wait with a shorter timeout and continue if it fails
            await this.#waitForTxConfirmation(approvalTxId, {
              timeoutMs: 30_000, // 30 seconds instead of 5 minutes
              pollMs: 3_000, // Poll less frequently to avoid rate limits
            });
          } catch (error) {
            // Log but don't throw - continue with CoW order submission
            console.warn(
              'Approval confirmation failed, continuing with intent submission:',
              error,
            );
          }
        }
      }

      // Map chainId to CoW API server path (prod)
      const chainId = quoteResponse.quote.srcChainId;
      const serverPath = COW_NETWORK_PATHS[chainId];
      if (!serverPath) {
        throw new Error(
          `submitIntent: unsupported chainId for CoW intents: ${chainId}`,
        );
      }

      // Build OrderCreation payload (simplified)
      const orderBody = {
        ...intent.order,
        feeAmount: '0',
        from: accountAddress,
        signature,
        signingScheme: 'eip712',
      } as Record<string, unknown>;

      // POST to CoW prod
      const url = `https://api.cow.fi/${serverPath}/api/v1/orders`;
      const res = await this.#fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderBody),
      });

      const orderUid: string | undefined =
        typeof res === 'string'
          ? res
          : ((res as { uid?: string; orderUid?: string; id?: string })?.uid ??
            (res as { uid?: string; orderUid?: string; id?: string })
              ?.orderUid ??
            (res as { uid?: string; orderUid?: string; id?: string })?.id);
      if (!orderUid) {
        throw new Error('submitIntent: failed to submit order');
      }

      // Get initial order status from CoW API
      let initialOrderStatus = 'open'; // Default status
      try {
        const orderStatusUrl = `${COW_API_BASE}/${serverPath}/api/v1/orders/${orderUid}`;
        const orderStatusRes = await this.#fetchFn(orderStatusUrl, {
          method: 'GET',
        });
        initialOrderStatus =
          (orderStatusRes as { status?: string })?.status ?? 'open';
      } catch (error) {
        console.warn(
          '📝 [submitIntent] Failed to get initial order status, using default:',
          error,
        );
      }

      // Determine transaction type: swap for same-chain, bridge for cross-chain
      const isCrossChainTx = isCrossChain(
        quoteResponse.quote.srcChainId,
        quoteResponse.quote.destChainId,
      );
      const transactionType = isCrossChainTx
        ? TransactionType.bridge
        : TransactionType.swap;

      // Create actual transaction in Transaction Controller first
      const networkClientId = this.messagingSystem.call(
        'NetworkController:findNetworkClientIdByChainId',
        formatChainIdToHex(chainId),
      );

      const intentTransactionParams = {
        chainId: formatChainIdToHex(chainId),
        from: accountAddress,
        to:
          intent.settlementContract ||
          '0x9008D19f58AAbd9eD0D60971565AA8510560ab41', // CoW settlement contract
        data: `0x${orderUid.slice(-8)}`, // Use last 8 chars of orderUid to make each transaction unique
        value: '0x0',
        gas: '0x5208', // Minimal gas for display purposes
        gasPrice: '0x3b9aca00', // 1 Gwei - will be converted to EIP-1559 fees if network supports it
      };

      const { transactionMeta: txMetaPromise } = await this.#addTransactionFn(
        intentTransactionParams,
        {
          origin: 'metamask',
          actionId: generateActionId(),
          requireApproval: false,
          networkClientId,
          type: transactionType,
          swaps: {
            meta: {
              // Add token symbols from quoteResponse for proper display
              sourceTokenSymbol: quoteResponse.quote.srcAsset.symbol,
              destinationTokenSymbol: quoteResponse.quote.destAsset.symbol,
              sourceTokenAmount: quoteResponse.quote.srcTokenAmount,
              destinationTokenAmount: quoteResponse.quote.destTokenAmount,
              sourceTokenDecimals: quoteResponse.quote.srcAsset.decimals,
              destinationTokenDecimals: quoteResponse.quote.destAsset.decimals,
              sourceTokenAddress: quoteResponse.quote.srcAsset.address,
              destinationTokenAddress: quoteResponse.quote.destAsset.address,
              swapTokenValue: quoteResponse.sentAmount.amount,
              approvalTxId,
              swapMetaData: {
                isIntentTx: true,
                orderUid,
                intentType: isCrossChainTx ? 'bridge' : 'swap',
              },
            },
          },
        },
      );

      const intentTxMeta = txMetaPromise;

      // Map initial CoW order status to TransactionController status
      const isComplete = initialOrderStatus === 'fulfilled';
      const isFailed = ['cancelled', 'expired'].includes(initialOrderStatus);
      const isPending = ['presignaturePending', 'open'].includes(
        initialOrderStatus,
      );

      let initialTransactionStatus: TransactionStatus;
      if (isComplete) {
        initialTransactionStatus = TransactionStatus.confirmed;
      } else if (isFailed) {
        initialTransactionStatus = TransactionStatus.failed;
      } else if (isPending) {
        initialTransactionStatus = TransactionStatus.submitted;
      } else {
        initialTransactionStatus = TransactionStatus.submitted;
      }

      // Update transaction with proper initial status based on CoW order
      const statusUpdatedTxMeta = {
        ...intentTxMeta,
        status: initialTransactionStatus,
      };

      this.#updateTransactionFn(
        statusUpdatedTxMeta,
        `BridgeStatusController - Initial CoW order status: ${initialOrderStatus}`,
      );

      // Update with actual transaction metadata
      const syntheticMeta = {
        ...statusUpdatedTxMeta,
        isIntentTx: true,
        orderUid,
        intentType: isCrossChainTx ? 'bridge' : 'swap',
      } as unknown as TransactionMeta;

      // Record in bridge history with actual transaction metadata
      try {
        // Use intent: prefix for CoW transactions to route to CoW API
        const bridgeHistoryKey = `intent:${orderUid}`;

        // Create a bridge transaction metadata that includes the original txId
        const bridgeTxMetaForHistory = {
          ...syntheticMeta,
          id: bridgeHistoryKey, // Use intent: prefix for bridge history key
          originalTransactionId: syntheticMeta.id, // Keep original txId for TransactionController updates
        } as TransactionMeta;

        this.#addTxToHistory({
          accountAddress,
          bridgeTxMeta: bridgeTxMetaForHistory,
          statusRequest: {
            ...getStatusRequestParams(quoteResponse),
            srcTxHash: syntheticMeta.hash || '',
          },
          quoteResponse,
          slippagePercentage: 0,
          isStxEnabled: false,
          approvalTxId,
        });

        // Debug: Check if the bridge history was added

        // Start polling using the intent: prefixed key to route to CoW API
        this.#startPollingForTxId(bridgeHistoryKey);
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

  /**
   * Tracks post-submission events for a cross-chain swap based on the history item
   *
   * @param eventName - The name of the event to track
   * @param txMetaId - The txMetaId of the history item to track the event for
   * @param eventProperties - The properties for the event
   */
  readonly #trackUnifiedSwapBridgeEvent = <
    T extends
      | typeof UnifiedSwapBridgeEventName.Submitted
      | typeof UnifiedSwapBridgeEventName.Failed
      | typeof UnifiedSwapBridgeEventName.SnapConfirmationViewed
      | typeof UnifiedSwapBridgeEventName.Completed
      | typeof UnifiedSwapBridgeEventName.StatusValidationFailed,
  >(
    eventName: T,
    txMetaId?: string,
    eventProperties?: Pick<RequiredEventContextFromClient, T>[T],
  ) => {
    const baseProperties = {
      action_type: MetricsActionType.SWAPBRIDGE_V1,
      ...(eventProperties ?? {}),
    };

    if (!txMetaId) {
      this.messagingSystem.call(
        'BridgeController:trackUnifiedSwapBridgeEvent',
        eventName,
        baseProperties,
      );
      return;
    }

    const historyItem: BridgeHistoryItem | undefined =
      this.state.txHistory[txMetaId];
    if (!historyItem) {
      this.messagingSystem.call(
        'BridgeController:trackUnifiedSwapBridgeEvent',
        eventName,
        eventProperties ?? {},
      );
      return;
    }

    const selectedAccount = this.messagingSystem.call(
      'AccountsController:getAccountByAddress',
      historyItem.account,
    );

    const { transactions } = this.messagingSystem.call(
      'TransactionController:getState',
    );
    const txMeta = transactions?.find(
      (t: TransactionMeta) => t.id === txMetaId,
    );
    const approvalTxMeta = transactions?.find(
      (t: TransactionMeta) => t.id === historyItem.approvalTxId,
    );

    const requestParamProperties = getRequestParamFromHistory(historyItem);

    if (eventName === UnifiedSwapBridgeEventName.StatusValidationFailed) {
      const {
        chain_id_source,
        chain_id_destination,
        token_address_source,
        token_address_destination,
      } = requestParamProperties;
      this.messagingSystem.call(
        'BridgeController:trackUnifiedSwapBridgeEvent',
        eventName,
        {
          ...baseProperties,
          chain_id_source,
          chain_id_destination,
          token_address_source,
          token_address_destination,
          refresh_count: historyItem.attempts?.counter ?? 0,
        },
      );
      return;
    }

    const requiredEventProperties = {
      ...baseProperties,
      ...requestParamProperties,
      ...getRequestMetadataFromHistory(historyItem, selectedAccount),
      ...getTradeDataFromHistory(historyItem),
      ...getTxStatusesFromHistory(historyItem),
      ...getFinalizedTxProperties(historyItem, txMeta, approvalTxMeta),
      ...getPriceImpactFromQuote(historyItem.quote),
    };

    this.messagingSystem.call(
      'BridgeController:trackUnifiedSwapBridgeEvent',
      eventName,
      requiredEventProperties,
    );
  };
}
