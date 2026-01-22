import type { AccountsController } from '@metamask/accounts-controller';
import type {
  Transaction as AccountActivityTransaction,
  WebSocketConnectionInfo,
} from '@metamask/core-backend';
import { WebSocketState } from '@metamask/core-backend';
import type { Hex } from '@metamask/utils';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import-x/no-nodejs-modules
import EventEmitter from 'events';

import type { TransactionControllerMessenger } from '..';
import { incomingTransactionsLogger as log } from '../logger';
import type { RemoteTransactionSource, TransactionMeta } from '../types';
import {
  getIncomingTransactionsPollingInterval,
  isEnhancedHistoryRetrievalEnabled,
} from '../utils/feature-flags';

export type IncomingTransactionOptions = {
  /** Name of the client to include in requests. */
  client?: string;

  /** Whether to retrieve incoming token transfers. Defaults to false. */
  includeTokenTransfers?: boolean;

  /** Callback to determine if incoming transaction polling is enabled. */
  isEnabled?: () => boolean;

  /** @deprecated No longer used. */
  queryEntireHistory?: boolean;

  /** Whether to retrieve outgoing transactions. Defaults to false. */
  updateTransactions?: boolean;
};

const TAG_POLLING = 'automatic-polling';

export class IncomingTransactionHelper {
  hub: EventEmitter;

  readonly #client?: string;

  readonly #getCurrentAccount: () => ReturnType<
    AccountsController['getSelectedAccount']
  >;

  readonly #getLocalTransactions: () => TransactionMeta[];

  readonly #includeTokenTransfers?: boolean;

  readonly #isEnabled: () => boolean;

  #isRunning: boolean;

  #isUpdating: boolean;

  readonly #messenger: TransactionControllerMessenger;

  readonly #remoteTransactionSource: RemoteTransactionSource;

  #timeoutId?: unknown;

  readonly #trimTransactions: (
    transactions: TransactionMeta[],
  ) => TransactionMeta[];

  readonly #updateTransactions?: boolean;

  readonly #isEnhancedHistoryEnabled: boolean;

  readonly #transactionUpdatedHandler = (
    transaction: AccountActivityTransaction,
  ): void => {
    this.#onTransactionUpdated(transaction);
  };

  readonly #connectionStateChangedHandler = (
    connectionInfo: WebSocketConnectionInfo,
  ): void => {
    this.#onConnectionStateChanged(connectionInfo);
  };

  readonly #selectedAccountChangedHandler = (): void => {
    this.#onSelectedAccountChanged();
  };

  constructor({
    client,
    getCurrentAccount,
    getLocalTransactions,
    includeTokenTransfers,
    isEnabled,
    messenger,
    remoteTransactionSource,
    trimTransactions,
    updateTransactions,
  }: {
    client?: string;
    getCurrentAccount: () => ReturnType<
      AccountsController['getSelectedAccount']
    >;
    getLocalTransactions: () => TransactionMeta[];
    includeTokenTransfers?: boolean;
    isEnabled?: () => boolean;
    messenger: TransactionControllerMessenger;
    remoteTransactionSource: RemoteTransactionSource;
    trimTransactions: (transactions: TransactionMeta[]) => TransactionMeta[];
    updateTransactions?: boolean;
  }) {
    this.hub = new EventEmitter();

    this.#client = client;
    this.#getCurrentAccount = getCurrentAccount;
    this.#getLocalTransactions = getLocalTransactions;
    this.#includeTokenTransfers = includeTokenTransfers;
    this.#isEnabled = isEnabled ?? ((): boolean => true);
    this.#isRunning = false;
    this.#isUpdating = false;
    this.#messenger = messenger;
    this.#remoteTransactionSource = remoteTransactionSource;
    this.#trimTransactions = trimTransactions;
    this.#updateTransactions = updateTransactions;
    this.#isEnhancedHistoryEnabled =
      isEnhancedHistoryRetrievalEnabled(messenger);

    if (this.#isEnhancedHistoryEnabled) {
      this.#messenger.subscribe(
        'BackendWebSocketService:connectionStateChanged',
        this.#connectionStateChangedHandler,
      );
    }
  }

  start(): void {
    if (this.#isRunning || this.#isEnhancedHistoryEnabled) {
      return;
    }

    if (!this.#canStart()) {
      return;
    }

    const interval = this.#getInterval();

    log('Started polling', { interval });

    this.#isRunning = true;

    if (this.#isUpdating) {
      return;
    }

    this.#onInterval().catch((error) => {
      log('Initial polling failed', error);
    });
  }

  stop(): void {
    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId as number);
    }

    if (!this.#isRunning) {
      return;
    }

    this.#isRunning = false;

    log('Stopped polling');
  }

  #onConnectionStateChanged(connectionInfo: WebSocketConnectionInfo): void {
    if (connectionInfo.state === WebSocketState.CONNECTED) {
      log('WebSocket connected, starting enhanced mode');
      this.#startTransactionHistoryRetrieval();
    } else if (connectionInfo.state === WebSocketState.DISCONNECTED) {
      log('WebSocket disconnected, stopping enhanced mode');
      this.#stopTransactionHistoryRetrieval();
    }
  }

  #startTransactionHistoryRetrieval(): void {
    if (!this.#canStart()) {
      return;
    }

    log('Started transaction history retrieval (event-driven)');

    this.update().catch((error) => {
      log('Initial update in transaction history retrieval failed', error);
    });

    this.#messenger.subscribe(
      'AccountActivityService:transactionUpdated',
      this.#transactionUpdatedHandler,
    );

    this.#messenger.subscribe(
      'AccountsController:selectedAccountChange',
      this.#selectedAccountChangedHandler,
    );
  }

  #stopTransactionHistoryRetrieval(): void {
    log('Stopped transaction history retrieval');

    this.#messenger.unsubscribe(
      'AccountActivityService:transactionUpdated',
      this.#transactionUpdatedHandler,
    );

    this.#messenger.unsubscribe(
      'AccountsController:selectedAccountChange',
      this.#selectedAccountChangedHandler,
    );
  }

  #onTransactionUpdated(transaction: AccountActivityTransaction): void {
    log('Received relevant transaction update, triggering update', {
      txId: transaction.id,
      chain: transaction.chain,
    });

    this.update().catch((error) => {
      log('Update after transaction event failed', error);
    });
  }

  #onSelectedAccountChanged(): void {
    log('Selected account changed, triggering update');

    this.update().catch((error) => {
      log('Update after account change failed', error);
    });
  }

  async #onInterval(): Promise<void> {
    this.#isUpdating = true;

    try {
      await this.update({ isInterval: true });
    } catch (error) {
      console.error('Error while checking incoming transactions', error);
    }

    this.#isUpdating = false;

    if (this.#isRunning) {
      if (this.#timeoutId) {
        clearTimeout(this.#timeoutId as number);
      }

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
    const includeTokenTransfers = this.#includeTokenTransfers ?? true;
    const updateTransactions = this.#updateTransactions ?? false;

    let remoteTransactions: TransactionMeta[] = [];

    try {
      remoteTransactions =
        await this.#remoteTransactionSource.fetchTransactions({
          address: account.address as Hex,
          includeTokenTransfers,
          tags: finalTags,
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

  #sortTransactionsByTime(transactions: TransactionMeta[]): void {
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
