import type { DeferredPromise, Hex } from '@metamask/utils';
import { createDeferredPromise, createModuleLogger } from '@metamask/utils';
import { sortBy } from 'lodash';

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
  #results: {
    nonce: number;
    promise: DeferredPromise<PublishHookResult>;
    signedTransaction: Hex;
  }[];

  readonly #transactionCount: number;

  readonly #readyPromise: DeferredPromise<CollectPublishHookResult>;

  constructor(transactionCount: number) {
    this.#readyPromise = createDeferredPromise();
    this.#results = [];
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
  success(transactionHashes: Hex[]): void {
    log('Success', { transactionHashes });

    if (transactionHashes.length !== this.#transactionCount) {
      throw new Error('Transaction hash count mismatch');
    }

    for (let i = 0; i < this.#results.length; i++) {
      const result = this.#results[i];
      const transactionHash = transactionHashes[i];

      result.promise.resolve({ transactionHash });
    }
  }

  error(error: unknown): void {
    log('Error', { error });

    for (const result of this.#results) {
      result.promise.reject(error);
    }
  }

  #hook(
    transactionMeta: TransactionMeta,
    signedTx: string,
  ): Promise<PublishHookResult> {
    const nonceHex = transactionMeta.txParams.nonce ?? '0x0';
    const nonceDecimal = parseInt(nonceHex, 16);

    log('Processing transaction', {
      nonce: nonceDecimal,
      signedTx,
      transactionMeta,
    });

    const publishPromise = createDeferredPromise<PublishHookResult>();

    this.#results.push({
      nonce: nonceDecimal,
      promise: publishPromise,
      signedTransaction: signedTx as Hex,
    });

    this.#results = sortBy(this.#results, (result) => result.nonce);

    if (this.#results.length === this.#transactionCount) {
      log('All transactions signed');

      const signedTransactions = this.#results.map(
        (result) => result.signedTransaction,
      );

      this.#readyPromise.resolve({
        signedTransactions,
      });
    }

    return publishPromise.promise;
  }
}
