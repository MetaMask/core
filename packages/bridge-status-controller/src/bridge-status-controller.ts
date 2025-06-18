import type { StateMetadata } from '@metamask/base-controller';
import type {
  QuoteMetadata,
  RequiredEventContextFromClient,
  TxData,
  QuoteResponse,
} from '@metamask/bridge-controller';
import {
  formatChainIdToHex,
  getEthUsdtResetData,
  isEthUsdt,
  isSolanaChainId,
  StatusTypes,
  UnifiedSwapBridgeEventName,
  getActionType,
  formatChainIdToCaip,
  isCrossChain,
  getBridgeFeatureFlags,
  isHardwareWallet,
} from '@metamask/bridge-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import { toHex } from '@metamask/controller-utils';
import { EthAccountType, SolScope } from '@metamask/keyring-api';
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
import type { UserOperationController } from '@metamask/user-operation-controller';
import { numberToHex, type Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  BRIDGE_PROD_API_BASE_URL,
  BRIDGE_STATUS_CONTROLLER_NAME,
  DEFAULT_BRIDGE_STATUS_CONTROLLER_STATE,
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
} from './utils/bridge-status';
import { getTxGasEstimates } from './utils/gas';
import {
  getFinalizedTxProperties,
  getRequestMetadataFromHistory,
  getRequestParamFromHistory,
  getTradeDataFromHistory,
  getTxStatusesFromHistory,
} from './utils/metrics';
import {
  getClientRequest,
  getKeyringRequest,
  getStatusRequestParams,
  getTxMetaFields,
  handleLineaDelay,
  handleSolanaTxResponse,
} from './utils/transaction';
import { generateActionId } from './utils/transaction';

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

  readonly #estimateGasFeeFn: typeof TransactionController.prototype.estimateGasFee;

  readonly #addUserOperationFromTransactionFn?: typeof UserOperationController.prototype.addUserOperationFromTransaction;

  readonly #trace: TraceCallback;

  constructor({
    messenger,
    state,
    clientId,
    fetchFn,
    addTransactionFn,
    addUserOperationFromTransactionFn,
    estimateGasFeeFn,
    config,
    traceFn,
  }: {
    messenger: BridgeStatusControllerMessenger;
    state?: Partial<BridgeStatusControllerState>;
    clientId: BridgeClientId;
    fetchFn: FetchFunction;
    addTransactionFn: typeof TransactionController.prototype.addTransaction;
    estimateGasFeeFn: typeof TransactionController.prototype.estimateGasFee;
    addUserOperationFromTransactionFn?: typeof UserOperationController.prototype.addUserOperationFromTransaction;
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
    this.#addUserOperationFromTransactionFn = addUserOperationFromTransactionFn;
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

    // Set interval
    this.setIntervalLength(REFRESH_INTERVAL_MS);

    this.messagingSystem.subscribe(
      'TransactionController:transactionFailed',
      ({ transactionMeta }) => {
        const { type, status, id } = transactionMeta;
        if (
          type &&
          [TransactionType.bridge, TransactionType.swap].includes(type) &&
          ![TransactionStatus.signed, TransactionStatus.approved].includes(
            status,
          )
        ) {
          this.#trackUnifiedSwapBridgeEvent(
            UnifiedSwapBridgeEventName.Failed,
            id,
          );
        }
      },
    );

    this.messagingSystem.subscribe(
      'TransactionController:transactionConfirmed',
      (transactionMeta) => {
        const { type, id } = transactionMeta;
        if (type === TransactionType.swap) {
          this.#trackUnifiedSwapBridgeEvent(
            UnifiedSwapBridgeEventName.Completed,
            id,
          );
        }
      },
    );

    this.messagingSystem.subscribe(
      'MultichainTransactionsController:transactionConfirmed',
      (transactionMeta) => {
        const { type, id } = transactionMeta;
        if (type === TransactionType.swap) {
          this.#trackUnifiedSwapBridgeEvent(
            UnifiedSwapBridgeEventName.Completed,
            id,
          );
        }
      },
    );

    // If you close the extension, but keep the browser open, the polling continues
    // If you close the browser, the polling stops
    // Check for historyItems that do not have a status of complete and restart polling
    this.#restartPollingForIncompleteHistoryItems();
  }

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
        const srcTxMetaId = historyItem.txMetaId;
        const pollingToken = this.#pollingTokensByTxMetaId[srcTxMetaId];
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

      // We manually call startPolling() here rather than go through startPollingForBridgeTxStatus()
      // because we don't want to overwrite the existing historyItem in state
      this.#pollingTokensByTxMetaId[bridgeTxMetaId] = this.startPolling({
        bridgeTxMetaId,
      });
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
    } = startPollingForBridgeTxStatusArgs;
    const accountAddress = this.#getMultichainSelectedAccountAddress();
    // Write all non-status fields to state so we can reference the quote in Activity list without the Bridge API
    // We know it's in progress but not the exact status yet
    const txHistoryItem = {
      txMetaId: bridgeTxMeta.id,
      quote: quoteResponse.quote,
      startTime,
      estimatedProcessingTimeInSeconds:
        quoteResponse.estimatedProcessingTimeInSeconds,
      slippagePercentage,
      pricingData: {
        amountSent: quoteResponse.sentAmount.amount,
        amountSentInUsd: quoteResponse.sentAmount.usd ?? undefined,
        quotedGasInUsd: quoteResponse.gasFee.usd ?? undefined,
        quotedReturnInUsd: quoteResponse.toTokenAmount.usd ?? undefined,
      },
      initialDestAssetBalance,
      targetContractAddress,
      account: accountAddress,
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

  /**
   * Starts polling for the bridge tx status
   *
   * @param txHistoryMeta - The parameters for creating the history item
   */
  startPollingForBridgeTxStatus = (
    txHistoryMeta: StartPollingForBridgeTxStatusArgsSerialized,
  ) => {
    const { quoteResponse, bridgeTxMeta } = txHistoryMeta;

    this.#addTxToHistory(txHistoryMeta);

    const isBridgeTx = isCrossChain(
      quoteResponse.quote.srcChainId,
      quoteResponse.quote.destChainId,
    );
    if (isBridgeTx) {
      this.#pollingTokensByTxMetaId[bridgeTxMeta.id] = this.startPolling({
        bridgeTxMetaId: bridgeTxMeta.id,
      });
    }
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

  #getMultichainSelectedAccountAddress() {
    return this.#getMultichainSelectedAccount()?.address ?? '';
  }

  readonly #fetchBridgeTxStatus = async ({
    bridgeTxMetaId,
  }: FetchBridgeTxStatusArgs) => {
    const { txHistory } = this.state;

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
      const status = await fetchBridgeTxStatus(
        statusRequest,
        this.#clientId,
        this.#fetchFn,
        this.#config.customBridgeApiBaseUrl,
      );
      const newBridgeHistoryItem = {
        ...historyItem,
        status,
        completionTime:
          status.status === StatusTypes.COMPLETE ||
          status.status === StatusTypes.FAILED
            ? Date.now()
            : undefined, // TODO make this more accurate by looking up dest txHash block time
      };

      // No need to purge these on network change or account change, TransactionController does not purge either.
      // TODO In theory we can skip checking status if it's not the current account/network
      // we need to keep track of the account that this is associated with as well so that we don't show it in Activity list for other accounts
      // First stab at this will not stop polling when you are on a different account
      this.update((state) => {
        state.txHistory[bridgeTxMetaId] = newBridgeHistoryItem;
      });

      const pollingToken = this.#pollingTokensByTxMetaId[bridgeTxMetaId];

      if (
        (status.status === StatusTypes.COMPLETE ||
          status.status === StatusTypes.FAILED) &&
        pollingToken
      ) {
        this.stopPollingByPollingToken(pollingToken);

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
    } catch (e) {
      console.log('Failed to fetch bridge tx status', e);
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
   * @returns The transaction meta
   */
  readonly #handleSolanaTx = async (
    quoteResponse: QuoteResponse<string> & QuoteMetadata,
  ) => {
    const selectedAccount = this.#getMultichainSelectedAccount();
    if (!selectedAccount) {
      throw new Error(
        'Failed to submit cross-chain swap transaction: undefined multichain account',
      );
    }
    if (!selectedAccount?.metadata?.snap?.id) {
      throw new Error(
        'Failed to submit cross-chain swap transaction: undefined snap id',
      );
    }

    const bridgeFeatureFlags = getBridgeFeatureFlags(this.messagingSystem);
    const request = bridgeFeatureFlags?.chains?.[SolScope.Mainnet]
      ?.isSnapConfirmationEnabled
      ? getKeyringRequest(quoteResponse, selectedAccount)
      : getClientRequest(quoteResponse, selectedAccount);
    const requestResponse = (await this.messagingSystem.call(
      'SnapController:handleRequest',
      request,
    )) as string | { result: Record<string, string> };

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
    hashPromise?:
      | Awaited<ReturnType<TransactionController['addTransaction']>>['result']
      | Awaited<
          ReturnType<UserOperationController['addUserOperationFromTransaction']>
        >['hash'],
  ): Promise<TransactionMeta | undefined> => {
    const transactionHash = await hashPromise;
    const finalTransactionMeta: TransactionMeta | undefined =
      this.messagingSystem
        .call('TransactionController:getState')
        .transactions.find(
          (tx: TransactionMeta) => tx.hash === transactionHash,
        );
    return finalTransactionMeta;
  };

  readonly #handleApprovalTx = async (
    isBridgeTx: boolean,
    quoteResponse: QuoteResponse<string | TxData> & QuoteMetadata,
    requireApproval = false,
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
          quoteResponse,
          requireApproval,
        });
        if (!approvalTxMeta) {
          throw new Error(
            'Failed to submit bridge tx: approval txMeta is undefined',
          );
        }

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

  readonly #handleEvmSmartTransaction = async ({
    isBridgeTx,
    trade,
    quoteResponse,
    approvalTxId,
    requireApproval = false,
  }: {
    isBridgeTx: boolean;
    trade: TxData;
    quoteResponse: Omit<QuoteResponse, 'approval' | 'trade'> & QuoteMetadata;
    approvalTxId?: string;
    requireApproval?: boolean;
  }) => {
    return await this.#handleEvmTransaction({
      transactionType: isBridgeTx
        ? TransactionType.bridge
        : TransactionType.swap,
      trade,
      quoteResponse,
      approvalTxId,
      shouldWaitForHash: false, // Set to false to indicate we don't want to wait for hash
      requireApproval,
    });
  };

  /**
   * Submits an EVM transaction to the TransactionController
   *
   * @param params - The parameters for the transaction
   * @param params.transactionType - The type of transaction to submit
   * @param params.trade - The trade data to confirm
   * @param params.quoteResponse - The quote response
   * @param params.approvalTxId - The tx id of the approval tx
   * @param params.shouldWaitForHash - Whether to wait for the hash of the transaction
   * @param params.requireApproval - Whether to require approval for the transaction
   * @returns The transaction meta
   */
  readonly #handleEvmTransaction = async ({
    transactionType,
    trade,
    quoteResponse,
    approvalTxId,
    shouldWaitForHash = true,
    requireApproval = false,
  }: {
    transactionType: TransactionType;
    trade: TxData;
    quoteResponse: Omit<QuoteResponse, 'approval' | 'trade'> & QuoteMetadata;
    approvalTxId?: string;
    shouldWaitForHash?: boolean;
    requireApproval?: boolean;
  }): Promise<TransactionMeta | undefined> => {
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

    let result:
      | Awaited<ReturnType<TransactionController['addTransaction']>>['result']
      | Awaited<
          ReturnType<UserOperationController['addUserOperationFromTransaction']>
        >['hash']
      | undefined;
    let transactionMeta: TransactionMeta | undefined;

    const isSmartContractAccount =
      selectedAccount.type === EthAccountType.Erc4337;
    if (isSmartContractAccount && this.#addUserOperationFromTransactionFn) {
      const smartAccountTxResult =
        await this.#addUserOperationFromTransactionFn(
          transactionParamsWithMaxGas,
          requestOptions,
        );
      result = smartAccountTxResult.transactionHash;
      transactionMeta = {
        ...requestOptions,
        chainId: hexChainId,
        txParams: transactionParamsWithMaxGas,
        time: Date.now(),
        id: smartAccountTxResult.id,
        status: TransactionStatus.confirmed,
      };
    } else {
      const addTransactionResult = await this.#addTransactionFn(
        transactionParamsWithMaxGas,
        requestOptions,
      );
      result = addTransactionResult.result;
      transactionMeta = addTransactionResult.transactionMeta;
    }

    if (shouldWaitForHash) {
      return await this.#waitForHashAndReturnFinalTxMeta(result);
    }

    return {
      ...getTxMetaFields(quoteResponse, approvalTxId),
      ...transactionMeta,
    };
  };

  readonly #handleUSDTAllowanceReset = async (
    quoteResponse: QuoteResponse<TxData | string> & QuoteMetadata,
  ) => {
    const hexChainId = formatChainIdToHex(quoteResponse.quote.srcChainId);
    if (
      quoteResponse.approval &&
      isEthUsdt(hexChainId, quoteResponse.quote.srcAsset.address)
    ) {
      const allowance = new BigNumber(
        await this.messagingSystem.call(
          'BridgeController:getBridgeERC20Allowance',
          quoteResponse.quote.srcAsset.address,
          hexChainId,
        ),
      );
      const shouldResetApproval =
        allowance.lt(quoteResponse.sentAmount.amount) && allowance.gt(0);
      if (shouldResetApproval) {
        await this.#handleEvmTransaction({
          transactionType: TransactionType.bridgeApproval,
          trade: { ...quoteResponse.approval, data: getEthUsdtResetData() },
          quoteResponse,
        });
      }
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
    const maxGasLimit = toHex(transactionParams.gas ?? 0);

    return {
      maxFeePerGas,
      maxPriorityFeePerGas,
      gas: maxGasLimit,
    };
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
    let txMeta: (TransactionMeta & Partial<SolanaTransactionMeta>) | undefined;

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
        async () =>
          await this.#handleSolanaTx(
            quoteResponse as QuoteResponse<string> & QuoteMetadata,
          ),
      );
      this.#trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.SnapConfirmationViewed,
        txMeta.id,
      );
    }
    // Submit EVM tx
    let approvalTime: number | undefined, approvalTxId: string | undefined;
    if (
      !isSolanaChainId(quoteResponse.quote.srcChainId) &&
      typeof quoteResponse.trade !== 'string'
    ) {
      // For hardware wallets on Mobile, this is fixes an issue where the Ledger does not get prompted for the 2nd approval
      // Extension does not have this issue
      const requireApproval =
        this.#clientId === BridgeClientId.MOBILE &&
        isHardwareWallet(this.#getMultichainSelectedAccount());

      // Set approval time and id if an approval tx is needed
      const approvalTxMeta = await this.#handleApprovalTx(
        isBridgeTx,
        quoteResponse,
        requireApproval,
      );
      approvalTime = approvalTxMeta?.time;
      approvalTxId = approvalTxMeta?.id;
      // Handle smart transactions if enabled
      if (isStxEnabledOnClient) {
        txMeta = await this.#trace(
          {
            name: isBridgeTx
              ? TraceName.BridgeTransactionCompleted
              : TraceName.SwapTransactionCompleted,
            data: {
              srcChainId: formatChainIdToCaip(quoteResponse.quote.srcChainId),
              stxEnabled: true,
            },
          },
          async () =>
            await this.#handleEvmSmartTransaction({
              isBridgeTx,
              trade: quoteResponse.trade as TxData,
              quoteResponse,
              approvalTxId,
              requireApproval,
            }),
        );
      } else {
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
          async () =>
            await this.#handleEvmTransaction({
              transactionType: TransactionType.bridge,
              trade: quoteResponse.trade as TxData,
              quoteResponse,
              approvalTxId,
              requireApproval,
            }),
        );
      }
    }

    if (!txMeta) {
      throw new Error('Failed to submit bridge tx: txMeta is undefined');
    }

    try {
      // Start polling for bridge tx status
      this.startPollingForBridgeTxStatus({
        bridgeTxMeta: txMeta, // Only the id field is used by the BridgeStatusController
        statusRequest: {
          ...getStatusRequestParams(quoteResponse),
          srcTxHash: txMeta.hash,
        },
        quoteResponse,
        slippagePercentage: 0, // TODO include slippage provided by quote if using dynamic slippage, or slippage from quote request
        isStxEnabled: isStxEnabledOnClient,
        startTime: approvalTime ?? Date.now(),
        approvalTxId,
      });

      this.#trackUnifiedSwapBridgeEvent(
        UnifiedSwapBridgeEventName.Submitted,
        txMeta.id,
      );
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
   */
  readonly #trackUnifiedSwapBridgeEvent = <
    T extends
      | typeof UnifiedSwapBridgeEventName.Submitted
      | typeof UnifiedSwapBridgeEventName.Failed
      | typeof UnifiedSwapBridgeEventName.SnapConfirmationViewed
      | typeof UnifiedSwapBridgeEventName.Completed,
  >(
    eventName: T,
    txMetaId: string,
  ) => {
    const historyItem: BridgeHistoryItem | undefined =
      this.state.txHistory[txMetaId];
    if (!historyItem) {
      this.messagingSystem.call(
        'BridgeController:trackUnifiedSwapBridgeEvent',
        eventName,
        {},
      );
      return;
    }

    let requiredEventProperties: Pick<RequiredEventContextFromClient, T>[T];
    const selectedAccount = this.messagingSystem.call(
      'AccountsController:getAccountByAddress',
      historyItem.account,
    );

    switch (eventName) {
      case UnifiedSwapBridgeEventName.Submitted:
      case UnifiedSwapBridgeEventName.Completed:
      case UnifiedSwapBridgeEventName.Failed:
      default:
        requiredEventProperties = {
          action_type: getActionType(
            historyItem.quote.srcChainId,
            historyItem.quote.destChainId,
          ),
          ...getRequestParamFromHistory(historyItem),
          ...getRequestMetadataFromHistory(historyItem, selectedAccount),
          ...getTradeDataFromHistory(historyItem),
          ...getTxStatusesFromHistory(historyItem),
          ...getFinalizedTxProperties(historyItem),
          error_message: 'error_message',
          price_impact: Number(historyItem.quote.priceData?.priceImpact ?? '0'),
        };
    }

    this.messagingSystem.call(
      'BridgeController:trackUnifiedSwapBridgeEvent',
      eventName,
      requiredEventProperties,
    );
  };
}
