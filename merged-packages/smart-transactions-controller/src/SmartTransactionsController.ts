import {
  BaseConfig,
  BaseController,
  BaseState,
  NetworkState,
  util,
} from '@metamask/controllers';
import { BigNumber } from 'bignumber.js';
import { ethers } from 'ethers';
import mapValues from 'lodash/mapValues';
import cloneDeep from 'lodash/cloneDeep';
import {
  APIType,
  SmartTransaction,
  SignedTransaction,
  SignedCanceledTransaction,
  UnsignedTransaction,
  SmartTransactionsStatus,
  SmartTransactionStatuses,
} from './types';
import {
  getAPIRequestURL,
  isSmartTransactionPending,
  calculateStatus,
} from './utils';
import { CHAIN_IDS } from './constants';

const { handleFetch, safelyExecute } = util;

// TODO: JSDoc all methods
// TODO: Remove all comments (* ! ?)

export const DEFAULT_INTERVAL = 10 * 1000;

export interface SmartTransactionsControllerConfig extends BaseConfig {
  interval: number;
  clientId: string;
  chainId: string;
  supportedChainIds: string[];
}

export interface SmartTransactionsControllerState extends BaseState {
  smartTransactions: Record<string, SmartTransaction[]>;
  userOptIn: boolean | undefined;
}

export default class SmartTransactionsController extends BaseController<
  SmartTransactionsControllerConfig,
  SmartTransactionsControllerState
> {
  private timeoutHandle?: NodeJS.Timeout;

  private nonceTracker: any;

  private getNetwork: any;

  private ethersProvider: any;

  public txController: any;

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
      nonceTracker,
      getNetwork,
      provider,
      txController,
    }: {
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
      nonceTracker: any;
      getNetwork: any;
      provider: any;
      txController: any;
    },
    config?: Partial<SmartTransactionsControllerConfig>,
    state?: Partial<SmartTransactionsControllerState>,
  ) {
    super(config, state);

    this.defaultConfig = {
      interval: DEFAULT_INTERVAL,
      chainId: CHAIN_IDS.ETHEREUM,
      clientId: 'default',
      supportedChainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.RINKEBY],
    };

    this.defaultState = {
      smartTransactions: {},
      userOptIn: undefined,
    };

    this.nonceTracker = nonceTracker;
    this.getNetwork = getNetwork;
    this.ethersProvider = new ethers.providers.Web3Provider(provider);
    this.txController = txController;

    this.initialize();
    this.initializeSmartTransactionsForChainId();

    onNetworkStateChange(({ provider: newProvider }) => {
      const { chainId } = newProvider;
      this.configure({ chainId });
      this.initializeSmartTransactionsForChainId();
      this.poll();
      this.ethersProvider = new ethers.providers.Web3Provider(provider);
    });

    this.poll();
  }

  initializeSmartTransactionsForChainId() {
    if (this.config.supportedChainIds.includes(this.config.chainId)) {
      this.update({
        smartTransactions: {
          ...this.state.smartTransactions,
          [this.config.chainId]:
            this.state.smartTransactions[this.config.chainId] ?? [],
        },
      });
    }
  }

  async poll(interval?: number): Promise<void> {
    const { chainId, supportedChainIds } = this.config;
    interval && this.configure({ interval }, false, false);
    this.timeoutHandle && clearTimeout(this.timeoutHandle);
    if (!supportedChainIds.includes(chainId)) {
      return;
    }
    await safelyExecute(() => this.updateSmartTransactions());
    this.timeoutHandle = setTimeout(() => {
      this.poll(this.config.interval);
    }, this.config.interval);
  }

  async stop() {
    this.timeoutHandle && clearTimeout(this.timeoutHandle);
  }

  setOptInState(state: boolean | undefined): void {
    this.update({ userOptIn: state });
  }

  updateSmartTransaction(smartTransaction: SmartTransaction): void {
    const { chainId } = this.config;
    const { smartTransactions } = this.state;
    const currentSmartTransactions = smartTransactions[chainId];
    const currentIndex = currentSmartTransactions?.findIndex(
      (st) => st.uuid === smartTransaction.uuid,
    );

    if (currentIndex === -1 || currentIndex === undefined) {
      // add smart transaction
      this.update({
        smartTransactions: {
          ...this.state.smartTransactions,
          [chainId]: [
            ...this.state.smartTransactions?.[chainId],
            smartTransaction,
          ],
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
      this.confirmSmartTransaction(nextSmartTransaction);
    }

    this.update({
      smartTransactions: {
        ...this.state.smartTransactions,
        [chainId]: this.state.smartTransactions[chainId].map((item, index) => {
          return index === currentIndex
            ? { ...item, ...smartTransaction }
            : item;
        }),
      },
    });
  }

  async updateSmartTransactions() {
    const { smartTransactions } = this.state;
    const { chainId } = this.config;

    const currentSmartTransactions = smartTransactions?.[chainId];

    const transactionsToUpdate: string[] = currentSmartTransactions
      .filter((smartTransaction) => isSmartTransactionPending(smartTransaction))
      .map((smartTransaction) => smartTransaction.uuid);

    if (transactionsToUpdate.length > 0) {
      this.fetchSmartTransactionsStatus(transactionsToUpdate);
    } else {
      this.stop();
    }
  }

  async confirmSmartTransaction(smartTransaction: SmartTransaction) {
    const txHash = smartTransaction.statusMetadata?.minedHash;
    try {
      const transactionReceipt = await this.ethersProvider.getTransactionReceipt(
        txHash,
      );
      if (transactionReceipt?.blockNumber) {
        const blockData = await this.ethersProvider.getBlock(
          transactionReceipt?.blockNumber,
          false,
        );
        const baseFeePerGas = blockData?.baseFeePerGas.toHexString();
        const txReceipt = mapValues(transactionReceipt, (value) => {
          if (value instanceof ethers.BigNumber) {
            return value.toHexString();
          }
          return value;
        });
        // call confirmExternalTransaction
        const originalTxMeta = {
          ...smartTransaction,
          id: smartTransaction.uuid,
          status: 'confirmed',
          hash: txHash,
        };
        const snapshot = cloneDeep(originalTxMeta);
        const history = [snapshot];
        const txMeta = { ...originalTxMeta, history };
        this.txController.confirmExternalTransaction(
          txMeta,
          txReceipt,
          baseFeePerGas,
        );

        this.updateSmartTransaction({
          ...smartTransaction,
          confirmed: true,
        });
      }
    } catch (e) {
      console.error('confirm error', e);
    }
  }

  // ! Ask backend API to accept list of uuids as params
  async fetchSmartTransactionsStatus(
    uuids: string[],
  ): Promise<SmartTransaction[]> {
    const { chainId } = this.config;

    const params = new URLSearchParams({
      uuids: uuids.join(','),
    });

    const url = `${getAPIRequestURL(
      APIType.BATCH_STATUS,
      chainId,
    )}?${params.toString()}`;

    const data = await this.fetch(url);

    Object.entries(data).forEach(([uuid, smartTransaction]) => {
      this.updateSmartTransaction({
        statusMetadata: smartTransaction as SmartTransactionsStatus,
        status: calculateStatus(smartTransaction as SmartTransactionsStatus),
        uuid,
      });
    });

    return data;
  }

  async addNonceToTransaction(
    transaction: UnsignedTransaction,
  ): Promise<UnsignedTransaction> {
    const nonceLock = await this.nonceTracker.getNonceLock(transaction.from);
    const nonce = nonceLock.nextNonce;
    nonceLock.releaseLock();
    return {
      ...transaction,
      nonce,
    };
  }

  async getUnsignedTransactionsAndEstimates(
    unsignedTransaction: UnsignedTransaction,
  ): Promise<{
    transactions: UnsignedTransaction[];
    cancelTransactions: UnsignedTransaction[];
    estimates: {
      maxFee: number; // GWEI number
      estimatedFee: number; // GWEI number
    };
  }> {
    const { chainId } = this.config;

    const unsignedTransactionWithNonce = await this.addNonceToTransaction(
      unsignedTransaction,
    );
    const data = await this.fetch(
      getAPIRequestURL(APIType.GET_TRANSACTIONS, chainId),
      {
        method: 'POST',
        body: JSON.stringify({ tx: unsignedTransactionWithNonce }),
      },
    );

    return data;
  }

  // * After this successful call client must add a nonce representative to
  // * transaction controller external transactions list
  async submitSignedTransactions({
    txParams,
    signedTransactions,
    signedCanceledTransactions,
  }: {
    signedTransactions: SignedTransaction[];
    signedCanceledTransactions: SignedCanceledTransaction[];
    txParams?: any;
  }) {
    const { chainId } = this.config;
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
    const metamaskNetworkId = this.getNetwork();
    const preTxBalanceBN = await this.ethersProvider.getBalance(txParams?.from);
    const preTxBalance = new BigNumber(preTxBalanceBN.toHexString()).toString(
      16,
    );
    const nonceLock = await this.nonceTracker.getNonceLock(txParams?.from);
    const nonce = ethers.utils.hexlify(nonceLock.nextNonce);
    if (txParams && !txParams?.nonce) {
      txParams.nonce = nonce;
    }
    const { nonceDetails } = nonceLock;

    this.updateSmartTransaction({
      chainId,
      nonceDetails,
      metamaskNetworkId,
      preTxBalance,
      status: SmartTransactionStatuses.PENDING,
      time,
      txParams,
      uuid: data.uuid,
    });
    nonceLock.releaseLock();
    return data;
  }

  // ! This should return if the cancellation was on chain or not (for nonce management)
  // * After this successful call client must update nonce representative
  // * in transaction controller external transactions list
  // ! Ask backend API to make this endpoint a POST
  async cancelSmartTransaction(uuid: string): Promise<void> {
    const { chainId } = this.config;
    await this.fetch(getAPIRequestURL(APIType.CANCEL, chainId), {
      method: 'POST',
      body: JSON.stringify({ uuid }),
    });
  }

  async fetchLiveness(): Promise<boolean> {
    const { chainId } = this.config;
    const response = await this.fetch(
      getAPIRequestURL(APIType.LIVENESS, chainId),
    );
    return Boolean(response.lastBlock);
  }

  async setStatusRefreshInterval(interval: number): Promise<void> {
    if (interval !== this.config.interval) {
      this.configure({ interval }, false, false);
    }
  }
}
