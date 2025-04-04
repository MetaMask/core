import { hexlify } from '@ethersproject/bytes';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import {
  query,
  safelyExecute,
  ChainId,
  isSafeDynamicKey,
} from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import type {
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type {
  TransactionController,
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import { TransactionStatus } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';
import cloneDeep from 'lodash/cloneDeep';

import { MetaMetricsEventCategory, MetaMetricsEventName } from './constants';
import type {
  Fees,
  Hex,
  IndividualTxFees,
  SignedCanceledTransaction,
  SignedTransaction,
  SmartTransaction,
  SmartTransactionsStatus,
  UnsignedTransaction,
  GetTransactionsOptions,
  MetaMetricsProps,
  FeatureFlags,
  ClientId,
} from './types';
import { APIType, SmartTransactionStatuses } from './types';
import {
  calculateStatus,
  generateHistoryEntry,
  getAPIRequestURL,
  handleFetch,
  incrementNonceInHex,
  isSmartTransactionCancellable,
  isSmartTransactionPending,
  replayHistory,
  snapshotFromTxMeta,
  getTxHash,
  getSmartTransactionMetricsProperties,
  getSmartTransactionMetricsSensitiveProperties,
  shouldMarkRegularTransactionAsFailed,
  markRegularTransactionAsFailed,
} from './utils';

const SECOND = 1000;
export const DEFAULT_INTERVAL = SECOND * 5;
const ETH_QUERY_ERROR_MSG =
  '`ethQuery` is not defined on SmartTransactionsController';

/**
 * The name of the {@link SmartTransactionsController}
 */
const controllerName = 'SmartTransactionsController';

const controllerMetadata = {
  smartTransactionsState: {
    persist: true,
    anonymous: true,
  },
};

type FeeEstimates = {
  approvalTxFees: IndividualTxFees | null;
  tradeTxFees: IndividualTxFees | null;
};

export type SmartTransactionsControllerState = {
  smartTransactionsState: {
    smartTransactions: Record<Hex, SmartTransaction[]>;
    userOptIn: boolean | null;
    userOptInV2: boolean | null;
    liveness: boolean | null;
    fees: FeeEstimates;
    feesByChainId: Record<Hex, FeeEstimates>;
    livenessByChainId: Record<Hex, boolean>;
  };
};

/**
 * Get the default {@link SmartTransactionsController} state.
 *
 * @returns The default {@link SmartTransactionsController} state.
 */
export function getDefaultSmartTransactionsControllerState(): SmartTransactionsControllerState {
  return {
    smartTransactionsState: {
      smartTransactions: {},
      userOptIn: null,
      userOptInV2: null,
      fees: {
        approvalTxFees: null,
        tradeTxFees: null,
      },
      liveness: true,
      livenessByChainId: {
        [ChainId.mainnet]: true,
        [ChainId.sepolia]: true,
      },
      feesByChainId: {
        [ChainId.mainnet]: {
          approvalTxFees: null,
          tradeTxFees: null,
        },
        [ChainId.sepolia]: {
          approvalTxFees: null,
          tradeTxFees: null,
        },
      },
    },
  };
}

export type SmartTransactionsControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    SmartTransactionsControllerState
  >;

/**
 * The actions that can be performed using the {@link SmartTransactionsController}.
 */
export type SmartTransactionsControllerActions =
  SmartTransactionsControllerGetStateAction;

type AllowedActions =
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetStateAction;

export type SmartTransactionsControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    SmartTransactionsControllerState
  >;

export type SmartTransactionsControllerSmartTransactionEvent = {
  type: 'SmartTransactionsController:smartTransaction';
  payload: [SmartTransaction];
};

export type SmartTransactionsControllerSmartTransactionConfirmationDoneEvent = {
  type: 'SmartTransactionsController:smartTransactionConfirmationDone';
  payload: [SmartTransaction];
};

/**
 * The events that {@link SmartTransactionsController} can emit.
 */
export type SmartTransactionsControllerEvents =
  | SmartTransactionsControllerStateChangeEvent
  | SmartTransactionsControllerSmartTransactionEvent
  | SmartTransactionsControllerSmartTransactionConfirmationDoneEvent;

type AllowedEvents = NetworkControllerStateChangeEvent;

/**
 * The messenger of the {@link SmartTransactionsController}.
 */
export type SmartTransactionsControllerMessenger =
  RestrictedControllerMessenger<
    typeof controllerName,
    SmartTransactionsControllerActions | AllowedActions,
    SmartTransactionsControllerEvents | AllowedEvents,
    AllowedActions['type'],
    AllowedEvents['type']
  >;

type SmartTransactionsControllerOptions = {
  interval?: number;
  clientId: ClientId;
  chainId?: Hex;
  supportedChainIds?: Hex[];
  getNonceLock: TransactionController['getNonceLock'];
  confirmExternalTransaction: TransactionController['confirmExternalTransaction'];
  trackMetaMetricsEvent: (
    event: {
      event: MetaMetricsEventName;
      category: MetaMetricsEventCategory;
      properties?: ReturnType<typeof getSmartTransactionMetricsProperties>;
      sensitiveProperties?: ReturnType<
        typeof getSmartTransactionMetricsSensitiveProperties
      >;
    },
    options?: { metaMetricsId?: string } & Record<string, boolean>,
  ) => void;
  state?: Partial<SmartTransactionsControllerState>;
  messenger: SmartTransactionsControllerMessenger;
  getTransactions: (options?: GetTransactionsOptions) => TransactionMeta[];
  getMetaMetricsProps: () => Promise<MetaMetricsProps>;
  getFeatureFlags: () => FeatureFlags;
  updateTransaction: (transaction: TransactionMeta, note: string) => void;
};

export type SmartTransactionsControllerPollingInput = {
  chainIds: Hex[];
};

export default class SmartTransactionsController extends StaticIntervalPollingController<SmartTransactionsControllerPollingInput>()<
  typeof controllerName,
  SmartTransactionsControllerState,
  SmartTransactionsControllerMessenger
> {
  #interval: number;

  #clientId: ClientId;

  #chainId: Hex;

  #supportedChainIds: Hex[];

  timeoutHandle?: NodeJS.Timeout;

  readonly #getNonceLock: SmartTransactionsControllerOptions['getNonceLock'];

  #ethQuery: EthQuery | undefined;

  #confirmExternalTransaction: SmartTransactionsControllerOptions['confirmExternalTransaction'];

  #getRegularTransactions: (
    options?: GetTransactionsOptions,
  ) => TransactionMeta[];

  readonly #trackMetaMetricsEvent: SmartTransactionsControllerOptions['trackMetaMetricsEvent'];

  readonly #getMetaMetricsProps: () => Promise<MetaMetricsProps>;

  #getFeatureFlags: SmartTransactionsControllerOptions['getFeatureFlags'];

  #updateTransaction: SmartTransactionsControllerOptions['updateTransaction'];

  /* istanbul ignore next */
  async #fetch(request: string, options?: RequestInit) {
    const fetchOptions = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.#clientId && { 'X-Client-Id': this.#clientId }),
      },
    };

    return handleFetch(request, fetchOptions);
  }

  constructor({
    interval = DEFAULT_INTERVAL,
    clientId,
    chainId: InitialChainId = ChainId.mainnet,
    supportedChainIds = [ChainId.mainnet, ChainId.sepolia],
    getNonceLock,
    confirmExternalTransaction,
    trackMetaMetricsEvent,
    state = {},
    messenger,
    getTransactions,
    getMetaMetricsProps,
    getFeatureFlags,
    updateTransaction,
  }: SmartTransactionsControllerOptions) {
    super({
      name: controllerName,
      metadata: controllerMetadata,
      messenger,
      state: {
        ...getDefaultSmartTransactionsControllerState(),
        ...state,
      },
    });
    this.#interval = interval;
    this.#clientId = clientId;
    this.#chainId = InitialChainId;
    this.#supportedChainIds = supportedChainIds;
    this.setIntervalLength(interval);
    this.#getNonceLock = getNonceLock;
    this.#ethQuery = undefined;
    this.#confirmExternalTransaction = confirmExternalTransaction;
    this.#getRegularTransactions = getTransactions;
    this.#trackMetaMetricsEvent = trackMetaMetricsEvent;
    this.#getMetaMetricsProps = getMetaMetricsProps;
    this.#getFeatureFlags = getFeatureFlags;
    this.#updateTransaction = updateTransaction;

    this.initializeSmartTransactionsForChainId();

    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      ({ selectedNetworkClientId }) => {
        const {
          configuration: { chainId },
          provider,
        } = this.messagingSystem.call(
          'NetworkController:getNetworkClientById',
          selectedNetworkClientId,
        );
        this.#chainId = chainId;
        this.#ethQuery = new EthQuery(provider);
        this.initializeSmartTransactionsForChainId();
        this.checkPoll(this.state);
      },
    );

    this.messagingSystem.subscribe(
      `${controllerName}:stateChange`,
      (currentState) => this.checkPoll(currentState),
    );
  }

  async _executePoll({
    chainIds,
  }: SmartTransactionsControllerPollingInput): Promise<void> {
    // if this is going to be truly UI driven polling we shouldn't really reach here
    // with a networkClientId that is not supported, but for now I'll add a check in case
    // wondering if we should add some kind of predicate to the polling controller to check whether
    // we should poll or not
    const filteredChainIds = (chainIds ?? []).filter((chainId) =>
      this.#supportedChainIds.includes(chainId),
    );

    if (filteredChainIds.length === 0) {
      return Promise.resolve();
    }
    return this.updateSmartTransactions({ chainIds: filteredChainIds });
  }

  checkPoll({
    smartTransactionsState: { smartTransactions },
  }: SmartTransactionsControllerState) {
    const smartTransactionsForAllChains =
      Object.values(smartTransactions).flat();

    const pendingTransactions = smartTransactionsForAllChains?.filter(
      isSmartTransactionPending,
    );
    if (!this.timeoutHandle && pendingTransactions?.length > 0) {
      this.poll();
    } else if (this.timeoutHandle && pendingTransactions?.length === 0) {
      this.stop();
    }
  }

  initializeSmartTransactionsForChainId() {
    if (this.#supportedChainIds.includes(this.#chainId)) {
      this.update((state) => {
        state.smartTransactionsState.smartTransactions[this.#chainId] =
          state.smartTransactionsState.smartTransactions[this.#chainId] ?? [];
      });
    }
  }

  async poll(interval?: number): Promise<void> {
    if (interval) {
      this.#interval = interval;
    }

    this.timeoutHandle && clearInterval(this.timeoutHandle);

    if (!this.#supportedChainIds.includes(this.#chainId)) {
      return;
    }

    this.timeoutHandle = setInterval(() => {
      safelyExecute(async () => this.updateSmartTransactions());
    }, this.#interval);
    await safelyExecute(async () => this.updateSmartTransactions());
  }

  async stop() {
    this.timeoutHandle && clearInterval(this.timeoutHandle);
    this.timeoutHandle = undefined;
  }

  setOptInState(optInState: boolean | null): void {
    this.update((state) => {
      state.smartTransactionsState.userOptInV2 = optInState;
    });
  }

  trackStxStatusChange(
    smartTransaction: SmartTransaction,
    prevSmartTransaction?: SmartTransaction,
  ) {
    let updatedSmartTransaction = cloneDeep(smartTransaction);
    updatedSmartTransaction = {
      ...cloneDeep(prevSmartTransaction),
      ...updatedSmartTransaction,
    };

    if (updatedSmartTransaction.status === prevSmartTransaction?.status) {
      return; // If status hasn't changed, don't track it again.
    }

    this.#trackMetaMetricsEvent({
      event: MetaMetricsEventName.StxStatusUpdated,
      category: MetaMetricsEventCategory.Transactions,
      properties: getSmartTransactionMetricsProperties(updatedSmartTransaction),
      sensitiveProperties: getSmartTransactionMetricsSensitiveProperties(
        updatedSmartTransaction,
      ),
    });
  }

  isNewSmartTransaction(smartTransactionUuid: string, chainId?: Hex): boolean {
    const {
      smartTransactionsState: { smartTransactions },
    } = this.state;
    const currentSmartTransactions =
      smartTransactions[chainId ?? this.#chainId];
    const currentIndex = currentSmartTransactions?.findIndex(
      (stx) => stx.uuid === smartTransactionUuid,
    );
    return currentIndex === -1 || currentIndex === undefined;
  }

  updateSmartTransaction(
    smartTransaction: SmartTransaction,
    { networkClientId }: { networkClientId?: NetworkClientId } = {},
  ) {
    let ethQuery = this.#ethQuery;
    let chainId = this.#chainId;
    if (networkClientId) {
      const { configuration, provider } = this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
      );
      chainId = configuration.chainId;
      ethQuery = new EthQuery(provider);
    }

    this.#createOrUpdateSmartTransaction(smartTransaction, {
      chainId,
      ethQuery,
    });
  }

  #updateSmartTransaction(
    smartTransaction: SmartTransaction,
    {
      chainId = this.#chainId,
    }: {
      chainId: Hex;
    },
  ) {
    const {
      smartTransactionsState: { smartTransactions },
    } = this.state;
    const currentSmartTransactions = smartTransactions[chainId] ?? [];
    const currentIndex = currentSmartTransactions?.findIndex(
      (stx) => stx.uuid === smartTransaction.uuid,
    );

    if (currentIndex === -1) {
      return; // Smart transaction not found, don't update anything.
    }

    if (!isSafeDynamicKey(chainId)) {
      return;
    }

    this.update((state) => {
      state.smartTransactionsState.smartTransactions[chainId][currentIndex] = {
        ...state.smartTransactionsState.smartTransactions[chainId][
          currentIndex
        ],
        ...smartTransaction,
      };
    });
  }

  async #addMetaMetricsPropsToNewSmartTransaction(
    smartTransaction: SmartTransaction,
  ) {
    const metaMetricsProps = await this.#getMetaMetricsProps();
    smartTransaction.accountHardwareType =
      metaMetricsProps?.accountHardwareType;
    smartTransaction.accountType = metaMetricsProps?.accountType;
    smartTransaction.deviceModel = metaMetricsProps?.deviceModel;
  }

  async #createOrUpdateSmartTransaction(
    smartTransaction: SmartTransaction,
    {
      chainId = this.#chainId,
      ethQuery = this.#ethQuery,
    }: {
      chainId: Hex;
      ethQuery: EthQuery | undefined;
    },
  ): Promise<void> {
    const {
      smartTransactionsState: { smartTransactions },
    } = this.state;
    const currentSmartTransactions = smartTransactions[chainId] ?? [];
    const currentIndex = currentSmartTransactions?.findIndex(
      (stx) => stx.uuid === smartTransaction.uuid,
    );
    const isNewSmartTransaction = this.isNewSmartTransaction(
      smartTransaction.uuid,
      chainId,
    );
    if (ethQuery === undefined) {
      throw new Error(ETH_QUERY_ERROR_MSG);
    }

    if (isNewSmartTransaction) {
      try {
        await this.#addMetaMetricsPropsToNewSmartTransaction(smartTransaction);
      } catch (error) {
        console.error(
          'Failed to add metrics props to smart transaction:',
          error,
        );
        // Continue without metrics props
      }
    }

    this.trackStxStatusChange(
      smartTransaction,
      isNewSmartTransaction
        ? undefined
        : currentSmartTransactions[currentIndex],
    );

    if (isNewSmartTransaction) {
      // add smart transaction
      const cancelledNonceIndex = currentSmartTransactions?.findIndex(
        (stx: SmartTransaction) =>
          stx.txParams?.nonce === smartTransaction.txParams?.nonce &&
          stx.status?.startsWith('cancelled'),
      );
      const snapshot = cloneDeep(smartTransaction);
      const history = [snapshot];
      const historifiedSmartTransaction = { ...smartTransaction, history };
      const nextSmartTransactions =
        cancelledNonceIndex > -1
          ? currentSmartTransactions
              .slice(0, cancelledNonceIndex)
              .concat(currentSmartTransactions.slice(cancelledNonceIndex + 1))
              .concat(historifiedSmartTransaction)
          : currentSmartTransactions.concat(historifiedSmartTransaction);

      this.update((state) => {
        state.smartTransactionsState.smartTransactions[chainId] =
          nextSmartTransactions;
      });
      return;
    }

    const currentSmartTransaction = currentSmartTransactions[currentIndex];
    const nextSmartTransaction = {
      ...currentSmartTransaction,
      ...smartTransaction,
    };

    // We have to emit this event here, because then a txHash is returned to the TransactionController once it's available
    // and the #doesTransactionNeedConfirmation function will work properly, since it will find the txHash in the regular transactions list.
    this.messagingSystem.publish(
      `SmartTransactionsController:smartTransaction`,
      nextSmartTransaction,
    );

    if (
      shouldMarkRegularTransactionAsFailed({
        smartTransaction: nextSmartTransaction,
        clientId: this.#clientId,
        getFeatureFlags: this.#getFeatureFlags,
      })
    ) {
      markRegularTransactionAsFailed({
        smartTransaction: nextSmartTransaction,
        getRegularTransactions: this.#getRegularTransactions,
        updateTransaction: this.#updateTransaction,
      });
    }

    if (
      (smartTransaction.status === SmartTransactionStatuses.SUCCESS ||
        smartTransaction.status === SmartTransactionStatuses.REVERTED) &&
      !smartTransaction.confirmed
    ) {
      await this.#confirmSmartTransaction(nextSmartTransaction, {
        chainId,
        ethQuery,
      });
    } else {
      this.#updateSmartTransaction(smartTransaction, {
        chainId,
      });
    }
  }

  async updateSmartTransactions(
    {
      chainIds,
    }: {
      chainIds: Hex[];
    } = {
      chainIds: this.#getChainIds(),
    },
  ): Promise<void> {
    const {
      smartTransactionsState: { smartTransactions },
    } = this.state;

    // Iterate over each chain group directly
    for (const [chainId, transactions] of Object.entries(smartTransactions)) {
      if (chainIds && !chainIds.includes(chainId as Hex)) {
        continue;
      }
      // Filter pending transactions and map them to the desired shape
      const pendingTransactions = transactions
        .filter(isSmartTransactionPending)
        .map((pendingSmartTransaction) => {
          // Use the transaction's chainId (from the key) to derive a networkClientId
          const networkClientIdToUse = this.#getNetworkClientId({
            chainId: chainId as Hex,
          });
          return {
            uuid: pendingSmartTransaction.uuid,
            networkClientId: networkClientIdToUse,
            chainId: pendingSmartTransaction.chainId as Hex, // same as the key, but explicit on the transaction
          };
        });

      if (pendingTransactions.length > 0) {
        // Since each group is per chain, all transactions share the same chainId.
        await this.fetchSmartTransactionsStatus(pendingTransactions);
      }
    }
  }

  #doesTransactionNeedConfirmation(txHash: string | undefined): boolean {
    if (!txHash) {
      return true;
    }
    const transactions = this.#getRegularTransactions();
    const foundTransaction = transactions?.find((tx) => {
      return tx.hash?.toLowerCase() === txHash.toLowerCase();
    });
    if (!foundTransaction) {
      return true;
    }
    // If a found transaction is either confirmed or submitted, it doesn't need confirmation from the STX controller.
    // When it's in the submitted state, the TransactionController checks its status and confirms it,
    // so no need to confirm it again here.
    return ![TransactionStatus.confirmed, TransactionStatus.submitted].includes(
      foundTransaction.status,
    );
  }

  async #confirmSmartTransaction(
    smartTransaction: SmartTransaction,
    {
      chainId = this.#chainId,
      ethQuery = this.#ethQuery,
    }: {
      chainId: Hex;
      ethQuery: EthQuery | undefined;
    },
  ) {
    if (ethQuery === undefined) {
      throw new Error(ETH_QUERY_ERROR_MSG);
    }
    const txHash = smartTransaction.statusMetadata?.minedHash;
    try {
      const transactionReceipt: {
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
        blockNumber: string;
      } | null = await query(ethQuery, 'getTransactionReceipt', [txHash]);
      const transaction: {
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
      } | null = await query(ethQuery, 'getTransactionByHash', [txHash]);

      const maxFeePerGas = transaction?.maxFeePerGas;
      const maxPriorityFeePerGas = transaction?.maxPriorityFeePerGas;
      if (transactionReceipt?.blockNumber) {
        const blockData: { baseFeePerGas?: Hex } | null = await query(
          ethQuery,
          'getBlockByNumber',
          [transactionReceipt?.blockNumber, false],
        );
        const baseFeePerGas = blockData?.baseFeePerGas;
        const updatedTxParams = {
          ...smartTransaction.txParams,
          maxFeePerGas,
          maxPriorityFeePerGas,
        };
        // call confirmExternalTransaction
        const originalTxMeta = {
          ...smartTransaction,
          id: smartTransaction.uuid,
          status: TransactionStatus.confirmed,
          hash: txHash,
          txParams: updatedTxParams,
        };
        // create txMeta snapshot for history
        const snapshot = snapshotFromTxMeta(originalTxMeta);
        // recover previous tx state obj
        const previousState = replayHistory(originalTxMeta.history);
        // generate history entry and add to history
        const entry = generateHistoryEntry(
          previousState,
          snapshot,
          'txStateManager: setting status to confirmed',
        );
        const txMeta =
          entry.length > 0
            ? {
                ...originalTxMeta,
                history: originalTxMeta.history.concat(entry),
              }
            : originalTxMeta;

        if (this.#doesTransactionNeedConfirmation(txHash)) {
          this.#confirmExternalTransaction(
            // TODO: Replace 'as' assertion with correct typing for `txMeta`
            txMeta as TransactionMeta,
            transactionReceipt,
            // TODO: Replace 'as' assertion with correct typing for `baseFeePerGas`
            baseFeePerGas as Hex,
          );
        }
        this.#trackMetaMetricsEvent({
          event: MetaMetricsEventName.StxConfirmed,
          category: MetaMetricsEventCategory.Transactions,
          properties: getSmartTransactionMetricsProperties(smartTransaction),
          sensitiveProperties:
            getSmartTransactionMetricsSensitiveProperties(smartTransaction),
        });
        this.#updateSmartTransaction(
          { ...smartTransaction, confirmed: true },
          {
            chainId,
          },
        );
      }
    } catch (error) {
      this.#trackMetaMetricsEvent({
        event: MetaMetricsEventName.StxConfirmationFailed,
        category: MetaMetricsEventCategory.Transactions,
      });
      console.error('confirm error', error);
    } finally {
      this.messagingSystem.publish(
        `SmartTransactionsController:smartTransactionConfirmationDone`,
        smartTransaction,
      );
    }
  }

  // ! Ask backend API to accept list of uuids as params
  async fetchSmartTransactionsStatus(
    transactions: {
      uuid: string;
      networkClientId?: NetworkClientId;
      chainId: Hex;
    }[],
  ): Promise<Record<string, SmartTransactionsStatus>> {
    // Since transactions come from the same chain group, take the chainId from the first one.
    const { chainId } = transactions[0];

    // Build query parameters with all UUIDs
    const uuids = transactions.map((tx) => tx.uuid);
    const params = new URLSearchParams({ uuids: uuids.join(',') });

    // Get the ethQuery for the first transaction's networkClientId
    const ethQuery = this.#getEthQuery({
      networkClientId: transactions[0].networkClientId,
    });

    // Construct the URL and fetch the data
    const url = `${getAPIRequestURL(
      APIType.BATCH_STATUS,
      chainId,
    )}?${params.toString()}`;
    const data = (await this.#fetch(url)) as Record<
      string,
      SmartTransactionsStatus
    >;

    // Process each returned status
    for (const [uuid, stxStatus] of Object.entries(data)) {
      const matchingTx = transactions.find((tx) => tx.uuid === uuid);
      if (!matchingTx) {
        console.error(`No matching transaction found for uuid: ${uuid}`);
        continue;
      }

      const smartTransaction: SmartTransaction = {
        statusMetadata: stxStatus,
        status: calculateStatus(stxStatus),
        cancellable: isSmartTransactionCancellable(stxStatus),
        uuid,
        networkClientId: matchingTx.networkClientId,
      };

      await this.#createOrUpdateSmartTransaction(smartTransaction, {
        chainId,
        ethQuery,
      });
    }

    return data;
  }

  async #addNonceToTransaction(
    transaction: UnsignedTransaction,
    networkClientId: NetworkClientId,
  ): Promise<UnsignedTransaction> {
    const nonceLock = await this.#getNonceLock(
      transaction.from,
      networkClientId,
    );
    const nonce = nonceLock.nextNonce;
    nonceLock.releaseLock();
    return {
      ...transaction,
      nonce: `0x${nonce.toString(16)}`,
    };
  }

  clearFees(): Fees {
    const fees = {
      approvalTxFees: null,
      tradeTxFees: null,
    };
    this.update((state) => {
      state.smartTransactionsState.fees = fees;
    });

    return fees;
  }

  async getFees(
    tradeTx: UnsignedTransaction,
    approvalTx?: UnsignedTransaction,
    { networkClientId }: { networkClientId?: NetworkClientId } = {},
  ): Promise<Fees> {
    const selectedNetworkClientId =
      networkClientId ??
      this.messagingSystem.call('NetworkController:getState')
        .selectedNetworkClientId;
    const chainId = this.#getChainId({
      networkClientId: selectedNetworkClientId,
    });
    const transactions = [];
    let unsignedTradeTransactionWithNonce;
    if (approvalTx) {
      const unsignedApprovalTransactionWithNonce =
        await this.#addNonceToTransaction(approvalTx, selectedNetworkClientId);
      transactions.push(unsignedApprovalTransactionWithNonce);
      unsignedTradeTransactionWithNonce = {
        ...tradeTx,
        // If there is an approval tx, the trade tx's nonce is increased by 1.
        nonce: incrementNonceInHex(unsignedApprovalTransactionWithNonce.nonce),
      };
    } else if (tradeTx.nonce) {
      unsignedTradeTransactionWithNonce = tradeTx;
    } else {
      unsignedTradeTransactionWithNonce = await this.#addNonceToTransaction(
        tradeTx,
        selectedNetworkClientId,
      );
    }
    transactions.push(unsignedTradeTransactionWithNonce);
    const data = await this.#fetch(
      getAPIRequestURL(APIType.GET_FEES, chainId),
      {
        method: 'POST',
        body: JSON.stringify({
          txs: transactions,
        }),
      },
    );
    let approvalTxFees: IndividualTxFees | null;
    let tradeTxFees: IndividualTxFees | null;
    if (approvalTx) {
      approvalTxFees = data?.txs[0];
      tradeTxFees = data?.txs[1];
    } else {
      approvalTxFees = null;
      tradeTxFees = data?.txs[0];
    }

    this.update((state) => {
      if (chainId === this.#chainId) {
        state.smartTransactionsState.fees = {
          approvalTxFees,
          tradeTxFees,
        };
      }
      state.smartTransactionsState.feesByChainId[chainId] = {
        approvalTxFees,
        tradeTxFees,
      };
    });

    return {
      approvalTxFees,
      tradeTxFees,
    };
  }

  // * After this successful call client must add a nonce representative to
  // * transaction controller external transactions list
  async submitSignedTransactions({
    transactionMeta,
    txParams,
    signedTransactions,
    signedCanceledTransactions = [],
    networkClientId,
  }: {
    signedTransactions: SignedTransaction[];
    signedCanceledTransactions?: SignedCanceledTransaction[];
    transactionMeta?: TransactionMeta;
    txParams?: TransactionParams;
    networkClientId?: NetworkClientId;
  }) {
    const selectedNetworkClientId =
      networkClientId ??
      this.messagingSystem.call('NetworkController:getState')
        .selectedNetworkClientId;
    const chainId = this.#getChainId({
      networkClientId: selectedNetworkClientId,
    });
    const ethQuery = this.#getEthQuery({
      networkClientId: selectedNetworkClientId,
    });
    const data = await this.#fetch(
      getAPIRequestURL(APIType.SUBMIT_TRANSACTIONS, chainId),
      {
        method: 'POST',
        body: JSON.stringify({
          rawTxs: signedTransactions,
          rawCancelTxs: signedCanceledTransactions,
        }),
      },
    );
    const time = Date.now();
    let preTxBalance;
    try {
      if (txParams?.from) {
        const preTxBalanceBN = await query(ethQuery, 'getBalance', [
          txParams.from,
        ]);
        preTxBalance = new BigNumber(preTxBalanceBN).toString(16);
      }
    } catch (error) {
      console.error('ethQuery.getBalance error:', error);
    }

    const requiresNonce = txParams && !txParams.nonce;
    let nonce;
    let nonceLock;
    let nonceDetails = {};

    // This should only happen for Swaps. Non-swaps transactions should already have a nonce
    if (requiresNonce) {
      try {
        nonceLock = await this.#getNonceLock(
          txParams.from,
          selectedNetworkClientId,
        );
        nonce = hexlify(nonceLock.nextNonce);
        nonceDetails = nonceLock.nonceDetails;
        txParams.nonce ??= nonce;
      } catch (error) {
        console.error('Failed to acquire nonce lock:', error);
        throw error;
      }
    }

    const txHashes = signedTransactions.map((tx) => getTxHash(tx));
    const submitTransactionResponse = {
      ...data,
      txHash: txHashes[txHashes.length - 1], // For backward compatibility - use the last tx hash
      txHashes,
    };

    try {
      await this.#createOrUpdateSmartTransaction(
        {
          chainId,
          nonceDetails,
          preTxBalance,
          status: SmartTransactionStatuses.PENDING,
          time,
          txParams,
          uuid: submitTransactionResponse.uuid,
          txHash: submitTransactionResponse.txHash,
          cancellable: true,
          type: transactionMeta?.type ?? 'swap',
          transactionId: transactionMeta?.id,
          networkClientId: selectedNetworkClientId,
          txHashes, // Add support for multiple transaction hashes
        },
        { chainId, ethQuery },
      );
    } catch (error) {
      console.error('Failed to create a smart transaction:', error);
      throw error;
    } finally {
      if (nonceLock) {
        nonceLock.releaseLock();
      }
    }

    return submitTransactionResponse;
  }

  #getChainId({
    networkClientId,
  }: { networkClientId?: NetworkClientId } = {}): Hex {
    if (networkClientId) {
      return this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
      ).configuration.chainId;
    }

    return this.#chainId;
  }

  #getChainIds(): Hex[] {
    const { networkConfigurationsByChainId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    return Object.keys(networkConfigurationsByChainId).filter(
      (chainId): chainId is Hex =>
        this.#supportedChainIds.includes(chainId as Hex),
    );
  }

  #getNetworkClientId({ chainId }: { chainId: string }): string {
    const { networkConfigurationsByChainId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    return networkConfigurationsByChainId[chainId as Hex].rpcEndpoints[
      networkConfigurationsByChainId[chainId as Hex].defaultRpcEndpointIndex
    ].networkClientId;
  }

  #getEthQuery({
    networkClientId,
  }: {
    networkClientId?: NetworkClientId;
  } = {}): EthQuery {
    if (networkClientId) {
      const { provider } = this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
      );
      return new EthQuery(provider);
    }

    if (this.#ethQuery === undefined) {
      throw new Error(ETH_QUERY_ERROR_MSG);
    }

    return this.#ethQuery;
  }

  // TODO: This should return if the cancellation was on chain or not (for nonce management)
  // After this successful call client must update nonce representative
  // in transaction controller external transactions list
  async cancelSmartTransaction(
    uuid: string,
    {
      networkClientId,
    }: {
      networkClientId?: NetworkClientId;
    } = {},
  ): Promise<void> {
    const chainId = this.#getChainId({ networkClientId });
    await this.#fetch(getAPIRequestURL(APIType.CANCEL, chainId), {
      method: 'POST',
      body: JSON.stringify({ uuid }),
    });
  }

  async fetchLiveness({
    networkClientId,
  }: {
    networkClientId?: NetworkClientId;
  } = {}): Promise<boolean> {
    const chainId = this.#getChainId({ networkClientId });
    let liveness = false;
    try {
      const response = await this.#fetch(
        getAPIRequestURL(APIType.LIVENESS, chainId),
      );
      liveness = Boolean(response.smartTransactions);
    } catch (error) {
      console.log('"fetchLiveness" API call failed');
    }

    this.update((state) => {
      if (chainId === this.#chainId) {
        state.smartTransactionsState.liveness = liveness;
      }
      state.smartTransactionsState.livenessByChainId[chainId] = liveness;
    });

    return liveness;
  }

  async setStatusRefreshInterval(interval: number): Promise<void> {
    if (interval !== this.#interval) {
      this.#interval = interval;
    }
  }

  #getCurrentSmartTransactions(): SmartTransaction[] {
    const {
      smartTransactionsState: { smartTransactions },
    } = this.state;
    const smartTransactionsForAllChains =
      Object.values(smartTransactions).flat();
    if (
      !smartTransactionsForAllChains ||
      smartTransactionsForAllChains.length === 0
    ) {
      return [];
    }
    return smartTransactionsForAllChains;
  }

  getTransactions({
    addressFrom,
    status,
  }: {
    addressFrom: string;
    status: SmartTransactionStatuses;
  }): SmartTransaction[] {
    const currentSmartTransactions = this.#getCurrentSmartTransactions();
    return currentSmartTransactions.filter((stx) => {
      return stx.status === status && stx.txParams?.from === addressFrom;
    });
  }

  getSmartTransactionByMinedTxHash(
    txHash: string | undefined,
  ): SmartTransaction | undefined {
    if (!txHash) {
      return undefined;
    }
    const currentSmartTransactions = this.#getCurrentSmartTransactions();
    return currentSmartTransactions.find((smartTransaction) => {
      return (
        smartTransaction.statusMetadata?.minedHash?.toLowerCase() ===
        txHash.toLowerCase()
      );
    });
  }

  wipeSmartTransactions({
    address,
    ignoreNetwork,
  }: {
    address: string;
    ignoreNetwork?: boolean;
  }): void {
    if (!address) {
      return;
    }
    const addressLowerCase = address.toLowerCase();
    if (ignoreNetwork) {
      const {
        smartTransactionsState: { smartTransactions },
      } = this.state;
      (Object.keys(smartTransactions) as Hex[]).forEach((chainId) => {
        this.#wipeSmartTransactionsPerChainId({
          chainId,
          addressLowerCase,
        });
      });
    } else {
      this.#wipeSmartTransactionsPerChainId({
        chainId: this.#chainId,
        addressLowerCase,
      });
    }
  }

  #wipeSmartTransactionsPerChainId({
    chainId,
    addressLowerCase,
  }: {
    chainId: Hex;
    addressLowerCase: string;
  }): void {
    const {
      smartTransactionsState: { smartTransactions },
    } = this.state;
    const smartTransactionsForSelectedChain: SmartTransaction[] =
      smartTransactions?.[chainId];
    if (
      !smartTransactionsForSelectedChain ||
      smartTransactionsForSelectedChain.length === 0
    ) {
      return;
    }
    const newSmartTransactionsForSelectedChain =
      smartTransactionsForSelectedChain.filter(
        (smartTransaction: SmartTransaction) =>
          smartTransaction.txParams?.from !== addressLowerCase,
      );
    this.update((state) => {
      state.smartTransactionsState.smartTransactions[chainId] =
        newSmartTransactionsForSelectedChain;
    });
  }
}
