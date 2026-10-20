import type { TransactionMeta } from '@metamask/transaction-controller';

import { getMaxBalanceRefreshInterval } from '../utils/feature-flags.js';
import type {
  GetBalanceCallback,
  TransactionData,
  TransactionPayControllerMessenger,
} from '../types.js';
import { updateSourceAmounts } from '../utils/source-amounts.js';

export class MaxBalanceRefresher {
  readonly #getBalance?: GetBalanceCallback;

  readonly #messenger: TransactionPayControllerMessenger;

  readonly #timeoutIds = new Map<string, ReturnType<typeof setInterval>>();

  constructor({
    getBalance,
    messenger,
  }: {
    getBalance?: GetBalanceCallback;
    messenger: TransactionPayControllerMessenger;
  }) {
    this.#getBalance = getBalance;
    this.#messenger = messenger;
  }

  start(transactionId: string): void {
    if (!this.#getBalance) {
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

  #getTransaction(transactionId: string): TransactionMeta | undefined {
    return this.#messenger
      .call('TransactionController:getState')
      .transactions.find((transaction) => transaction.id === transactionId);
  }

  #getTransactionData(transactionId: string): TransactionData | undefined {
    return this.#messenger.call('TransactionPayController:getState')
      .transactionData[transactionId];
  }

  #refresh(transactionId: string): void {
    const transactionData = this.#getTransactionData(transactionId);

    if (!transactionData?.isMaxAmount) {
      this.stop(transactionId);
      return;
    }

    updateSourceAmounts(
      transactionId,
      transactionData as never,
      this.#messenger,
      this.#getBalance,
    );
  }
}
