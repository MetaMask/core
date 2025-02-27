import type { DeferredPromise, Hex } from '@metamask/utils';
import { createDeferredPromise, createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import type { PublishHook, PublishHookResult, TransactionMeta } from '../types';

const log = createModuleLogger(projectLogger, 'collect-publish-hook');

export type CollectPublishHookResult = {
  signedTransactions: Hex[];
};

/**
 * Custom publish logic that collects multiple signed transactions until a specific number is reached.
 * Used by batch transactions to publish multiple transactions at once.
 */
export class CollectPublishHook {
  readonly #publishPromises: DeferredPromise<PublishHookResult>[];

  readonly #signedTransactions: Hex[];

  readonly #transactionCount: number;

  readonly #readyPromise: DeferredPromise<CollectPublishHookResult>;

  constructor(transactionCount: number) {
    this.#publishPromises = [];
    this.#readyPromise = createDeferredPromise();
    this.#signedTransactions = [];
    this.#transactionCount = transactionCount;
  }

  /**
   * @returns The publish hook function to be passed to `addTransaction`.
   */
  getHook(): PublishHook {
    return this.#hook.bind(this);
  }

  /**
   * @returns A promise that resolves when all transactions are signed.
   */
  ready(): Promise<CollectPublishHookResult> {
    return this.#readyPromise.promise;
  }

  /**
   * Resolve all publish promises with the provided transaction hashes.
   *
   * @param transactionHashes - The transaction hashes to pass to the original publish promises.
   */
  success(transactionHashes: Hex[]) {
    log('Success', { transactionHashes });

    if (transactionHashes.length !== this.#transactionCount) {
      throw new Error('Transaction hash count mismatch');
    }

    for (let i = 0; i < this.#publishPromises.length; i++) {
      const publishPromise = this.#publishPromises[i];
      const transactionHash = transactionHashes[i];

      publishPromise.resolve({ transactionHash });
    }
  }

  error(error: unknown) {
    log('Error', { error });

    for (const publishPromise of this.#publishPromises) {
      publishPromise.reject(error);
    }
  }

  #hook(
    transactionMeta: TransactionMeta,
    signedTx: string,
  ): Promise<PublishHookResult> {
    this.#signedTransactions.push(signedTx as Hex);

    log('Processing transaction', { transactionMeta, signedTx });

    const publishPromise = createDeferredPromise<PublishHookResult>();

    this.#publishPromises.push(publishPromise);

    if (this.#signedTransactions.length === this.#transactionCount) {
      log('All transactions signed');

      this.#readyPromise.resolve({
        signedTransactions: this.#signedTransactions,
      });
    }

    return publishPromise.promise;
  }
}
