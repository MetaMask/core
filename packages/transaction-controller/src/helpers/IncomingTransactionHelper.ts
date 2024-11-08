import type { AccountsController } from '@metamask/accounts-controller';
import type { Hex } from '@metamask/utils';
import EventEmitter from 'events';

import { incomingTransactionsLogger as log } from '../logger';
import type { RemoteTransactionSource, TransactionMeta } from '../types';

/**
 * Configuration options for the IncomingTransactionHelper
 *
 * @property includeTokenTransfers - Whether or not to include ERC20 token transfers.
 * @property isEnabled - Whether or not incoming transaction retrieval is enabled.
 * @property queryEntireHistory - Whether to initially query the entire transaction history or only recent blocks.
 */
export type IncomingTransactionOptions = {
  includeTokenTransfers?: boolean;
  isEnabled?: () => boolean;
  queryEntireHistory?: boolean;
};

const INTERVAL = 1000 * 30; // 30 Seconds

export class IncomingTransactionHelper {
  hub: EventEmitter;

  #getCurrentAccount: () => ReturnType<
    AccountsController['getSelectedAccount']
  >;

  #getLastFetchedBlockNumbers: () => Record<string, number>;

  #getChainIds: () => Hex[];

  #isEnabled: () => boolean;

  #isRunning: boolean;

  #queryEntireHistory: boolean;

  #remoteTransactionSource: RemoteTransactionSource;

  #timeoutId?: unknown;

  #transactionLimit?: number;

  constructor({
    getCurrentAccount,
    getLastFetchedBlockNumbers,
    getChainIds,
    isEnabled,
    queryEntireHistory,
    remoteTransactionSource,
    transactionLimit,
  }: {
    getCurrentAccount: () => ReturnType<
      AccountsController['getSelectedAccount']
    >;
    getLastFetchedBlockNumbers: () => Record<string, number>;
    getChainIds: () => Hex[];
    isEnabled?: () => boolean;
    queryEntireHistory?: boolean;
    remoteTransactionSource: RemoteTransactionSource;
    transactionLimit?: number;
    updateTransactions?: boolean;
  }) {
    this.hub = new EventEmitter();

    this.#getCurrentAccount = getCurrentAccount;
    this.#getLastFetchedBlockNumbers = getLastFetchedBlockNumbers;
    this.#getChainIds = getChainIds;
    this.#isEnabled = isEnabled ?? (() => true);
    this.#isRunning = false;
    this.#queryEntireHistory = queryEntireHistory ?? true;
    this.#remoteTransactionSource = remoteTransactionSource;
    this.#transactionLimit = transactionLimit;
  }

  start() {
    if (this.#isRunning) {
      return;
    }

    if (!this.#canStart()) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.#timeoutId = setTimeout(() => this.#onInterval(), INTERVAL);
    this.#isRunning = true;
  }

  stop() {
    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId as number);
    }

    this.#isRunning = false;
  }

  async #onInterval() {
    try {
      await this.update({ isInterval: true });
    } catch (error) {
      console.error('Error while checking incoming transactions', error);
    }

    if (this.#isRunning) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.#timeoutId = setTimeout(() => this.#onInterval(), INTERVAL);
    }
  }

  async update({ isInterval }: { isInterval?: boolean } = {}): Promise<void> {
    log('Checking for incoming transactions', {
      isInterval: Boolean(isInterval),
    });

    if (!this.#canStart()) {
      return;
    }

    const additionalLastFetchedKeys =
      this.#remoteTransactionSource.getLastBlockVariations?.() ?? [];

    const account = this.#getCurrentAccount();
    const chainIds = this.#getChainIds();
    const fromBlocksByChainId = this.#getFromBlocks(chainIds);

    let remoteTransactions: TransactionMeta[] = [];

    try {
      remoteTransactions =
        await this.#remoteTransactionSource.fetchTransactions({
          address: account.address as Hex,
          chainIds,
          fromBlocksByChainId,
          limit: this.#transactionLimit,
        });
    } catch (error: unknown) {
      log('Error while fetching remote transactions', error);
      return;
    }

    if (remoteTransactions.length > 0) {
      this.#sortTransactionsByTime(remoteTransactions);

      log('Found incoming transactions', { remoteTransactions });

      this.hub.emit('transactions', {
        added: remoteTransactions,
        updated: [],
      });
    }

    for (const chainId of chainIds) {
      this.#updateLastFetchedBlockNumber(
        chainId,
        remoteTransactions,
        additionalLastFetchedKeys,
      );
    }
  }

  #sortTransactionsByTime(transactions: TransactionMeta[]) {
    transactions.sort((a, b) => (a.time < b.time ? -1 : 1));
  }

  #getLastFetchedBlockNumberDec(chainId: Hex): number {
    const additionalLastFetchedKeys =
      this.#remoteTransactionSource.getLastBlockVariations?.() ?? [];

    const lastFetchedKey = this.#getBlockNumberKey(
      chainId,
      additionalLastFetchedKeys,
    );

    const lastFetchedBlockNumbers = this.#getLastFetchedBlockNumbers();
    return lastFetchedBlockNumbers[lastFetchedKey];
  }

  #getFromBlocks(chainIds: Hex[]): Record<Hex, number | undefined> {
    return chainIds.reduce((acc, chainId) => {
      const lastFetchedBlockNumber =
        this.#getLastFetchedBlockNumberDec(chainId);

      const fromBlock = lastFetchedBlockNumber
        ? lastFetchedBlockNumber + 1
        : undefined;
      return { ...acc, [chainId]: fromBlock };
    }, {});
  }

  #updateLastFetchedBlockNumber(
    chainId: Hex,
    remoteTxs: TransactionMeta[],
    additionalKeys: string[],
  ) {
    const chainTxs = remoteTxs.filter((tx) => tx.chainId === chainId);

    let lastFetchedBlockNumber = -1;

    for (const tx of chainTxs) {
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

    const lastFetchedKey = this.#getBlockNumberKey(chainId, additionalKeys);
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

  #getBlockNumberKey(chainId: Hex, additionalKeys: string[]): string {
    const currentAccount = this.#getCurrentAccount()?.address.toLowerCase();
    return [chainId, currentAccount, ...additionalKeys].join('#');
  }

  #canStart(): boolean {
    const isEnabled = this.#isEnabled();
    const chainIds = this.#getChainIds();

    const isChainsSupported =
      this.#remoteTransactionSource.isChainsSupported(chainIds);

    return isEnabled && isChainsSupported;
  }
}
