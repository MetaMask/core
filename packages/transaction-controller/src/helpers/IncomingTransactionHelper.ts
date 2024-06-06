import type { BlockTracker } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import EventEmitter from 'events';

import { incomingTransactionsLogger as log } from '../logger';
import type { RemoteTransactionSource, TransactionMeta } from '../types';

const RECENT_HISTORY_BLOCK_RANGE = 10;

// TODO: Replace `any` with type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const UPDATE_CHECKS: ((txMeta: TransactionMeta) => any)[] = [
  (txMeta) => txMeta.status,
  (txMeta) => txMeta.txParams.gasUsed,
];

/**
 * Configuration options for the IncomingTransactionHelper
 *
 * @property includeTokenTransfers - Whether or not to include ERC20 token transfers.
 * @property isEnabled - Whether or not incoming transaction retrieval is enabled.
 * @property queryEntireHistory - Whether to initially query the entire transaction history or only recent blocks.
 * @property updateTransactions - Whether to update local transactions using remote transaction data.
 */
export type IncomingTransactionOptions = {
  includeTokenTransfers?: boolean;
  isEnabled?: () => boolean;
  queryEntireHistory?: boolean;
  updateTransactions?: boolean;
};

export class IncomingTransactionHelper {
  hub: EventEmitter;

  #currentBlockTracker?: BlockTracker;

  #getBlockTracker: () => BlockTracker | undefined;

  #getChainId: () => Hex | undefined;

  #getCurrentAccount: () => string;

  #getLastFetchedBlockNumbers: () => Record<string, number>;

  #getLocalTransactions: () => TransactionMeta[];

  #isEnabled: () => boolean;

  #isRunning: boolean;

  #mutex = new Mutex();

  #onLatestBlock: (blockNumberHex: Hex) => Promise<void>;

  #queryEntireHistory: boolean;

  #remoteTransactionSource: RemoteTransactionSource;

  #transactionLimit?: number;

  #updateTransactions: boolean;

  constructor({
    getBlockTracker,
    getChainId,
    getCurrentAccount,
    getLastFetchedBlockNumbers,
    getLocalTransactions,
    isEnabled,
    queryEntireHistory,
    remoteTransactionSource,
    transactionLimit,
    updateTransactions,
  }: {
    getBlockTracker: () => BlockTracker | undefined;
    getChainId: () => Hex | undefined;
    getCurrentAccount: () => string;
    getLastFetchedBlockNumbers: () => Record<string, number>;
    getLocalTransactions?: () => TransactionMeta[];
    isEnabled?: () => boolean;
    queryEntireHistory?: boolean;
    remoteTransactionSource: RemoteTransactionSource;
    transactionLimit?: number;
    updateTransactions?: boolean;
  }) {
    this.hub = new EventEmitter();

    this.#getBlockTracker = getBlockTracker;
    this.#getChainId = getChainId;
    this.#getCurrentAccount = getCurrentAccount;
    this.#getLastFetchedBlockNumbers = getLastFetchedBlockNumbers;
    this.#getLocalTransactions = getLocalTransactions || (() => []);
    this.#isEnabled = isEnabled ?? (() => true);
    this.#isRunning = false;
    this.#queryEntireHistory = queryEntireHistory ?? true;
    this.#remoteTransactionSource = remoteTransactionSource;
    this.#transactionLimit = transactionLimit;
    this.#updateTransactions = updateTransactions ?? false;

    // Using a property instead of a method to provide a listener reference
    // with the correct scope that we can remove later if stopped.
    this.#onLatestBlock = async (blockNumberHex: Hex) => {
      try {
        await this.update(blockNumberHex);
      } catch (error) {
        console.error('Error while checking incoming transactions', error);
      }
    };
  }

  start() {
    if (this.#isRunning) {
      return;
    }

    const { blockTracker, chainId } = this.#getNetworkObjects();

    if (!blockTracker || !chainId) {
      log('Cannot start as network is not available');
      return;
    }

    if (!this.#canStart(chainId)) {
      return;
    }

    this.#currentBlockTracker = blockTracker;
    this.#currentBlockTracker.addListener('latest', this.#onLatestBlock);
    this.#isRunning = true;
  }

  stop() {
    this.#currentBlockTracker?.removeListener('latest', this.#onLatestBlock);
    this.#currentBlockTracker = undefined;
    this.#isRunning = false;
  }

  async update(latestBlockNumberHex?: Hex): Promise<void> {
    const releaseLock = await this.#mutex.acquire();

    log('Checking for incoming transactions');

    try {
      const { blockTracker, chainId } = this.#getNetworkObjects();

      if (!blockTracker || !chainId) {
        log('Cannot update as network client is not available');
        return;
      }

      if (!this.#canStart(chainId)) {
        return;
      }

      const latestBlockNumber = parseInt(
        latestBlockNumberHex || (await blockTracker.getLatestBlock()),
        16,
      );

      const additionalLastFetchedKeys =
        this.#remoteTransactionSource.getLastBlockVariations?.() ?? [];

      const fromBlock = this.#getFromBlock(latestBlockNumber, chainId);
      const address = this.#getCurrentAccount();
      const currentChainId = chainId;

      let remoteTransactions = [];

      try {
        remoteTransactions =
          await this.#remoteTransactionSource.fetchTransactions({
            address,
            currentChainId,
            fromBlock,
            limit: this.#transactionLimit,
          });
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        log('Error while fetching remote transactions', error);
        return;
      }
      if (!this.#updateTransactions) {
        remoteTransactions = remoteTransactions.filter(
          (tx) => tx.txParams.to?.toLowerCase() === address.toLowerCase(),
        );
      }

      const localTransactions = !this.#updateTransactions
        ? []
        : this.#getLocalTransactions();

      const newTransactions = this.#getNewTransactions(
        remoteTransactions,
        localTransactions,
      );

      const updatedTransactions = this.#getUpdatedTransactions(
        remoteTransactions,
        localTransactions,
      );

      if (newTransactions.length > 0 || updatedTransactions.length > 0) {
        this.#sortTransactionsByTime(newTransactions);
        this.#sortTransactionsByTime(updatedTransactions);

        log('Found incoming transactions', {
          new: newTransactions,
          updated: updatedTransactions,
        });

        this.hub.emit('transactions', {
          added: newTransactions,
          updated: updatedTransactions,
        });
      }

      this.#updateLastFetchedBlockNumber(
        remoteTransactions,
        additionalLastFetchedKeys,
        currentChainId,
      );
    } finally {
      releaseLock();
    }
  }

  #sortTransactionsByTime(transactions: TransactionMeta[]) {
    transactions.sort((a, b) => (a.time < b.time ? -1 : 1));
  }

  #getNewTransactions(
    remoteTxs: TransactionMeta[],
    localTxs: TransactionMeta[],
  ): TransactionMeta[] {
    return remoteTxs.filter(
      (tx) => !localTxs.some(({ hash }) => hash === tx.hash),
    );
  }

  #getUpdatedTransactions(
    remoteTxs: TransactionMeta[],
    localTxs: TransactionMeta[],
  ): TransactionMeta[] {
    return remoteTxs.filter((remoteTx) =>
      localTxs.some(
        (localTx) =>
          remoteTx.hash === localTx.hash &&
          this.#isTransactionOutdated(remoteTx, localTx),
      ),
    );
  }

  #isTransactionOutdated(
    remoteTx: TransactionMeta,
    localTx: TransactionMeta,
  ): boolean {
    return UPDATE_CHECKS.some(
      (getValue) => getValue(remoteTx) !== getValue(localTx),
    );
  }

  #getLastFetchedBlockNumberDec(chainId: Hex): number {
    const additionalLastFetchedKeys =
      this.#remoteTransactionSource.getLastBlockVariations?.() ?? [];

    const lastFetchedKey = this.#getBlockNumberKey(
      additionalLastFetchedKeys,
      chainId,
    );

    const lastFetchedBlockNumbers = this.#getLastFetchedBlockNumbers();
    return lastFetchedBlockNumbers[lastFetchedKey];
  }

  #getFromBlock(latestBlockNumber: number, chainId: Hex): number | undefined {
    const lastFetchedBlockNumber = this.#getLastFetchedBlockNumberDec(chainId);

    if (lastFetchedBlockNumber) {
      return lastFetchedBlockNumber + 1;
    }

    return this.#queryEntireHistory
      ? undefined
      : latestBlockNumber - RECENT_HISTORY_BLOCK_RANGE;
  }

  #updateLastFetchedBlockNumber(
    remoteTxs: TransactionMeta[],
    additionalKeys: string[],
    chainId: Hex,
  ) {
    let lastFetchedBlockNumber = -1;

    for (const tx of remoteTxs) {
      const currentBlockNumberValue = tx.blockNumber
        ? parseInt(tx.blockNumber, 10)
        : -1;

      lastFetchedBlockNumber = Math.max(
        lastFetchedBlockNumber,
        currentBlockNumberValue,
      );
    }

    if (lastFetchedBlockNumber === -1) {
      return;
    }

    const lastFetchedKey = this.#getBlockNumberKey(additionalKeys, chainId);
    const lastFetchedBlockNumbers = this.#getLastFetchedBlockNumbers();
    const previousValue = lastFetchedBlockNumbers[lastFetchedKey];

    if (previousValue >= lastFetchedBlockNumber) {
      return;
    }

    this.hub.emit('updatedLastFetchedBlockNumbers', {
      lastFetchedBlockNumbers: {
        ...lastFetchedBlockNumbers,
        [lastFetchedKey]: lastFetchedBlockNumber,
      },
      blockNumber: lastFetchedBlockNumber,
    });
  }

  #getBlockNumberKey(additionalKeys: string[], chainId: Hex): string {
    const currentAccount = this.#getCurrentAccount()?.toLowerCase();

    return [chainId, currentAccount, ...additionalKeys].join('#');
  }

  #canStart(chainId: Hex): boolean {
    const isEnabled = this.#isEnabled();

    const isSupportedNetwork =
      this.#remoteTransactionSource.isSupportedNetwork(chainId);

    return isEnabled && isSupportedNetwork;
  }

  #getNetworkObjects() {
    const blockTracker = this.#getBlockTracker();
    const chainId = this.#getChainId();

    return { blockTracker, chainId };
  }
}
