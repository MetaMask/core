import EventEmitter from 'events';
import type { NetworkState } from '@metamask/network-controller';

import { PollingBlockTracker as BlockTracker } from 'eth-block-tracker';
import { Mutex } from 'async-mutex';
import type { RemoteTransactionSource, TransactionMeta } from './types';

const UPDATE_CHECKS: ((txMeta: TransactionMeta) => any)[] = [
  (txMeta) => txMeta.status,
  (txMeta) => txMeta.transaction.gasUsed,
];

export class IncomingTransactionHelper {
  hub: EventEmitter;

  #blockTracker: BlockTracker;

  #getCurrentAccount: () => string;

  #getLastFetchedBlockNumbers: () => Record<string, number>;

  #getLocalTransactions: () => TransactionMeta[];

  #getNetworkState: () => NetworkState;

  #isEnabled: () => boolean;

  #isRunning: boolean;

  #mutex = new Mutex();

  #onLatestBlock: (blockNumberHex: string) => Promise<void>;

  #remoteTransactionSource: RemoteTransactionSource;

  #transactionLimit?: number;

  #updateTransactions: boolean;

  constructor({
    blockTracker,
    getCurrentAccount,
    getLastFetchedBlockNumbers,
    getLocalTransactions,
    getNetworkState,
    isEnabled,
    remoteTransactionSource,
    transactionLimit,
    updateTransactions,
  }: {
    blockTracker: BlockTracker;
    getCurrentAccount: () => string;
    getNetworkState: () => NetworkState;
    getLastFetchedBlockNumbers: () => Record<string, number>;
    getLocalTransactions?: () => TransactionMeta[];
    isEnabled?: () => boolean;
    remoteTransactionSource: RemoteTransactionSource;
    transactionLimit?: number;
    updateTransactions?: boolean;
  }) {
    this.hub = new EventEmitter();

    this.#blockTracker = blockTracker;
    this.#getCurrentAccount = getCurrentAccount;
    this.#getLastFetchedBlockNumbers = getLastFetchedBlockNumbers;
    this.#getLocalTransactions = getLocalTransactions || (() => []);
    this.#getNetworkState = getNetworkState;
    this.#isEnabled = isEnabled ?? (() => true);
    this.#isRunning = false;
    this.#remoteTransactionSource = remoteTransactionSource;
    this.#transactionLimit = transactionLimit;
    this.#updateTransactions = updateTransactions ?? false;

    // Using a property instead of a method to provide a listener reference
    // with the correct scope that we can remove later if stopped.
    this.#onLatestBlock = async (blockNumberHex: string) => {
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

    if (!this.#canStart()) {
      return;
    }

    this.#blockTracker.addListener('latest', this.#onLatestBlock);
    this.#isRunning = true;
  }

  stop() {
    this.#blockTracker.removeListener('latest', this.#onLatestBlock);
    this.#isRunning = false;
  }

  async update(latestBlockNumberHex?: string): Promise<void> {
    const releaseLock = await this.#mutex.acquire();

    try {
      if (!this.#canStart()) {
        return;
      }

      const latestBlockNumber = parseInt(
        latestBlockNumberHex || (await this.#blockTracker.getLatestBlock()),
        16,
      );

      const fromBlock = this.#getFromBlock(latestBlockNumber);
      const address = this.#getCurrentAccount();
      const currentChainId = this.#getCurrentChainId();
      const currentNetworkId = this.#getCurrentNetworkId();

      let remoteTransactions = [];

      try {
        remoteTransactions =
          await this.#remoteTransactionSource.fetchTransactions({
            address,
            currentChainId,
            currentNetworkId,
            fromBlock,
            limit: this.#transactionLimit,
          });
      } catch (error: any) {
        return;
      }

      if (!this.#updateTransactions) {
        remoteTransactions = remoteTransactions.filter(
          (tx) => tx.transaction.to?.toLowerCase() === address.toLowerCase(),
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

        this.hub.emit('transactions', {
          added: newTransactions,
          updated: updatedTransactions,
        });
      }

      this.#updateLastFetchedBlockNumber(remoteTransactions);
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
      (tx) =>
        !localTxs.some(
          ({ transactionHash }) => transactionHash === tx.transactionHash,
        ),
    );
  }

  #getUpdatedTransactions(
    remoteTxs: TransactionMeta[],
    localTxs: TransactionMeta[],
  ): TransactionMeta[] {
    return remoteTxs.filter((remoteTx) =>
      localTxs.some(
        (localTx) =>
          remoteTx.transactionHash === localTx.transactionHash &&
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

  #getFromBlock(_latestBlockNumber: number): number | undefined {
    const lastFetchedKey = this.#getBlockNumberKey();

    const lastFetchedBlockNumber =
      this.#getLastFetchedBlockNumbers()[lastFetchedKey];

    if (lastFetchedBlockNumber) {
      return lastFetchedBlockNumber + 1;
    }

    // Query entire transaction history
    return undefined;
  }

  #updateLastFetchedBlockNumber(remoteTxs: TransactionMeta[]) {
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

    const lastFetchedKey = this.#getBlockNumberKey();
    const lastFetchedBlockNumbers = this.#getLastFetchedBlockNumbers();
    const previousValue = lastFetchedBlockNumbers[lastFetchedKey];

    if (previousValue === lastFetchedBlockNumber) {
      return;
    }

    lastFetchedBlockNumbers[lastFetchedKey] = lastFetchedBlockNumber;

    this.hub.emit('updatedLastFetchedBlockNumbers', {
      lastFetchedBlockNumbers,
      blockNumber: lastFetchedBlockNumber,
    });
  }

  #getBlockNumberKey(): string {
    return `${this.#getCurrentChainId()}#${this.#getCurrentAccount().toLowerCase()}`;
  }

  #canStart(): boolean {
    const isEnabled = this.#isEnabled();
    const currentChainId = this.#getCurrentChainId();
    const currentNetworkId = this.#getCurrentNetworkId();

    const isSupportedNetwork = this.#remoteTransactionSource.isSupportedNetwork(
      currentChainId,
      currentNetworkId,
    );

    return isEnabled && isSupportedNetwork;
  }

  #getCurrentChainId(): string {
    const chainIdDecimalString = this.#getNetworkState().providerConfig.chainId;
    return `0x${parseInt(chainIdDecimalString, 10).toString(16)}`;
  }

  #getCurrentNetworkId(): string {
    return this.#getNetworkState().networkId as string;
  }
}
