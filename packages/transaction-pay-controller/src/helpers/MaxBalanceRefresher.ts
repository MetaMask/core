import type { TransactionMeta } from '@metamask/transaction-controller';
import { noop } from 'lodash-es';

import type { TransactionPayStrategy } from '../constants.js';
import type {
  GetBalanceCallback,
  TransactionData,
  TransactionPayControllerMessenger,
  UpdateTransactionDataCallback,
} from '../types.js';
import { getMaxBalanceRefreshInterval } from '../utils/feature-flags.js';
import { updateQuotes } from '../utils/quotes.js';
import { updateSourceAmounts } from '../utils/source-amounts.js';

export class MaxBalanceRefresher {
  readonly #getBalance?: GetBalanceCallback;

  readonly #getStrategies: (
    transaction: TransactionMeta,
  ) => TransactionPayStrategy[];

  readonly #messenger: TransactionPayControllerMessenger;

  readonly #updateTransactionData: UpdateTransactionDataCallback;

  readonly #timeoutIds = new Map<string, ReturnType<typeof setInterval>>();

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
    this.#updateTransactionData = updateTransactionData;
  }

  start(transactionId: string): void {
    if (this.#timeoutIds.has(transactionId)) {
      return;
    }

    const transaction = this.#getTransaction(transactionId);
    const interval = getMaxBalanceRefreshInterval(this.#messenger, transaction);

    if (!interval) {
      this.stop(transactionId);
      return;
    }

    this.stop(transactionId);

    const timeoutId = setInterval(() => {
      this.#refresh(transactionId);
    }, interval);

    this.#timeoutIds.set(transactionId, timeoutId);
  }

  stop(transactionId: string): void {
    const timeoutId = this.#timeoutIds.get(transactionId);

    if (timeoutId) {
      clearInterval(timeoutId);
      this.#timeoutIds.delete(transactionId);
    }
  }

  #refresh(transactionId: string): void {
    const transactionData = this.#getTransactionData(transactionId);

    if (!transactionData?.isMaxAmount) {
      this.stop(transactionId);
      return;
    }

    this.#updateTransactionData(transactionId, (draft) => {
      updateSourceAmounts(
        transactionId,
        /* oxlint-disable typescript/no-unnecessary-type-assertion */
        draft as never,
        /* oxlint-enable typescript/no-unnecessary-type-assertion */
        this.#messenger,
        this.#getBalance,
      );
    });

    updateQuotes({
      getStrategies: this.#getStrategies,
      messenger: this.#messenger,
      transactionData: this.#getTransactionData(transactionId),
      transactionId,
      updateTransactionData: this.#updateTransactionData,
    }).catch(noop);
  }

  #getTransaction(transactionId: string): TransactionMeta | undefined {
    return this.#messenger
      .call('TransactionController:getState')
      .transactions.find((transaction) => transaction.id === transactionId);
  }

  #getTransactionData(transactionId: string): TransactionData | undefined {
    return this.#messenger.call('TransactionPayController:getState')
      .transactionData[transactionId];
  }
}
