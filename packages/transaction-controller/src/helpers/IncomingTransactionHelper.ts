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
 */
export type IncomingTransactionOptions = {
  includeTokenTransfers?: boolean;
  isEnabled?: () => boolean;
};

const FIRST_QUERY_HISTORY_DURATION = 1000 * 60 * 60 * 24 * 2; // 2 Days
const INTERVAL = 1000 * 30; // 30 Seconds

export class IncomingTransactionHelper {
  hub: EventEmitter;

  #getCurrentAccount: () => ReturnType<
    AccountsController['getSelectedAccount']
  >;

  #getLastFetchedTimestamps: () => Record<string, number>;

  #getChainIds: () => Hex[];

  #isEnabled: () => boolean;

  #isRunning: boolean;

  #remoteTransactionSource: RemoteTransactionSource;

  #timeoutId?: unknown;

  #transactionLimit?: number;

  constructor({
    getCurrentAccount,
    getLastFetchedTimestamps,
    getChainIds,
    isEnabled,
    remoteTransactionSource,
    transactionLimit,
  }: {
    getCurrentAccount: () => ReturnType<
      AccountsController['getSelectedAccount']
    >;
    getLastFetchedTimestamps: () => Record<string, number>;
    getChainIds: () => Hex[];
    isEnabled?: () => boolean;
    queryEntireHistory?: boolean;
    remoteTransactionSource: RemoteTransactionSource;
    transactionLimit?: number;
    updateTransactions?: boolean;
  }) {
    this.hub = new EventEmitter();

    this.#getCurrentAccount = getCurrentAccount;
    this.#getLastFetchedTimestamps = getLastFetchedTimestamps;
    this.#getChainIds = getChainIds;
    this.#isEnabled = isEnabled ?? (() => true);
    this.#isRunning = false;
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

    log('Started polling');
  }

  stop() {
    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId as number);
    }

    if (!this.#isRunning) {
      return;
    }

    this.#isRunning = false;

    log('Stopped polling');
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

    const account = this.#getCurrentAccount();
    const chainIds = this.#getChainIds();
    const startTimestampByChainId = this.#getStartTimestampByChainId(chainIds);

    let remoteTransactions: TransactionMeta[] = [];

    try {
      remoteTransactions =
        await this.#remoteTransactionSource.fetchTransactions({
          address: account.address as Hex,
          chainIds,
          startTimestampByChainId,
          limit: this.#transactionLimit,
        });
    } catch (error: unknown) {
      log('Error while fetching remote transactions', error);
      return;
    }

    if (remoteTransactions.length > 0) {
      this.#sortTransactionsByTime(remoteTransactions);

      log('Found incoming transactions', { remoteTransactions });

      this.hub.emit('incoming-transactions', remoteTransactions);
    }

    for (const chainId of chainIds) {
      this.#updateLastFetchedTimestamp(chainId, remoteTransactions);
    }
  }

  #sortTransactionsByTime(transactions: TransactionMeta[]) {
    transactions.sort((a, b) => (a.time < b.time ? -1 : 1));
  }

  #getStartTimestampByChainId(chainIds: Hex[]): Record<Hex, number> {
    return chainIds.reduce((acc, chainId) => {
      const lastFetchedTimestamp = this.#getLastFetchedTimestamp(chainId);

      const startTimestamp = lastFetchedTimestamp
        ? lastFetchedTimestamp + 1
        : this.#getTimestampSeconds(Date.now() - FIRST_QUERY_HISTORY_DURATION);

      return { ...acc, [chainId]: startTimestamp };
    }, {});
  }

  #getLastFetchedTimestamp(chainId: Hex): number {
    const lastFetchedKey = this.#getTimestampKey(chainId);
    const lastFetchedTimestamps = this.#getLastFetchedTimestamps();
    return lastFetchedTimestamps[lastFetchedKey];
  }

  #updateLastFetchedTimestamp(chainId: Hex, remoteTxs: TransactionMeta[]) {
    const chainTxs = remoteTxs.filter((tx) => tx.chainId === chainId);
    let lastFetchedTimestamp = -1;

    for (const tx of chainTxs) {
      const currentTimestamp = this.#getTimestampSeconds(tx.time);
      lastFetchedTimestamp = Math.max(lastFetchedTimestamp, currentTimestamp);
    }

    if (lastFetchedTimestamp === -1) {
      return;
    }

    const lastFetchedKey = this.#getTimestampKey(chainId);
    const lastFetchedTimestamps = this.#getLastFetchedTimestamps();
    const previousValue = lastFetchedTimestamps[lastFetchedKey];

    if (previousValue >= lastFetchedTimestamp) {
      return;
    }

    log('Updating last fetched timestamp', {
      key: lastFetchedKey,
      timestamp: lastFetchedTimestamp,
    });

    this.hub.emit('updated-last-fetched-timestamp', {
      key: lastFetchedKey,
      timestamp: lastFetchedTimestamp,
    });
  }

  #getTimestampKey(chainId: Hex): string {
    const currentAccount = this.#getCurrentAccount()?.address.toLowerCase();
    return [chainId, currentAccount].join('#');
  }

  #canStart(): boolean {
    const isEnabled = this.#isEnabled();
    const chainIds = this.#getChainIds();

    const supportedChainIds =
      this.#remoteTransactionSource.getSupportedChains();

    const isAnyChainSupported = chainIds.some((chainId) =>
      supportedChainIds.includes(chainId),
    );

    return isEnabled && isAnyChainSupported;
  }

  #getTimestampSeconds(timestampMilliseconds: number): number {
    return Math.ceil(timestampMilliseconds / 1000);
  }
}
