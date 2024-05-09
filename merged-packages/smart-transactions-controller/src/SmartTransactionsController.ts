// eslint-disable-next-line import/no-nodejs-modules
import { hexlify } from '@ethersproject/bytes';
import type { BaseConfig, BaseState } from '@metamask/base-controller';
import { query, safelyExecute, ChainId } from '@metamask/controller-utils';
import type { Provider } from '@metamask/eth-query';
import EthQuery from '@metamask/eth-query';
import type {
  NetworkClientId,
  NetworkController,
  NetworkState,
} from '@metamask/network-controller';
import { StaticIntervalPollingControllerV1 } from '@metamask/polling-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionStatus } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';
// eslint-disable-next-line import/no-nodejs-modules
import EventEmitter from 'events';
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
} from './types';
import { APIType, SmartTransactionStatuses } from './types';
import {
  calculateStatus,
  generateHistoryEntry,
  getAPIRequestURL,
  getStxProcessingTime,
  handleFetch,
  incrementNonceInHex,
  isSmartTransactionCancellable,
  isSmartTransactionPending,
  replayHistory,
  snapshotFromTxMeta,
  getTxHash,
} from './utils';

const SECOND = 1000;
export const DEFAULT_INTERVAL = SECOND * 5;
const ETH_QUERY_ERROR_MSG =
  '`ethQuery` is not defined on SmartTransactionsController';

export type SmartTransactionsControllerConfig = BaseConfig & {
  interval: number;
  clientId: string;
  chainId: Hex;
  supportedChainIds: Hex[];
};

type FeeEstimates = {
  approvalTxFees: IndividualTxFees | undefined;
  tradeTxFees: IndividualTxFees | undefined;
};

export type SmartTransactionsControllerState = BaseState & {
  smartTransactionsState: {
    smartTransactions: Record<Hex, SmartTransaction[]>;
    userOptIn: boolean | undefined;
    userOptInV2: boolean | undefined;
    liveness: boolean | undefined;
    fees: FeeEstimates;
    feesByChainId: Record<Hex, FeeEstimates>;
    livenessByChainId: Record<Hex, boolean>;
  };
};

export default class SmartTransactionsController extends StaticIntervalPollingControllerV1<
  SmartTransactionsControllerConfig,
  SmartTransactionsControllerState
> {
  /**
   * Name of this controller used during composition
   */
  override name = 'SmartTransactionsController';

  public timeoutHandle?: NodeJS.Timeout;

  private readonly getNonceLock: any;

  private ethQuery: EthQuery | undefined;

  public confirmExternalTransaction: any;

  public getRegularTransactions: (
    options?: GetTransactionsOptions,
  ) => TransactionMeta[];

  private readonly trackMetaMetricsEvent: any;

  public eventEmitter: EventEmitter;

  private readonly getNetworkClientById: NetworkController['getNetworkClientById'];

  /* istanbul ignore next */
  private async fetch(request: string, options?: RequestInit) {
    const { clientId } = this.config;
    const fetchOptions = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(clientId && { 'X-Client-Id': clientId }),
      },
    };

    return handleFetch(request, fetchOptions);
  }

  constructor(
    {
      onNetworkStateChange,
      getNonceLock,
      provider,
      confirmExternalTransaction,
      getTransactions,
      trackMetaMetricsEvent,
      getNetworkClientById,
    }: {
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
      getNonceLock: any;
      provider: Provider;
      confirmExternalTransaction: any;
      getTransactions: (options?: GetTransactionsOptions) => TransactionMeta[];
      trackMetaMetricsEvent: any;
      getNetworkClientById: NetworkController['getNetworkClientById'];
    },
    config?: Partial<SmartTransactionsControllerConfig>,
    state?: Partial<SmartTransactionsControllerState>,
  ) {
    super(config, state);

    this.defaultConfig = {
      interval: DEFAULT_INTERVAL,
      chainId: ChainId.mainnet,
      clientId: 'default',
      supportedChainIds: [ChainId.mainnet, ChainId.sepolia],
    };

    this.defaultState = {
      smartTransactionsState: {
        smartTransactions: {},
        userOptIn: undefined,
        userOptInV2: undefined,
        fees: {
          approvalTxFees: undefined,
          tradeTxFees: undefined,
        },
        liveness: true,
        livenessByChainId: {
          [ChainId.mainnet]: true,
          [ChainId.sepolia]: true,
        },
        feesByChainId: {
          [ChainId.mainnet]: {
            approvalTxFees: undefined,
            tradeTxFees: undefined,
          },
          [ChainId.sepolia]: {
            approvalTxFees: undefined,
            tradeTxFees: undefined,
          },
        },
      },
    };

    this.initialize();
    this.setIntervalLength(this.config.interval);
    this.getNonceLock = getNonceLock;
    this.ethQuery = undefined;
    this.confirmExternalTransaction = confirmExternalTransaction;
    this.getRegularTransactions = getTransactions;
    this.trackMetaMetricsEvent = trackMetaMetricsEvent;
    this.getNetworkClientById = getNetworkClientById;

    this.initializeSmartTransactionsForChainId();

    onNetworkStateChange(({ providerConfig: newProvider }) => {
      const { chainId } = newProvider;
      this.configure({ chainId });
      this.initializeSmartTransactionsForChainId();
      this.checkPoll(this.state);
      this.ethQuery = new EthQuery(provider);
    });

    this.subscribe((currentState: any) => this.checkPoll(currentState));
    this.eventEmitter = new EventEmitter();
  }

  async _executePoll(networkClientId: string): Promise<void> {
    // if this is going to be truly UI driven polling we shouldn't really reach here
    // with a networkClientId that is not supported, but for now I'll add a check in case
    // wondering if we should add some kind of predicate to the polling controller to check whether
    // we should poll or not
    const chainId = this.#getChainId({ networkClientId });
    if (!this.config.supportedChainIds.includes(chainId)) {
      return Promise.resolve();
    }
    return this.updateSmartTransactions({ networkClientId });
  }

  checkPoll(state: any) {
    const { smartTransactions } = state.smartTransactionsState;
    const currentSmartTransactions = smartTransactions[this.config.chainId];
    const pendingTransactions = currentSmartTransactions?.filter(
      isSmartTransactionPending,
    );
    if (!this.timeoutHandle && pendingTransactions?.length > 0) {
      this.poll();
    } else if (this.timeoutHandle && pendingTransactions?.length === 0) {
      this.stop();
    }
  }

  initializeSmartTransactionsForChainId() {
    if (this.config.supportedChainIds.includes(this.config.chainId)) {
      const { smartTransactionsState } = this.state;
      this.update({
        smartTransactionsState: {
          ...smartTransactionsState,
          smartTransactions: {
            ...smartTransactionsState.smartTransactions,
            [this.config.chainId]:
              smartTransactionsState.smartTransactions[this.config.chainId] ??
              [],
          },
        },
      });
    }
  }

  async poll(interval?: number): Promise<void> {
    const { chainId, supportedChainIds } = this.config;
    interval && this.configure({ interval }, false, false);
    this.timeoutHandle && clearInterval(this.timeoutHandle);
    if (!supportedChainIds.includes(chainId)) {
      return;
    }
    await safelyExecute(async () => this.updateSmartTransactions());
    this.timeoutHandle = setInterval(() => {
      safelyExecute(async () => this.updateSmartTransactions());
    }, this.config.interval);
  }

  async stop() {
    this.timeoutHandle && clearInterval(this.timeoutHandle);
    this.timeoutHandle = undefined;
  }

  setOptInState(state: boolean | undefined): void {
    this.update({
      smartTransactionsState: {
        ...this.state.smartTransactionsState,
        userOptInV2: state,
      },
    });
  }

  trackStxStatusChange(
    smartTransaction: SmartTransaction,
    prevSmartTransaction?: SmartTransaction,
  ) {
    if (!prevSmartTransaction) {
      return; // Don't track the first STX, because it doesn't have all necessary params.
    }

    let updatedSmartTransaction = cloneDeep(smartTransaction);
    updatedSmartTransaction = {
      ...cloneDeep(prevSmartTransaction),
      ...updatedSmartTransaction,
    };

    if (
      !updatedSmartTransaction.swapMetaData ||
      (updatedSmartTransaction.status === prevSmartTransaction.status &&
        prevSmartTransaction.swapMetaData)
    ) {
      return; // If status hasn't changed, don't track it again.
    }

    const sensitiveProperties = {
      stx_status: updatedSmartTransaction.status,
      token_from_symbol: updatedSmartTransaction.sourceTokenSymbol,
      token_to_symbol: updatedSmartTransaction.destinationTokenSymbol,
      processing_time: getStxProcessingTime(updatedSmartTransaction.time),
      stx_enabled: true,
      current_stx_enabled: true,
      stx_user_opt_in: true,
    };

    this.trackMetaMetricsEvent({
      event: MetaMetricsEventName.StxStatusUpdated,
      category: MetaMetricsEventCategory.Transactions,
      sensitiveProperties,
    });
  }

  isNewSmartTransaction(smartTransactionUuid: string): boolean {
    const { chainId } = this.config;
    const { smartTransactionsState } = this.state;
    const { smartTransactions } = smartTransactionsState;
    const currentSmartTransactions = smartTransactions[chainId];
    const currentIndex = currentSmartTransactions?.findIndex(
      (stx) => stx.uuid === smartTransactionUuid,
    );
    return currentIndex === -1 || currentIndex === undefined;
  }

  updateSmartTransaction(
    smartTransaction: SmartTransaction,
    { networkClientId }: { networkClientId?: NetworkClientId } = {},
  ) {
    let {
      ethQuery,
      config: { chainId },
    } = this;
    if (networkClientId) {
      const networkClient = this.getNetworkClientById(networkClientId);
      chainId = networkClient.configuration.chainId;
      ethQuery = new EthQuery(networkClient.provider);
    }

    this.#updateSmartTransaction(smartTransaction, {
      chainId,
      ethQuery,
    });
  }

  async #updateSmartTransaction(
    smartTransaction: SmartTransaction,
    {
      chainId = this.config.chainId,
      ethQuery = this.ethQuery,
    }: {
      chainId: Hex;
      ethQuery: EthQuery | undefined;
    },
  ): Promise<void> {
    const { smartTransactionsState } = this.state;
    const { smartTransactions } = smartTransactionsState;
    const currentSmartTransactions = smartTransactions[chainId] ?? [];
    const currentIndex = currentSmartTransactions?.findIndex(
      (stx) => stx.uuid === smartTransaction.uuid,
    );
    const isNewSmartTransaction = this.isNewSmartTransaction(
      smartTransaction.uuid,
    );
    if (this.ethQuery === undefined) {
      throw new Error(ETH_QUERY_ERROR_MSG);
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
      this.update({
        smartTransactionsState: {
          ...smartTransactionsState,
          smartTransactions: {
            ...smartTransactionsState.smartTransactions,
            [chainId]: nextSmartTransactions,
          },
        },
      });
      return;
    }

    // We have to emit this event here, because then a txHash is returned to the TransactionController once it's available
    // and the #doesTransactionNeedConfirmation function will work properly, since it will find the txHash in the regular transactions list.
    this.eventEmitter.emit(
      `${smartTransaction.uuid}:smartTransaction`,
      smartTransaction,
    );

    if (
      (smartTransaction.status === SmartTransactionStatuses.SUCCESS ||
        smartTransaction.status === SmartTransactionStatuses.REVERTED) &&
      !smartTransaction.confirmed
    ) {
      // confirm smart transaction
      const currentSmartTransaction = currentSmartTransactions[currentIndex];
      const nextSmartTransaction = {
        ...currentSmartTransaction,
        ...smartTransaction,
      };
      await this.#confirmSmartTransaction(nextSmartTransaction, {
        chainId,
        ethQuery,
      });
    } else {
      this.update({
        smartTransactionsState: {
          ...smartTransactionsState,
          smartTransactions: {
            ...smartTransactionsState.smartTransactions,
            [chainId]: smartTransactionsState.smartTransactions[chainId].map(
              (item, index) => {
                return index === currentIndex
                  ? { ...item, ...smartTransaction }
                  : item;
              },
            ),
          },
        },
      });
    }
  }

  async updateSmartTransactions({
    networkClientId,
  }: {
    networkClientId?: NetworkClientId;
  } = {}): Promise<void> {
    const { smartTransactions } = this.state.smartTransactionsState;
    const chainId = this.#getChainId({ networkClientId });
    const smartTransactionsForChainId = smartTransactions[chainId];

    const transactionsToUpdate: string[] = smartTransactionsForChainId
      .filter(isSmartTransactionPending)
      .map((smartTransaction) => smartTransaction.uuid);

    if (transactionsToUpdate.length > 0) {
      this.fetchSmartTransactionsStatus(transactionsToUpdate, {
        networkClientId,
      });
    }
  }

  #doesTransactionNeedConfirmation(txHash: string | undefined): boolean {
    if (!txHash) {
      return true;
    }
    const transactions = this.getRegularTransactions();
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
      chainId = this.config.chainId,
      ethQuery = this.ethQuery,
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
        const blockData: { baseFeePerGas?: string } | null = await query(
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
          this.confirmExternalTransaction(
            txMeta,
            transactionReceipt,
            baseFeePerGas,
          );
        }

        this.trackMetaMetricsEvent({
          event: MetaMetricsEventName.StxConfirmed,
          category: MetaMetricsEventCategory.Transactions,
        });

        this.#updateSmartTransaction(
          {
            ...smartTransaction,
            confirmed: true,
          },
          { chainId, ethQuery },
        );
      }
    } catch (error) {
      this.trackMetaMetricsEvent({
        event: MetaMetricsEventName.StxConfirmationFailed,
        category: MetaMetricsEventCategory.Transactions,
      });
      console.error('confirm error', error);
    }
  }

  // ! Ask backend API to accept list of uuids as params
  async fetchSmartTransactionsStatus(
    uuids: string[],
    { networkClientId }: { networkClientId?: NetworkClientId } = {},
  ): Promise<Record<string, SmartTransactionsStatus>> {
    const params = new URLSearchParams({
      uuids: uuids.join(','),
    });
    const chainId = this.#getChainId({ networkClientId });
    const ethQuery = this.#getEthQuery({ networkClientId });
    const url = `${getAPIRequestURL(
      APIType.BATCH_STATUS,
      chainId,
    )}?${params.toString()}`;

    const data = (await this.fetch(url)) as Record<
      string,
      SmartTransactionsStatus
    >;

    Object.entries(data).forEach(([uuid, stxStatus]) => {
      const smartTransaction = {
        statusMetadata: stxStatus,
        status: calculateStatus(stxStatus),
        cancellable: isSmartTransactionCancellable(stxStatus),
        uuid,
      };
      this.#updateSmartTransaction(smartTransaction, { chainId, ethQuery });
    });

    return data;
  }

  async addNonceToTransaction(
    transaction: UnsignedTransaction,
  ): Promise<UnsignedTransaction> {
    const nonceLock = await this.getNonceLock(transaction.from);
    const nonce = nonceLock.nextNonce;
    nonceLock.releaseLock();
    return {
      ...transaction,
      nonce: `0x${nonce.toString(16)}`,
    };
  }

  clearFees(): Fees {
    const fees = {
      approvalTxFees: undefined,
      tradeTxFees: undefined,
    };
    this.update({
      smartTransactionsState: {
        ...this.state.smartTransactionsState,
        fees,
      },
    });
    return fees;
  }

  async getFees(
    tradeTx: UnsignedTransaction,
    approvalTx?: UnsignedTransaction,
    { networkClientId }: { networkClientId?: NetworkClientId } = {},
  ): Promise<Fees> {
    const chainId = this.#getChainId({ networkClientId });
    const transactions = [];
    let unsignedTradeTransactionWithNonce;
    if (approvalTx) {
      const unsignedApprovalTransactionWithNonce =
        await this.addNonceToTransaction(approvalTx);
      transactions.push(unsignedApprovalTransactionWithNonce);
      unsignedTradeTransactionWithNonce = {
        ...tradeTx,
        // If there is an approval tx, the trade tx's nonce is increased by 1.
        nonce: incrementNonceInHex(unsignedApprovalTransactionWithNonce.nonce),
      };
    } else if (tradeTx.nonce) {
      unsignedTradeTransactionWithNonce = tradeTx;
    } else {
      unsignedTradeTransactionWithNonce = await this.addNonceToTransaction(
        tradeTx,
      );
    }
    transactions.push(unsignedTradeTransactionWithNonce);
    const data = await this.fetch(getAPIRequestURL(APIType.GET_FEES, chainId), {
      method: 'POST',
      body: JSON.stringify({
        txs: transactions,
      }),
    });
    let approvalTxFees;
    let tradeTxFees;
    if (approvalTx) {
      approvalTxFees = data?.txs[0];
      tradeTxFees = data?.txs[1];
    } else {
      tradeTxFees = data?.txs[0];
    }

    this.update({
      smartTransactionsState: {
        ...this.state.smartTransactionsState,
        ...(chainId === this.config.chainId && {
          fees: {
            approvalTxFees,
            tradeTxFees,
          },
        }),
        feesByChainId: {
          ...this.state.smartTransactionsState.feesByChainId,
          [chainId]: {
            approvalTxFees,
            tradeTxFees,
          },
        },
      },
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
    signedCanceledTransactions,
    networkClientId,
  }: {
    signedTransactions: SignedTransaction[];
    signedCanceledTransactions: SignedCanceledTransaction[];
    transactionMeta?: any;
    txParams?: any;
    networkClientId?: NetworkClientId;
  }) {
    const chainId = this.#getChainId({ networkClientId });
    const ethQuery = this.#getEthQuery({ networkClientId });
    const data = await this.fetch(
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
      const preTxBalanceBN = await query(ethQuery, 'getBalance', [
        txParams?.from,
      ]);
      preTxBalance = new BigNumber(preTxBalanceBN).toString(16);
    } catch (error) {
      console.error('provider error', error);
    }

    const requiresNonce = !txParams.nonce;
    let nonce;
    let nonceLock;
    let nonceDetails = {};

    if (requiresNonce) {
      nonceLock = await this.getNonceLock(txParams?.from);
      nonce = hexlify(nonceLock.nextNonce);
      nonceDetails = nonceLock.nonceDetails;
      if (txParams) {
        txParams.nonce ??= nonce;
      }
    }
    const submitTransactionResponse = {
      ...data,
      txHash: getTxHash(signedTransactions[0]),
    };

    try {
      this.#updateSmartTransaction(
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
          type: transactionMeta?.type || 'swap',
        },
        { chainId, ethQuery },
      );
    } finally {
      nonceLock?.releaseLock();
    }

    return submitTransactionResponse;
  }

  #getChainId({
    networkClientId,
  }: { networkClientId?: NetworkClientId } = {}): Hex {
    return networkClientId
      ? this.getNetworkClientById(networkClientId).configuration.chainId
      : this.config.chainId;
  }

  #getEthQuery({
    networkClientId,
  }: {
    networkClientId?: NetworkClientId;
  } = {}): EthQuery {
    if (networkClientId) {
      return new EthQuery(this.getNetworkClientById(networkClientId).provider);
    }

    if (this.ethQuery === undefined) {
      throw new Error(ETH_QUERY_ERROR_MSG);
    }

    return this.ethQuery;
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
    await this.fetch(getAPIRequestURL(APIType.CANCEL, chainId), {
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
      const response = await this.fetch(
        getAPIRequestURL(APIType.LIVENESS, chainId),
      );
      liveness = Boolean(response.lastBlock);
    } catch (error) {
      console.log('"fetchLiveness" API call failed');
    }

    this.update({
      smartTransactionsState: {
        ...this.state.smartTransactionsState,
        ...(chainId === this.config.chainId && { liveness }),
        livenessByChainId: {
          ...this.state.smartTransactionsState.livenessByChainId,
          [chainId]: liveness,
        },
      },
    });

    return liveness;
  }

  async setStatusRefreshInterval(interval: number): Promise<void> {
    if (interval !== this.config.interval) {
      this.configure({ interval }, false, false);
    }
  }

  #getCurrentSmartTransactions(): SmartTransaction[] {
    const { smartTransactions } = this.state.smartTransactionsState;
    const { chainId } = this.config;
    const currentSmartTransactions = smartTransactions?.[chainId];
    if (!currentSmartTransactions || currentSmartTransactions.length === 0) {
      return [];
    }
    return currentSmartTransactions;
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
      const { smartTransactions } = this.state.smartTransactionsState;
      Object.keys(smartTransactions).forEach((chainId) => {
        const chainIdHex: Hex = chainId as Hex;
        this.#wipeSmartTransactionsPerChainId({
          chainId: chainIdHex,
          addressLowerCase,
        });
      });
    } else {
      this.#wipeSmartTransactionsPerChainId({
        chainId: this.config.chainId,
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
    const { smartTransactions } = this.state.smartTransactionsState;
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
    this.update({
      smartTransactionsState: {
        ...this.state.smartTransactionsState,
        smartTransactions: {
          ...smartTransactions,
          [chainId]: newSmartTransactionsForSelectedChain,
        },
      },
    });
  }
}
