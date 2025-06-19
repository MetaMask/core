import type { AccountsController } from '@metamask/accounts-controller';
import type { Hex } from '@metamask/utils';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import-x/no-nodejs-modules
import EventEmitter from 'events';

import type { TransactionControllerMessenger } from '..';
import { incomingTransactionsLogger as log } from '../logger';
import type { RemoteTransactionSource, TransactionMeta } from '../types';
import { getIncomingTransactionsPollingInterval } from '../utils/feature-flags';

export type IncomingTransactionOptions = {
  client?: string;
  includeTokenTransfers?: boolean;
  isEnabled?: () => boolean;
  queryEntireHistory?: boolean;
  updateTransactions?: boolean;
};

const TAG_POLLING = 'automatic-polling';

export class IncomingTransactionHelper {
  hub: EventEmitter;

  readonly #client?: string;

  readonly #getCache: () => Record<string, unknown>;

  readonly #getCurrentAccount: () => ReturnType<
    AccountsController['getSelectedAccount']
  >;

  readonly #getLocalTransactions: () => TransactionMeta[];

  readonly #includeTokenTransfers?: boolean;

  readonly #isEnabled: () => boolean;

  #isRunning: boolean;

  readonly #messenger: TransactionControllerMessenger;

  readonly #queryEntireHistory?: boolean;

  readonly #remoteTransactionSource: RemoteTransactionSource;

  #timeoutId?: unknown;

  readonly #trimTransactions: (
    transactions: TransactionMeta[],
  ) => TransactionMeta[];

  readonly #updateCache: (fn: (cache: Record<string, unknown>) => void) => void;

  readonly #updateTransactions?: boolean;

  constructor({
    client,
    getCache,
    getCurrentAccount,
    getLocalTransactions,
    includeTokenTransfers,
    isEnabled,
    messenger,
    queryEntireHistory,
    remoteTransactionSource,
    trimTransactions,
    updateCache,
    updateTransactions,
  }: {
    client?: string;
    getCache: () => Record<string, unknown>;
    getCurrentAccount: () => ReturnType<
      AccountsController['getSelectedAccount']
    >;
    getLocalTransactions: () => TransactionMeta[];
    includeTokenTransfers?: boolean;
    isEnabled?: () => boolean;
    messenger: TransactionControllerMessenger;
    queryEntireHistory?: boolean;
    remoteTransactionSource: RemoteTransactionSource;
    trimTransactions: (transactions: TransactionMeta[]) => TransactionMeta[];
    updateCache: (fn: (cache: Record<string, unknown>) => void) => void;
    updateTransactions?: boolean;
  }) {
    this.hub = new EventEmitter();

    this.#client = client;
    this.#getCache = getCache;
    this.#getCurrentAccount = getCurrentAccount;
    this.#getLocalTransactions = getLocalTransactions;
    this.#includeTokenTransfers = includeTokenTransfers;
    this.#isEnabled = isEnabled ?? (() => true);
    this.#isRunning = false;
    this.#messenger = messenger;
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

    const interval = this.#getInterval();

    log('Started polling', { interval });

    this.#isRunning = true;

    this.#onInterval().catch((error) => {
      log('Initial polling failed', error);
    });
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
      this.#timeoutId = setTimeout(
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        () => this.#onInterval(),
        this.#getInterval(),
      );
    }
  }

  async update({
    isInterval,
    tags,
  }: { isInterval?: boolean; tags?: string[] } = {}): Promise<void> {
    const finalTags = this.#getTags(tags, isInterval);

    log('Checking for incoming transactions', {
      isInterval: Boolean(isInterval),
      tags: finalTags,
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
          tags: finalTags,
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

  #getInterval(): number {
    return getIncomingTransactionsPollingInterval(this.#messenger);
  }

  #getTags(
    requestTags: string[] | undefined,
    isInterval: boolean | undefined,
  ): string[] | undefined {
    const tags = [];

    if (this.#client) {
      tags.push(this.#client);
    }

    if (requestTags?.length) {
      tags.push(...requestTags);
    } else if (isInterval) {
      tags.push(TAG_POLLING);
    }

    return tags?.length ? tags : undefined;
  }
}
