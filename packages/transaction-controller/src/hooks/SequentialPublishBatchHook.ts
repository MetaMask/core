import type EthQuery from '@metamask/eth-query';
import { rpcErrors } from '@metamask/rpc-errors';
import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { PendingTransactionTracker } from '../helpers/PendingTransactionTracker';
import { projectLogger } from '../logger';
import type {
  PublishBatchHook,
  PublishBatchHookRequest,
  PublishBatchHookResult,
  TransactionMeta,
} from '../types';

const log = createModuleLogger(projectLogger, 'sequential-publish-batch-hook');

type SequentialPublishBatchHookOptions = {
  publishTransaction: (
    ethQuery: EthQuery,
    transactionMeta: TransactionMeta,
  ) => Promise<Hex>;
  getTransaction: (id: string) => TransactionMeta;
  getEthQuery: (networkClientId: string) => EthQuery;
  getPendingTransactionTrackerByChainId: (
    networkClientId: string,
  ) => PendingTransactionTracker;
};

type TrackerListenersOptions = {
  pendingTransactionTracker: PendingTransactionTracker;
  onConfirmed: (txMeta: TransactionMeta) => void;
  onFailedOrDropped: (txMeta: TransactionMeta, error?: Error) => void;
};

type OnConfirmedHandlerOptions = {
  transactionMeta: TransactionMeta;
  transactionHash: string;
  resolve: (txMeta: TransactionMeta) => void;
  pendingTransactionTracker: PendingTransactionTracker;
};

type OnFailedOrDroppedHandlerOptions = {
  transactionMeta: TransactionMeta;
  transactionHash: string;
  reject: (error: Error) => void;
  pendingTransactionTracker: PendingTransactionTracker;
};

/**
 * Custom publish logic that also publishes additional sequential transactions in an batch.
 * Requires the batch to be successful to resolve.
 */
export class SequentialPublishBatchHook {
  readonly #publishTransaction: (
    ethQuery: EthQuery,
    transactionMeta: TransactionMeta,
  ) => Promise<Hex>;

  readonly #getTransaction: (id: string) => TransactionMeta;

  readonly #getEthQuery: (networkClientId: string) => EthQuery;

  readonly #getPendingTransactionTrackerByChainId: (
    networkClientId: string,
  ) => PendingTransactionTracker;

  constructor({
    publishTransaction,
    getTransaction,
    getPendingTransactionTrackerByChainId,
    getEthQuery,
  }: SequentialPublishBatchHookOptions) {
    this.#publishTransaction = publishTransaction;
    this.#getTransaction = getTransaction;
    this.#getEthQuery = getEthQuery;
    this.#getPendingTransactionTrackerByChainId =
      getPendingTransactionTrackerByChainId;
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
      this.#getPendingTransactionTrackerByChainId(networkClientId);
    const results = [];

    for (const transaction of transactions) {
      try {
        const transactionMeta = this.#getTransaction(String(transaction.id));

        const transactionHash = await this.#publishTransaction(
          this.#getEthQuery(networkClientId),
          transactionMeta,
        );
        log('Transaction published', { transactionHash });

        // Force check the transaction to ensure it is tracked.
        await pendingTransactionTracker.forceCheckTransaction(transactionMeta);

        const confirmationPromise = this.#waitForTransactionEvent(
          pendingTransactionTracker,
          transactionMeta,
          transactionHash,
        );

        await confirmationPromise;
        results.push({ transactionHash });
      } catch (error) {
        log('Batch transaction failed', { transaction, error });
        throw rpcErrors.internal(`Failed to publish batch transaction`);
      }
    }
    log('Sequential publish batch hook completed', { results });

    return { results };
  }

  /**
   * Waits for a transaction event (confirmed, failed, or dropped) and resolves/rejects accordingly.
   *
   * @param pendingTransactionTracker - The tracker instance to subscribe to events.
   * @param transactionMeta - The transaction metadata.
   * @param transactionHash - The hash of the transaction.
   * @returns A promise that resolves when the transaction is confirmed or rejects if it fails or is dropped.
   */
  async #waitForTransactionEvent(
    pendingTransactionTracker: PendingTransactionTracker,
    transactionMeta: TransactionMeta,
    transactionHash: string,
  ): Promise<TransactionMeta> {
    return new Promise((resolve, reject) => {
      const onConfirmed = this.#onConfirmedHandler({
        transactionMeta,
        transactionHash,
        resolve,
        pendingTransactionTracker,
      });

      const onFailedOrDropped = this.#onFailedOrDroppedHandler({
        transactionMeta,
        transactionHash,
        reject,
        pendingTransactionTracker,
      });

      this.#addListeners({
        pendingTransactionTracker,
        onConfirmed,
        onFailedOrDropped,
      });
    });
  }

  #onConfirmedHandler({
    transactionMeta,
    transactionHash,
    resolve,
    pendingTransactionTracker,
  }: OnConfirmedHandlerOptions): (txMeta: TransactionMeta) => void {
    return (txMeta) => {
      if (txMeta.id === transactionMeta.id) {
        log('Transaction confirmed', { transactionHash });
        this.#removeListeners({
          pendingTransactionTracker,
        });
        resolve(txMeta);
      }
    };
  }

  #onFailedOrDroppedHandler({
    transactionMeta,
    transactionHash,
    reject,
    pendingTransactionTracker,
  }: OnFailedOrDroppedHandlerOptions): (
    txMeta: TransactionMeta,
    error?: Error,
  ) => void {
    return (txMeta, error) => {
      if (txMeta.id === transactionMeta.id) {
        log('Transaction failed or dropped', { transactionHash, error });
        this.#removeListeners({
          pendingTransactionTracker,
        });
        reject(new Error(`Transaction ${transactionHash} failed or dropped.`));
      }
    };
  }

  #addListeners({
    pendingTransactionTracker,
    onConfirmed,
    onFailedOrDropped,
  }: TrackerListenersOptions): void {
    pendingTransactionTracker.hub.on('transaction-confirmed', onConfirmed);
    pendingTransactionTracker.hub.on('transaction-dropped', onFailedOrDropped);
    pendingTransactionTracker.hub.on('transaction-failed', onFailedOrDropped);
  }

  #removeListeners({
    pendingTransactionTracker,
  }: {
    pendingTransactionTracker: PendingTransactionTracker;
  }): void {
    pendingTransactionTracker.hub.removeAllListeners('transaction-confirmed');
    pendingTransactionTracker.hub.removeAllListeners('transaction-dropped');
    pendingTransactionTracker.hub.removeAllListeners('transaction-failed');
  }
}
