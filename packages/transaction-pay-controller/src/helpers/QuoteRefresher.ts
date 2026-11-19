import type { TransactionMeta } from '@metamask/transaction-controller';
import { createModuleLogger } from '@metamask/utils';
import { noop } from 'lodash-es';

import { TransactionPayStrategy } from '../constants.js';
import type {
  TransactionPayControllerMessenger,
  TransactionPayControllerState,
} from '../index.js';
import { projectLogger } from '../logger.js';
import type {
  GetBalanceCallback,
  UpdateTransactionDataCallback,
} from '../types.js';
import { refreshQuotes } from '../utils/quotes.js';

const CHECK_INTERVAL = 1000; // 1 Second

const log = createModuleLogger(projectLogger, 'quote-refresh');

export class QuoteRefresher {
  #isRunning: boolean;

  #isUpdating: boolean;

  readonly #messenger: TransactionPayControllerMessenger;

  #timeoutId: NodeJS.Timeout | undefined;

  readonly #getStrategies: (
    transaction: TransactionMeta,
  ) => TransactionPayStrategy[];

  readonly #getBalance?: GetBalanceCallback;

  readonly #updateTransactionData: UpdateTransactionDataCallback;

  constructor({
    getBalance,
    getStrategies,
    messenger,
    updateTransactionData,
  }: {
    getBalance?: GetBalanceCallback;
    getStrategies: (transaction: TransactionMeta) => TransactionPayStrategy[];
    messenger: TransactionPayControllerMessenger;
    updateTransactionData: UpdateTransactionDataCallback;
  }) {
    this.#getBalance = getBalance;
    this.#getStrategies = getStrategies;
    this.#messenger = messenger;
    this.#isRunning = false;
    this.#isUpdating = false;
    this.#updateTransactionData = updateTransactionData;

    messenger.subscribe(
      'TransactionPayController:stateChange',
      this.#onStateChange.bind(this),
    );
  }

  #start(): void {
    this.#isRunning = true;

    log('Started');

    if (this.#isUpdating) {
      return;
    }

    this.#queueNextInterval();
  }

  #stop(): void {
    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId);
    }

    this.#isRunning = false;

    log('Stopped');
  }

  async #onInterval(): Promise<void> {
    this.#isUpdating = true;

    try {
      await refreshQuotes(
        this.#messenger,
        this.#updateTransactionData,
        this.#getStrategies,
        this.#getBalance,
      );
    } catch (error) {
      log('Error refreshing quotes', error);
    } finally {
      this.#isUpdating = false;

      this.#queueNextInterval();
    }
  }

  #queueNextInterval(): void {
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

  #onStateChange(state: TransactionPayControllerState): void {
    // No-op quotes never refresh, so they don't need the refresh loop.
    const hasQuotes = Object.values(state.transactionData).some((transaction) =>
      transaction.quotes?.some(
        (quote) => quote.strategy !== TransactionPayStrategy.None,
      ),
    );

    if (hasQuotes && !this.#isRunning) {
      this.#start();
    } else if (!hasQuotes && this.#isRunning) {
      this.#stop();
    }
  }
}
