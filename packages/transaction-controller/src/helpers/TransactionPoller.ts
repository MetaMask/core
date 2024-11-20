import type { BlockTracker } from '@metamask/network-controller';
import { createModuleLogger } from '@metamask/utils';
import { isEqual } from 'lodash';

import { projectLogger } from '../logger';
import type { TransactionMeta } from '../types';

export const ACCELERATED_COUNT_MAX = 5;
export const ACCELERATED_INTERVAL = 1000 * 2; // 2 Seconds

const log = createModuleLogger(projectLogger, 'transaction-poller');

/**
 * Helper class to orchestrate when to poll pending transactions.
 * Initially starts polling via a timeout chain every 2 seconds up to 5 times.
 * Following that, it will poll on every new block via the block tracker.
 */
export class TransactionPoller {
  #acceleratedCount = 0;

  #blockTracker: BlockTracker;

  #blockTrackerListener?: (latestBlockNumber: string) => void;

  #listener?: (latestBlockNumber: string) => Promise<void>;

  #pendingTransactions?: TransactionMeta[];

  #running = false;

  #timeout?: NodeJS.Timeout;

  constructor(blockTracker: BlockTracker) {
    this.#blockTracker = blockTracker;
  }

  /**
   * Start the poller with a listener that will be called on every interval.
   * @param listener - The listener to call on every interval.
   */
  start(listener: (latestBlockNumber: string) => Promise<void>) {
    if (this.#running) {
      return;
    }

    this.#listener = listener;
    this.#running = true;

    this.#queue();

    log('Started');
  }

  /**
   * Stop the poller.
   * Remove all timeouts and block tracker listeners.
   */
  stop() {
    if (!this.#running) {
      return;
    }

    this.#running = false;
    this.#listener = undefined;
    this.#acceleratedCount = 0;
    this.#pendingTransactions = undefined;

    this.#stopTimeout();
    this.#stopBlockTracker();

    log('Stopped');
  }

  /**
   * Notify the poller of the pending transactions being monitored.
   * This will reset to the accelerated polling and reset the count
   * when new transactions are added or removed.
   * @param pendingTransactions - The pending transactions to poll.
   */
  setPendingTransactions(pendingTransactions: TransactionMeta[]) {
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

  #queue() {
    if (!this.#running) {
      return;
    }

    if (this.#acceleratedCount >= ACCELERATED_COUNT_MAX) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.#blockTrackerListener = (latestBlockNumber) =>
        this.#interval(false, latestBlockNumber);

      this.#blockTracker.on('latest', this.#blockTrackerListener);

      log('Added block tracker listener');

      return;
    }

    this.#stopTimeout();

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.#timeout = setTimeout(async () => {
      await this.#interval(true);
      this.#queue();
    }, ACCELERATED_INTERVAL);
  }

  async #interval(isAccelerated: boolean, latestBlockNumber?: string) {
    if (isAccelerated) {
      log('Accelerated interval', this.#acceleratedCount + 1);
    } else {
      log('Block tracker interval', latestBlockNumber);
    }

    const latestBlockNumberFinal =
      latestBlockNumber ?? (await this.#blockTracker.getLatestBlock());

    await this.#listener?.(latestBlockNumberFinal);

    if (isAccelerated && this.#running) {
      this.#acceleratedCount += 1;
    }
  }

  #stopTimeout() {
    if (!this.#timeout) {
      return;
    }

    clearTimeout(this.#timeout);
    this.#timeout = undefined;
  }

  #stopBlockTracker() {
    if (!this.#blockTrackerListener) {
      return;
    }

    this.#blockTracker.removeListener('latest', this.#blockTrackerListener);
    this.#blockTrackerListener = undefined;
  }
}
