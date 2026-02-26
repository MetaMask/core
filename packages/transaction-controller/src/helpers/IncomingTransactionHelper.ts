import type { AccountsController } from '@metamask/accounts-controller';
import type {
  Transaction as AccountActivityTransaction,
  WebSocketConnectionInfo,
} from '@metamask/core-backend';
import type { Hex } from '@metamask/utils';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import-x/no-nodejs-modules
import EventEmitter from 'events';

import { SUPPORTED_CHAIN_IDS } from './AccountsApiRemoteTransactionSource';
import type { TransactionControllerMessenger } from '..';
import { incomingTransactionsLogger as log } from '../logger';
import type { RemoteTransactionSource, TransactionMeta } from '../types';
import {
  getIncomingTransactionsPollingInterval,
  isIncomingTransactionsUseBackendWebSocketServiceEnabled,
} from '../utils/feature-flags';
import { caip2ToHex } from '../utils/utils';

export enum WebSocketState {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
}

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

  readonly #useBackendWebSocketService: boolean;

  // Chains that need polling (start with all supported, remove as they come up)
  readonly #chainsToPoll: Hex[] = [...SUPPORTED_CHAIN_IDS];

  readonly #connectionStateChangedHandler = (
    connectionInfo: WebSocketConnectionInfo,
  ): void => {
    this.#onConnectionStateChanged(connectionInfo);
  };

  readonly #transactionUpdatedHandler = (
    transaction: AccountActivityTransaction,
  ): void => {
    this.#onTransactionUpdated(transaction);
  };

  readonly #selectedAccountChangedHandler = (): void => {
    this.#onSelectedAccountChanged();
  };

  readonly #statusChangedHandler = ({
    chainIds,
    status,
  }: {
    chainIds: string[];
    status: 'up' | 'down';
  }): void => {
    this.#onNetworkStatusChanged(chainIds, status);
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
    this.#useBackendWebSocketService =
      isIncomingTransactionsUseBackendWebSocketServiceEnabled(messenger);

    if (this.#useBackendWebSocketService) {
      this.#messenger.subscribe(
        'BackendWebSocketService:connectionStateChanged',
        this.#connectionStateChangedHandler,
      );

      this.#messenger.subscribe(
        'AccountActivityService:statusChanged',
        this.#statusChangedHandler,
      );
    }
  }

  start(): void {
    // When websockets are disabled, allow normal polling (legacy mode)
    if (this.#useBackendWebSocketService) {
      return;
    }

    this.#startPolling(true);
  }

  #startPolling(initialPolling = false): void {
    if (this.#isRunning) {
      return;
    }

    if (!this.#canStart()) {
      return;
    }

    const interval = this.#getInterval();

    log('Started polling', {
      interval,
    });

    this.#isRunning = true;

    if (this.#isUpdating) {
      return;
    }

    this.#onInterval().catch((error) => {
      log(initialPolling ? 'Initial polling failed' : 'Polling failed', error);
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
      // When websockets enabled, only poll chains that are not confirmed up
      const chainIds = this.#useBackendWebSocketService
        ? this.#chainsToPoll
        : undefined;
      await this.update({ chainIds, isInterval: true });
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
    chainIds,
    isInterval,
    tags,
  }: {
    chainIds?: Hex[];
    isInterval?: boolean;
    tags?: string[];
  } = {}): Promise<void> {
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
          chainIds,
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

  #onNetworkStatusChanged(chainIds: string[], status: 'up' | 'down'): void {
    if (!this.#useBackendWebSocketService) {
      return;
    }

    let hasChanges = false;

    for (const caip2ChainId of chainIds) {
      const hexChainId = caip2ToHex(caip2ChainId);

      if (!hexChainId || !SUPPORTED_CHAIN_IDS.includes(hexChainId)) {
        log('Chain ID not recognized or not supported', {
          caip2ChainId,
          hexChainId,
        });
        continue;
      }

      if (status === 'up') {
        const index = this.#chainsToPoll.indexOf(hexChainId);
        if (index !== -1) {
          this.#chainsToPoll.splice(index, 1);
          hasChanges = true;
          log('Supported network came up, removed from polling list', {
            chainId: hexChainId,
          });
        }
      } else if (
        status === 'down' &&
        !this.#chainsToPoll.includes(hexChainId)
      ) {
        this.#chainsToPoll.push(hexChainId);
        hasChanges = true;
        log('Supported network went down, added to polling list', {
          chainId: hexChainId,
        });
      }
    }

    if (!hasChanges) {
      log('No changes to polling list', {
        chainsToPoll: this.#chainsToPoll,
      });
      return;
    }

    if (this.#chainsToPoll.length === 0) {
      log('Stopping fallback polling - all networks up');
      this.stop();
    } else {
      log('Starting fallback polling - some networks need polling', {
        chainsToPoll: this.#chainsToPoll,
      });
      this.#startPolling();
    }
  }
}
