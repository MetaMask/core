import type { AccountsController } from '@metamask/accounts-controller';
import type { Hex } from '@metamask/utils';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import-x/no-nodejs-modules
import EventEmitter from 'events';

import { incomingTransactionsLogger as log } from '../logger';
import type { RemoteTransactionSource, TransactionMeta } from '../types';

export type IncomingTransactionOptions = {
  includeTokenTransfers?: boolean;
  isEnabled?: () => boolean;
  queryEntireHistory?: boolean;
  updateTransactions?: boolean;
};

const INTERVAL = 1000 * 30; // 30 Seconds

export class IncomingTransactionHelper {
  hub: EventEmitter;

  readonly #getCache: () => Record<string, unknown>;

  readonly #getCurrentAccount: () => ReturnType<
    AccountsController['getSelectedAccount']
  >;

  readonly #getLocalTransactions: () => TransactionMeta[];

  readonly #includeTokenTransfers?: boolean;

  readonly #isEnabled: () => boolean;

  #isRunning: boolean;

  readonly #queryEntireHistory?: boolean;

  readonly #remoteTransactionSource: RemoteTransactionSource;

  #timeoutId?: unknown;

  readonly #trimTransactions: (
    transactions: TransactionMeta[],
  ) => TransactionMeta[];

  readonly #updateCache: (fn: (cache: Record<string, unknown>) => void) => void;

  readonly #updateTransactions?: boolean;

  constructor({
    getCache,
    getCurrentAccount,
    getLocalTransactions,
    includeTokenTransfers,
    isEnabled,
    queryEntireHistory,
    remoteTransactionSource,
    trimTransactions,
    updateCache,
    updateTransactions,
  }: {
    getCache: () => Record<string, unknown>;
    getCurrentAccount: () => ReturnType<
      AccountsController['getSelectedAccount']
    >;
    getLocalTransactions: () => TransactionMeta[];
    includeTokenTransfers?: boolean;
    isEnabled?: () => boolean;
    queryEntireHistory?: boolean;
    remoteTransactionSource: RemoteTransactionSource;
    trimTransactions: (transactions: TransactionMeta[]) => TransactionMeta[];
    updateCache: (fn: (cache: Record<string, unknown>) => void) => void;
    updateTransactions?: boolean;
  }) {
    this.hub = new EventEmitter();

    this.#getCache = getCache;
    this.#getCurrentAccount = getCurrentAccount;
    this.#getLocalTransactions = getLocalTransactions;
    this.#includeTokenTransfers = includeTokenTransfers;
    this.#isEnabled = isEnabled ?? (() => true);
    this.#isRunning = false;
    this.#queryEntireHistory = queryEntireHistory;
    this.#remoteTransactionSource = remoteTransactionSource;
    this.#trimTransactions = trimTransactions;
    this.#updateCache = updateCache;
    this.#updateTransactions = updateTransactions;
  }

  start() {
    if (this.#isRunning) {
      return;
    }

    if (!this.#canStart()) {
      return;
    }

    log('Starting polling');

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
    const cache = this.#getCache();
    const includeTokenTransfers = this.#includeTokenTransfers ?? true;
    const queryEntireHistory = this.#queryEntireHistory ?? true;
    const updateTransactions = this.#updateTransactions ?? false;

    let remoteTransactions: TransactionMeta[] = [];

    try {
      remoteTransactions =
        await this.#remoteTransactionSource.fetchTransactions({
          address: account.address as Hex,
          cache,
          includeTokenTransfers,
          queryEntireHistory,
          updateCache: this.#updateCache,
          updateTransactions,
        });
    } catch (error: unknown) {
      log('Error while fetching remote transactions', error);
      return;
    }

    if (!remoteTransactions.length) {
      return;
    }

    this.#sortTransactionsByTime(remoteTransactions);

    log(
      'Found potential transactions',
      remoteTransactions.length,
      remoteTransactions,
    );

    const localTransactions = this.#getLocalTransactions();

    const uniqueTransactions = remoteTransactions.filter(
      (tx) =>
        !localTransactions.some(
          (currentTx) =>
            currentTx.hash?.toLowerCase() === tx.hash?.toLowerCase() &&
            currentTx.txParams.from?.toLowerCase() ===
              tx.txParams.from?.toLowerCase() && 
              currentTx.type === tx.type,
        ),
    );

    if (!uniqueTransactions.length) {
      log('All transactions are already known');
      return;
    }

    log(
      'Found unique transactions',
      uniqueTransactions.length,
      uniqueTransactions,
    );

    const trimmedTransactions = this.#trimTransactions([
      ...uniqueTransactions,
      ...localTransactions,
    ]);

    const uniqueTransactionIds = uniqueTransactions.map((tx) => tx.id);

    const newTransactions = trimmedTransactions.filter((tx) =>
      uniqueTransactionIds.includes(tx.id),
    );

    if (!newTransactions.length) {
      log('All unique transactions truncated due to limit');
      return;
    }

    log('Adding new transactions', newTransactions.length, newTransactions);

    this.hub.emit('transactions', newTransactions);
  }

  #sortTransactionsByTime(transactions: TransactionMeta[]) {
    transactions.sort((a, b) => (a.time < b.time ? -1 : 1));
  }

  #canStart(): boolean {
    return this.#isEnabled();
  }
}
