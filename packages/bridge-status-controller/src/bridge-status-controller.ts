import type { AccountsControllerState } from '@metamask/accounts-controller';
import type { StateMetadata } from '@metamask/base-controller';
import type {
  QuoteMetadata,
  RequiredEventContextFromClient,
  TxData,
  QuoteResponse,
} from '@metamask/bridge-controller';
import {
  formatChainIdToHex,
  isNonEvmChainId,
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
  handleApprovalDelay,
  handleMobileHardwareWalletDelay,
  handleNonEvmTxResponse,
  generateActionId,
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
    this.messenger.registerActionHandler(
      `${BRIDGE_STATUS_CONTROLLER_NAME}:startPollingForBridgeTxStatus`,
      this.startPollingForBridgeTxStatus.bind(this),
    );
    this.messenger.registerActionHandler(
      `${BRIDGE_STATUS_CONTROLLER_NAME}:wipeBridgeStatus`,
      this.wipeBridgeStatus.bind(this),
    );
    this.messenger.registerActionHandler(
      `${BRIDGE_STATUS_CONTROLLER_NAME}:resetState`,
      this.resetState.bind(this),
    );
    this.messenger.registerActionHandler(
      `${BRIDGE_STATUS_CONTROLLER_NAME}:submitTx`,
      this.submitTx.bind(this),
    );
    this.messenger.registerActionHandler(
      `${BRIDGE_STATUS_CONTROLLER_NAME}:restartPollingForFailedAttempts`,
      this.restartPollingForFailedAttempts.bind(this),
    );
    this.messenger.registerActionHandler(
      `${BRIDGE_STATUS_CONTROLLER_NAME}:getBridgeHistoryItemByTxMetaId`,
      this.getBridgeHistoryItemByTxMetaId.bind(this),
    );

    // Set interval
    this.setIntervalLength(REFRESH_INTERVAL_MS);

    this.messenger.subscribe(
      'TransactionController:transactionFailed',
      ({ transactionMeta }) => {
        const { type, status, id } = transactionMeta;
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

    this.messenger.subscribe(
      'TransactionController:transactionConfirmed',
      (transactionMeta) => {
        const { type, id, chainId } = transactionMeta;
        if (type === TransactionType.swap) {
          this.#trackUnifiedSwapBridgeEvent(
            UnifiedSwapBridgeEventName.Completed,
            id,
          );
        }
        if (type === TransactionType.bridge && !isNonEvmChainId(chainId)) {
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
      const { selectedNetworkClientId } = this.messenger.call(
        'NetworkController:getState',
      );
      const selectedNetworkClient = this.messenger.call(
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
      batchId: bridgeTxMeta.batchId,
      quote: quoteResponse.quote,
      startTime,
      estimatedProcessingTimeInSeconds:
        quoteResponse.estimatedProcessingTimeInSeconds,
      slippagePercentage,
      pricingData: {
        amountSent: quoteResponse.sentAmount?.amount ?? '0',
        amountSentInUsd: quoteResponse.sentAmount?.usd ?? undefined,
        quotedGasInUsd: quoteResponse.gasFee?.effective?.usd ?? undefined,
        quotedReturnInUsd: quoteResponse.toTokenAmount?.usd ?? undefined,
        quotedGasAmount: quoteResponse.gasFee?.effective?.amount ?? undefined,
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
      featureId: quoteResponse.featureId,
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

    const isBridgeTx = isCrossChain(quote.srcChainId, quote.destChainId);
    if (isBridgeTx) {
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

  #getMultichainSelectedAccount(accountAddress: string) {
    return this.messenger.call(
      'AccountsController:getAccountByAddress',
      accountAddress,
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
    } catch (e) {
      console.warn('Failed to fetch bridge tx status', e);
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
    const txControllerState = this.messenger.call(
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
   * Submits the transaction to the snap using the new unified ClientRequest interface
   * Works for all non-EVM chains (Solana, BTC, Tron)
   * This adds an approval tx to the ApprovalsController in the background
   * The client needs to handle the approval tx by redirecting to the confirmation page with the approvalTxId in the URL
   *
   * @param quoteResponse - The quote response
   * @param quoteResponse.quote - The quote
   * @param selectedAccount - The account to submit the transaction for
   * @returns The transaction meta
   */
  readonly #handleNonEvmTx = async (
    quoteResponse: QuoteResponse<string | { unsignedPsbtBase64: string }> &
      QuoteMetadata,
    selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string],
  ) => {
    if (!selectedAccount.metadata?.snap?.id) {
      throw new Error(
        'Failed to submit cross-chain swap transaction: undefined snap id',
      );
    }

    const request = getClientRequest(quoteResponse, selectedAccount);
    const requestResponse = (await this.messenger.call(
      'SnapController:handleRequest',
      request,
    )) as
      | string
      | { transactionId: string }
      | { result: Record<string, string> }
      | { signature: string };

    const txMeta = handleNonEvmTxResponse(
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
    const finalTransactionMeta: TransactionMeta | undefined = this.messenger
      .call('TransactionController:getState')
      .transactions.find((tx: TransactionMeta) => tx.hash === transactionHash);
    if (!finalTransactionMeta) {
      throw new Error(
        'Failed to submit cross-chain swap tx: txMeta for txHash was not found',
      );
    }
    return finalTransactionMeta;
  };

  readonly #handleApprovalTx = async (
    isBridgeTx: boolean,
    quoteResponse: QuoteResponse & Partial<QuoteMetadata>,
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

        await handleApprovalDelay(quoteResponse);
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

    const selectedAccount = this.messenger.call(
      'AccountsController:getAccountByAddress',
      trade.from,
    );
    if (!selectedAccount) {
      throw new Error(
        'Failed to submit cross-chain swap transaction: unknown account in trade data',
      );
    }
    const hexChainId = formatChainIdToHex(trade.chainId);
    const networkClientId = this.messenger.call(
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
    const transactionParams: Parameters<
      TransactionController['addTransaction']
    >[0] = {
      ...trade,
      chainId: hexChainId,
      gasLimit: trade.gasLimit?.toString(),
      gas: trade.gasLimit?.toString(),
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
    quoteResponse: QuoteResponse & Partial<QuoteMetadata>,
  ) => {
    const resetApproval = await getUSDTAllowanceResetTx(
      this.messenger,
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
    const { gasFeeEstimates } = this.messenger.call(
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
    const maxGasLimit = toHex(transactionParams.gas ?? 0);

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
      'messenger' | 'estimateGasFeeFn'
    >,
  ) => {
    const transactionParams = await getAddTransactionBatchParams({
      messenger: this.messenger,
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
      messenger: this.messenger,
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
   * @param accountAddress - The address of the account to submit the transaction for
   * @param quoteResponse - The quote response
   * @param isStxEnabledOnClient - Whether smart transactions are enabled on the client, for example the getSmartTransactionsEnabled selector value from the extension
   * @returns The transaction meta
   */
  submitTx = async (
    accountAddress: string,
    quoteResponse: QuoteResponse & Partial<QuoteMetadata>,
    isStxEnabledOnClient: boolean,
  ): Promise<TransactionMeta & Partial<SolanaTransactionMeta>> => {
    this.messenger.call('BridgeController:stopPollingForQuotes');

    const selectedAccount = this.#getMultichainSelectedAccount(accountAddress);
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
    !quoteResponse.featureId &&
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

    // Submit non-EVM tx (Solana, BTC, Tron)
    // Bitcoin trades come as objects with unsignedPsbtBase64, others as strings
    const isNonEvmTrade =
      isNonEvmChainId(quoteResponse.quote.srcChainId) &&
      (typeof quoteResponse.trade === 'string' ||
        (typeof quoteResponse.trade === 'object' &&
          'unsignedPsbtBase64' in quoteResponse.trade));

    if (isNonEvmTrade) {
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
            return await this.#handleNonEvmTx(
              quoteResponse as QuoteResponse<
                string | { unsignedPsbtBase64: string }
              > &
                QuoteMetadata,
              selectedAccount,
            );
          } catch (error) {
            !quoteResponse.featureId &&
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
                  this.messenger,
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

      if (isNonEvmChainId(quoteResponse.quote.srcChainId)) {
        // Start polling for bridge tx status
        this.#startPollingForTxId(txMeta.id);
        // Track non-EVM Swap completed event
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

    // This will publish events for PERPS dropped tx failures as well
    if (!txMetaId) {
      this.messenger.call(
        'BridgeController:trackUnifiedSwapBridgeEvent',
        eventName,
        baseProperties,
      );
      return;
    }

    const historyItem: BridgeHistoryItem | undefined =
      this.state.txHistory[txMetaId];
    if (!historyItem) {
      this.messenger.call(
        'BridgeController:trackUnifiedSwapBridgeEvent',
        eventName,
        eventProperties ?? {},
      );
      return;
    }

    const requestParamProperties = getRequestParamFromHistory(historyItem);
    // Always publish StatusValidationFailed event, regardless of featureId
    if (eventName === UnifiedSwapBridgeEventName.StatusValidationFailed) {
      const {
        chain_id_source,
        chain_id_destination,
        token_address_source,
        token_address_destination,
      } = requestParamProperties;
      this.messenger.call(
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

    // Skip tracking all other events when featureId is set (i.e. PERPS)
    if (historyItem.featureId) {
      return;
    }

    const selectedAccount = this.messenger.call(
      'AccountsController:getAccountByAddress',
      historyItem.account,
    );

    const { transactions } = this.messenger.call(
      'TransactionController:getState',
    );
    const txMeta = transactions?.find(({ id }) => id === txMetaId);
    const approvalTxMeta = transactions?.find(
      ({ id }) => id === historyItem.approvalTxId,
    );

    const requiredEventProperties = {
      ...baseProperties,
      ...requestParamProperties,
      ...getRequestMetadataFromHistory(historyItem, selectedAccount),
      ...getTradeDataFromHistory(historyItem),
      ...getTxStatusesFromHistory(historyItem),
      ...getFinalizedTxProperties(historyItem, txMeta, approvalTxMeta),
      ...getPriceImpactFromQuote(historyItem.quote),
    };

    this.messenger.call(
      'BridgeController:trackUnifiedSwapBridgeEvent',
      eventName,
      requiredEventProperties,
    );
  };
}
