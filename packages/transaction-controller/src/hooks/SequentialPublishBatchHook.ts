import type EthQuery from '@metamask/eth-query';
import { rpcErrors } from '@metamask/rpc-errors';
import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { PendingTransactionTracker } from '../helpers/PendingTransactionTracker';
import { projectLogger } from '../logger';
import {
  type PublishBatchHook,
  type PublishBatchHookRequest,
  type PublishBatchHookResult,
  type TransactionMeta,
} from '../types';

const log = createModuleLogger(projectLogger, 'sequential-publish-batch-hook');

type SequentialPublishBatchHookOptions = {
  publishTransaction: (
    ethQuery: EthQuery,
    transactionMeta: TransactionMeta,
  ) => Promise<Hex>;
  getTransaction: (id: string) => TransactionMeta;
  getEthQuery: (networkClientId: string) => EthQuery;
  getPendingTransactionTracker: (
    networkClientId: string,
  ) => PendingTransactionTracker;
};

/**
 * Custom publish logic that also publishes additional sequential transactions in a batch.
 * Requires the batch to be successful to resolve.
 */
export class SequentialPublishBatchHook {
  readonly #publishTransaction: (
    ethQuery: EthQuery,
    transactionMeta: TransactionMeta,
  ) => Promise<Hex>;

  readonly #getTransaction: (id: string) => TransactionMeta;

  readonly #getEthQuery: (networkClientId: string) => EthQuery;

  readonly #getPendingTransactionTracker: (
    networkClientId: string,
  ) => PendingTransactionTracker;

  #boundListeners: Record<
    string,
    {
      onConfirmed: (txMeta: TransactionMeta) => void;
      onFailedOrDropped: (txMeta: TransactionMeta, error?: Error) => void;
    }
  > = {};

  constructor({
    publishTransaction,
    getTransaction,
    getPendingTransactionTracker,
    getEthQuery,
  }: SequentialPublishBatchHookOptions) {
    this.#publishTransaction = publishTransaction;
    this.#getTransaction = getTransaction;
    this.#getEthQuery = getEthQuery;
    this.#getPendingTransactionTracker = getPendingTransactionTracker;
  }

  /**
   * @returns The publish batch hook function.
   */
  getHook(): PublishBatchHook {
    return this.#hook.bind(this);
  }

  async #hook({
    from,
    networkClientId,
    transactions,
  }: PublishBatchHookRequest): Promise<PublishBatchHookResult> {
    log('Starting sequential publish batch hook', { from, networkClientId });

    const pendingTransactionTracker =
      this.#getPendingTransactionTracker(networkClientId);
    const results = [];

    for (const transaction of transactions) {
      try {
        const transactionMeta = this.#getTransaction(String(transaction.id));

        const transactionHash = await this.#publishTransaction(
          this.#getEthQuery(networkClientId),
          transactionMeta,
        );
        log('Transaction published', { transactionHash });

        const transactionUpdated = {
          ...transactionMeta,
          hash: transactionHash,
        };

        const confirmationPromise = this.#waitForTransactionEvent(
          pendingTransactionTracker,
          transactionUpdated.id,
          transactionUpdated.hash,
        );

        pendingTransactionTracker.addTransactionToPoll(transactionUpdated);

        await confirmationPromise;
        results.push({ transactionHash });
      } catch (error) {
        log('Batch transaction failed', { transaction, error });
        pendingTransactionTracker.stop();
        throw rpcErrors.internal(`Failed to publish batch transaction`);
      }
    }

    log('Sequential publish batch hook completed', { results });
    pendingTransactionTracker.stop();

    return { results };
  }

  /**
   * Waits for a transaction event (confirmed, failed, or dropped) and resolves/rejects accordingly.
   *
   * @param pendingTransactionTracker - The tracker instance to subscribe to events.
   * @param transactionId - The transaction ID.
   * @param transactionHash - The hash of the transaction.
   * @returns A promise that resolves when the transaction is confirmed or rejects if it fails or is dropped.
   */
  async #waitForTransactionEvent(
    pendingTransactionTracker: PendingTransactionTracker,
    transactionId: string,
    transactionHash: string,
  ): Promise<TransactionMeta> {
    return new Promise((resolve, reject) => {
      const onConfirmed = this.#onConfirmed.bind(
        this,
        transactionId,
        transactionHash,
        resolve,
        pendingTransactionTracker,
      );

      const onFailedOrDropped = this.#onFailedOrDropped.bind(
        this,
        transactionId,
        transactionHash,
        reject,
        pendingTransactionTracker,
      );

      this.#boundListeners[transactionId] = {
        onConfirmed,
        onFailedOrDropped,
      };

      pendingTransactionTracker.hub.on('transaction-confirmed', onConfirmed);
      pendingTransactionTracker.hub.on('transaction-failed', onFailedOrDropped);
      pendingTransactionTracker.hub.on(
        'transaction-dropped',
        onFailedOrDropped,
      );
    });
  }

  #onConfirmed(
    transactionId: string,
    transactionHash: string,
    resolve: (txMeta: TransactionMeta) => void,
    pendingTransactionTracker: PendingTransactionTracker,
    txMeta: TransactionMeta,
  ): void {
    if (txMeta.id !== transactionId) {
      return;
    }

    log('Transaction confirmed', { transactionHash });
    this.#removeListeners(pendingTransactionTracker, transactionId);
    resolve(txMeta);
  }

  #onFailedOrDropped(
    transactionId: string,
    transactionHash: string,
    reject: (error: Error) => void,
    pendingTransactionTracker: PendingTransactionTracker,
    txMeta: TransactionMeta,
    error?: Error,
  ): void {
    if (txMeta.id !== transactionId) {
      return;
    }

    log('Transaction failed or dropped', { transactionHash, error });
    this.#removeListeners(pendingTransactionTracker, transactionId);
    reject(new Error(`Transaction ${transactionHash} failed or dropped.`));
  }

  #removeListeners(
    pendingTransactionTracker: PendingTransactionTracker,
    transactionId: string,
  ): void {
    const listeners = this.#boundListeners[transactionId];

    pendingTransactionTracker.hub.off(
      'transaction-confirmed',
      listeners.onConfirmed,
    );
    pendingTransactionTracker.hub.off(
      'transaction-failed',
      listeners.onFailedOrDropped,
    );
    pendingTransactionTracker.hub.off(
      'transaction-dropped',
      listeners.onFailedOrDropped,
    );

    delete this.#boundListeners[transactionId];
  }
}
