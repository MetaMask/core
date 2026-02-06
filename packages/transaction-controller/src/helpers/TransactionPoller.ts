import type { Transaction } from '@metamask/core-backend';
import type { BlockTracker } from '@metamask/network-controller';
import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { isEqual } from 'lodash';

import { projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { TransactionMeta } from '../types';
import { getAcceleratedPollingParams } from '../utils/feature-flags';
import { caip2ToHex } from '../utils/utils';

const log = createModuleLogger(projectLogger, 'transaction-poller');

enum IntervalTrigger {
  Accelerated = 'Accelerated',
  BlockTracker = 'BlockTracker',
  Websocket = 'Websocket',
}

/**
 * Helper class to orchestrate when to poll pending transactions.
 * Initially starts polling via a timeout chain every 2 seconds up to 5 times.
 * Following that, it will poll on every new block via the block tracker.
 */
export class TransactionPoller {
  #acceleratedCount = 0;

  readonly #blockTracker: BlockTracker;

  readonly #chainId: Hex;

  readonly #messenger: TransactionControllerMessenger;

  #blockTrackerListener?: (latestBlockNumber: string) => void;

  #listener?: (latestBlockNumber: string) => Promise<void>;

  #pendingTransactions?: TransactionMeta[];

  #running = false;

  #timeout?: NodeJS.Timeout;

  constructor({
    blockTracker,
    chainId,
    messenger,
  }: {
    blockTracker: BlockTracker;
    chainId: Hex;
    messenger: TransactionControllerMessenger;
  }) {
    this.#blockTracker = blockTracker;
    this.#chainId = chainId;
    this.#messenger = messenger;
  }

  /**
   * Start the poller with a listener that will be called on every interval.
   *
   * @param listener - The listener to call on every interval.
   */
  start(listener: (latestBlockNumber: string) => Promise<void>): void {
    if (this.#running) {
      return;
    }

    this.#listener = listener;
    this.#running = true;

    this.#subscribeToTransactionUpdates();

    this.#queue();

    log('Started');
  }

  /**
   * Stop the poller.
   * Remove all timeouts and block tracker listeners.
   */
  stop(): void {
    if (!this.#running) {
      return;
    }

    this.#running = false;
    this.#listener = undefined;
    this.#acceleratedCount = 0;
    this.#pendingTransactions = undefined;

    this.#stopTimeout();
    this.#stopBlockTracker();
    this.#unsubscribeFromTransactionUpdates();

    log('Stopped');
  }

  /**
   * Notify the poller of the pending transactions being monitored.
   * This will reset to the accelerated polling and reset the count
   * when new transactions are added or removed.
   *
   * @param pendingTransactions - The pending transactions to poll.
   */
  setPendingTransactions(pendingTransactions: TransactionMeta[]): void {
    const currentPendingTransactionIds = (this.#pendingTransactions ?? []).map(
      (tx) => tx.id,
    );

    this.#pendingTransactions = pendingTransactions;

    const newPendingTransactionIds = pendingTransactions.map((tx) => tx.id);

    const hasUpdatedIds = !isEqual(
      currentPendingTransactionIds,
      newPendingTransactionIds,
    );

    if (!this.#running || !hasUpdatedIds) {
      return;
    }

    log('Detected new pending transactions', newPendingTransactionIds);

    this.#acceleratedCount = 0;

    if (this.#blockTrackerListener) {
      this.#stopBlockTracker();
      this.#queue();
    }
  }

  #queue(): void {
    if (!this.#running) {
      return;
    }

    const { countMax, intervalMs } = getAcceleratedPollingParams(
      this.#chainId,
      this.#messenger,
    );

    if (this.#acceleratedCount >= countMax) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.#blockTrackerListener = (latestBlockNumber): Promise<void> =>
        this.#interval(IntervalTrigger.BlockTracker, latestBlockNumber);

      this.#blockTracker.on('latest', this.#blockTrackerListener);

      log('Added block tracker listener');

      return;
    }

    this.#stopTimeout();

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.#timeout = setTimeout(async () => {
      await this.#interval(IntervalTrigger.Accelerated);
      this.#queue();
    }, intervalMs);
  }

  async #interval(
    trigger: IntervalTrigger,
    latestBlockNumber?: string,
  ): Promise<void> {
    switch (trigger) {
      case IntervalTrigger.Websocket:
        log('AccountActivityService:transactionUpdated received');
        break;
      case IntervalTrigger.Accelerated:
        log('Accelerated interval', this.#acceleratedCount + 1);
        break;
      case IntervalTrigger.BlockTracker:
        log('Block tracker interval', latestBlockNumber);
        break;
      default:
        break;
    }

    const latestBlockNumberFinal =
      latestBlockNumber ?? (await this.#blockTracker.getLatestBlock());

    await this.#listener?.(latestBlockNumberFinal);

    if (trigger === IntervalTrigger.Accelerated && this.#running) {
      this.#acceleratedCount += 1;
    }
  }

  #stopTimeout(): void {
    if (!this.#timeout) {
      return;
    }

    clearTimeout(this.#timeout);
    this.#timeout = undefined;
  }

  #stopBlockTracker(): void {
    if (!this.#blockTrackerListener) {
      return;
    }

    this.#blockTracker.removeListener('latest', this.#blockTrackerListener);
    this.#blockTrackerListener = undefined;
  }

  readonly #transactionUpdatedHandler = (transaction: Transaction): void => {
    if (!this.#running) {
      return;
    }

    const hexChainId = caip2ToHex(transaction.chain);
    if (hexChainId !== this.#chainId) {
      return;
    }

    if (
      transaction.status !== 'confirmed' &&
      transaction.status !== 'dropped' &&
      transaction.status !== 'failed'
    ) {
      return;
    }

    const selectedAccount = this.#messenger.call(
      'AccountsController:getSelectedAccount',
    );
    if (
      selectedAccount.address.toLowerCase() !== transaction.from.toLowerCase()
    ) {
      return;
    }

    const isPendingTransaction = this.#pendingTransactions?.some(
      (tx) => tx.hash?.toLowerCase() === transaction.id.toLowerCase(),
    );
    if (!isPendingTransaction) {
      return;
    }

    this.#interval(IntervalTrigger.Websocket).catch(() => {
      // Silently catch errors to prevent unhandled rejections
    });
  };

  #subscribeToTransactionUpdates(): void {
    this.#messenger.subscribe(
      'AccountActivityService:transactionUpdated',
      this.#transactionUpdatedHandler,
    );
  }

  #unsubscribeFromTransactionUpdates(): void {
    this.#messenger.unsubscribe(
      'AccountActivityService:transactionUpdated',
      this.#transactionUpdatedHandler,
    );
  }
}
