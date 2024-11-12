import type { BlockTracker } from '@metamask/network-controller';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import type { TransactionMeta } from '../types';

const ACCELERATED_COUNT_MAX = 5;
const ACCELERATED_INTERVAL = 2000;

const log = createModuleLogger(projectLogger, 'transaction-poller');

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

  start(listener: (latestBlockNumber: string) => Promise<void>) {
    if (this.#running) {
      return;
    }

    this.#listener = listener;
    this.#running = true;

    this.#queue();

    log('Started');
  }

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

  setPendingTransactions(pendingTransactions: TransactionMeta[]) {
    const currentPendingTransactionIds = (this.#pendingTransactions ?? []).map(
      (tx) => tx.id,
    );

    this.#pendingTransactions = pendingTransactions;

    const newPendingTransactionIds = pendingTransactions.map((tx) => tx.id);

    const hasNewId = newPendingTransactionIds.some(
      (id) => !currentPendingTransactionIds.includes(id),
    );

    if (!this.#running || !hasNewId) {
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
