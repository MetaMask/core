import { BaseConfig, BaseState } from '@metamask/base-controller';
import { safelyExecute, query } from '@metamask/controller-utils';
import {
  NetworkState,
  NetworkController,
  NetworkClientId,
} from '@metamask/network-controller';
import EthQuery, { Provider } from '@metamask/eth-query';
import { StaticIntervalPollingControllerV1 } from '@metamask/polling-controller';
import { BigNumber } from 'bignumber.js';
import { hexlify } from '@ethersproject/bytes';
import cloneDeep from 'lodash/cloneDeep';
import {
  APIType,
  SmartTransaction,
  SignedTransaction,
  SignedCanceledTransaction,
  UnsignedTransaction,
  SmartTransactionsStatus,
  SmartTransactionStatuses,
  Fees,
  IndividualTxFees,
  Hex,
} from './types';
import {
  getAPIRequestURL,
  isSmartTransactionPending,
  calculateStatus,
  snapshotFromTxMeta,
  replayHistory,
  generateHistoryEntry,
  getStxProcessingTime,
  handleFetch,
  isSmartTransactionCancellable,
  incrementNonceInHex,
} from './utils';
import { CHAIN_IDS } from './constants';

const SECOND = 1000;
export const DEFAULT_INTERVAL = SECOND * 5;

export type SmartTransactionsControllerConfig = BaseConfig & {
  interval: number;
  clientId: string;
  chainId: Hex;
  supportedChainIds: string[];
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
  public timeoutHandle?: NodeJS.Timeout;

  private getNonceLock: any;

  private ethQuery: EthQuery;

  public confirmExternalTransaction: any;

  private trackMetaMetricsEvent: any;

  private getNetworkClientById: NetworkController['getNetworkClientById'];

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
      trackMetaMetricsEvent,
      getNetworkClientById,
    }: {
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
      getNonceLock: any;
      provider: Provider;
      confirmExternalTransaction: any;
      trackMetaMetricsEvent: any;
      getNetworkClientById: NetworkController['getNetworkClientById'];
    },
    config?: Partial<SmartTransactionsControllerConfig>,
    state?: Partial<SmartTransactionsControllerState>,
  ) {
    super(config, state);

    this.defaultConfig = {
      interval: DEFAULT_INTERVAL,
      chainId: CHAIN_IDS.ETHEREUM,
      clientId: 'default',
      supportedChainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.GOERLI],
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
          [CHAIN_IDS.ETHEREUM]: true,
          [CHAIN_IDS.GOERLI]: true,
        },
        feesByChainId: {
          [CHAIN_IDS.ETHEREUM]: {
            approvalTxFees: undefined,
            tradeTxFees: undefined,
          },
          [CHAIN_IDS.GOERLI]: {
            approvalTxFees: undefined,
            tradeTxFees: undefined,
          },
        },
      },
    };

    this.initialize();
    this.setIntervalLength(this.config.interval);
    this.getNonceLock = getNonceLock;
    this.ethQuery = new EthQuery(provider);
    this.confirmExternalTransaction = confirmExternalTransaction;
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
  }

  _executePoll(networkClientId: string): Promise<void> {
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
    await safelyExecute(() => this.updateSmartTransactions());
    this.timeoutHandle = setInterval(() => {
      safelyExecute(() => this.updateSmartTransactions());
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
      event: 'STX Status Updated',
      category: 'swaps',
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

  #updateSmartTransaction(
    smartTransaction: SmartTransaction,
    {
      chainId = this.config.chainId,
      ethQuery = this.ethQuery,
    }: {
      chainId: Hex;
      ethQuery: EthQuery;
    },
  ): void {
    const { smartTransactionsState } = this.state;
    const { smartTransactions } = smartTransactionsState;
    const currentSmartTransactions = smartTransactions[chainId];
    const currentIndex = currentSmartTransactions?.findIndex(
      (stx) => stx.uuid === smartTransaction.uuid,
    );
    const isNewSmartTransaction = this.isNewSmartTransaction(
      smartTransaction.uuid,
    );

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
      this.#confirmSmartTransaction(nextSmartTransaction, {
        chainId,
        ethQuery,
      });
    }

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

  async #confirmSmartTransaction(
    smartTransaction: SmartTransaction,
    {
      chainId = this.config.chainId,
      ethQuery = this.ethQuery,
    }: {
      chainId: Hex;
      ethQuery: EthQuery;
    },
  ) {
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
          status: 'confirmed',
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

        this.confirmExternalTransaction(
          txMeta,
          transactionReceipt,
          baseFeePerGas,
        );

        this.trackMetaMetricsEvent({
          event: 'STX Confirmed',
          category: 'swaps',
        });

        this.#updateSmartTransaction(
          {
            ...smartTransaction,
            confirmed: true,
          },
          { chainId, ethQuery },
        );
      }
    } catch (e) {
      this.trackMetaMetricsEvent({
        event: 'STX Confirmation Failed',
        category: 'swaps',
      });
      console.error('confirm error', e);
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
      this.#updateSmartTransaction(
        {
          statusMetadata: stxStatus,
          status: calculateStatus(stxStatus),
          cancellable: isSmartTransactionCancellable(stxStatus),
          uuid,
        },
        { chainId, ethQuery },
      );
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
    approvalTx: UnsignedTransaction,
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
    txParams,
    signedTransactions,
    signedCanceledTransactions,
    networkClientId,
  }: {
    signedTransactions: SignedTransaction[];
    signedCanceledTransactions: SignedCanceledTransaction[];
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
    } catch (e) {
      console.error('provider error', e);
    }
    const nonceLock = await this.getNonceLock(txParams?.from);
    try {
      const nonce = hexlify(nonceLock.nextNonce);
      if (txParams && !txParams?.nonce) {
        txParams.nonce = nonce;
      }
      const { nonceDetails } = nonceLock;

      this.#updateSmartTransaction(
        {
          chainId,
          nonceDetails,
          preTxBalance,
          status: SmartTransactionStatuses.PENDING,
          time,
          txParams,
          uuid: data.uuid,
          cancellable: true,
        },
        { chainId, ethQuery },
      );
    } finally {
      nonceLock.releaseLock();
    }

    return data;
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
    return networkClientId
      ? new EthQuery(this.getNetworkClientById(networkClientId).provider)
      : this.ethQuery;
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
    } catch (e) {
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

  getTransactions({
    addressFrom,
    status,
  }: {
    addressFrom: string;
    status: SmartTransactionStatuses;
  }): SmartTransaction[] {
    const { smartTransactions } = this.state.smartTransactionsState;
    const { chainId } = this.config;
    const currentSmartTransactions = smartTransactions?.[chainId];
    if (!currentSmartTransactions || currentSmartTransactions.length === 0) {
      return [];
    }

    return currentSmartTransactions.filter((stx) => {
      return stx.status === status && stx.txParams?.from === addressFrom;
    });
  }
}
