import { createModuleLogger } from '@metamask/utils';
import { noop } from 'lodash';

import type {
  TransactionPayControllerMessenger,
  TransactionPayControllerState,
} from '..';
import { projectLogger } from '../logger';
import type { UpdateTransactionDataCallback } from '../types';
import { refreshQuotes } from '../utils/quotes';

const CHECK_INTERVAL = 1000; // 1 Second

const log = createModuleLogger(projectLogger, 'quote-refresh');

export class QuoteRefresher {
  #isRunning: boolean;

  #isUpdating: boolean;

  readonly #messenger: TransactionPayControllerMessenger;

  #timeoutId: NodeJS.Timeout | undefined;

  readonly #updateTransactionData: UpdateTransactionDataCallback;

  constructor({
    messenger,
    updateTransactionData,
  }: {
    messenger: TransactionPayControllerMessenger;
    updateTransactionData: UpdateTransactionDataCallback;
  }) {
    this.#messenger = messenger;
    this.#isRunning = false;
    this.#isUpdating = false;
    this.#updateTransactionData = updateTransactionData;

    messenger.subscribe(
      'TransactionPayController:stateChange',
      this.#onStateChange.bind(this),
    );
  }

  #start() {
    this.#isRunning = true;

    log('Started');

    if (this.#isUpdating) {
      return;
    }

    this.#queueNextInterval();
  }

  #stop() {
    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId);
    }

    this.#isRunning = false;

    log('Stopped');
  }

  async #onInterval() {
    this.#isUpdating = true;

    try {
      await refreshQuotes(this.#messenger, this.#updateTransactionData);
    } catch (error) {
      log('Error refreshing quotes', error);
    } finally {
      this.#isUpdating = false;

      this.#queueNextInterval();
    }
  }

  #queueNextInterval() {
    if (!this.#isRunning) {
      return;
    }

    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId);
    }

    this.#timeoutId = setTimeout(() => {
      this.#onInterval().catch(noop);
    }, CHECK_INTERVAL);
  }

  #onStateChange(state: TransactionPayControllerState) {
    const hasQuotes = Object.values(state.transactionData).some((transaction) =>
      Boolean(transaction.quotes?.length),
    );

    if (hasQuotes && !this.#isRunning) {
      this.#start();
    } else if (!hasQuotes && this.#isRunning) {
      this.#stop();
    }
  }
}
