import { createDeferredPromise, createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { TransactionController } from '..';
import { projectLogger } from '../logger';
import type {
  BatchTransactionParams,
  PublishHook,
  PublishHookResult,
  TransactionBatchSingleRequest,
  TransactionMeta,
} from '../types';

const log = createModuleLogger(
  projectLogger,
  'extra-transactions-publish-hook',
);

/**
 * Custom publish logic that also publishes additional transactions in an batch.
 * Requires the batch to be successful to resolve.
 */
export class ExtraTransactionsPublishHook {
  readonly #addTransactionBatch: TransactionController['addTransactionBatch'];

  readonly #getTransaction: (transactionId: string) => TransactionMeta;

  readonly #originalPublishHook: PublishHook;

  constructor({
    addTransactionBatch,
    getTransaction,
    originalPublishHook,
  }: {
    addTransactionBatch: TransactionController['addTransactionBatch'];
    getTransaction: (transactionId: string) => TransactionMeta;
    originalPublishHook: PublishHook;
  }) {
    this.#addTransactionBatch = addTransactionBatch;
    this.#getTransaction = getTransaction;
    this.#originalPublishHook = originalPublishHook;
  }

  /**
   * @returns The publish hook function.
   */
  getHook(): PublishHook {
    return this.#hook.bind(this);
  }

  async #hook(
    transactionMeta: TransactionMeta,
    signedTx: string,
  ): Promise<PublishHookResult> {
    log('Publishing transaction as batch', { transactionMeta, signedTx });

    const {
      batchTransactions,
      batchTransactionsOptions,
      id: transactionId,
      networkClientId,
      txParams,
    } = transactionMeta;

    const from = txParams.from as Hex;
    const to = txParams.to as Hex | undefined;
    const data = txParams.data as Hex | undefined;
    const value = txParams.value as Hex | undefined;
    const gas = txParams.gas as Hex | undefined;
    const maxFeePerGas = txParams.maxFeePerGas as Hex | undefined;

    const maxPriorityFeePerGas = txParams.maxPriorityFeePerGas as
      | Hex
      | undefined;

    const signedTransaction = signedTx as Hex;
    const resultPromise = createDeferredPromise<PublishHookResult>();

    const onPublish = ({
      newSignature,
      transactionHash,
    }: {
      newSignature?: Hex;
      transactionHash?: string;
    }) => {
      if (newSignature) {
        const latestTransactionMeta = this.#getTransaction(transactionId);

        log('Calling original publish hook with new signature', {
          latestTransactionMeta,
          newSignature,
        });

        this.#originalPublishHook(latestTransactionMeta, newSignature)
          .then(resultPromise.resolve)
          .catch(resultPromise.reject);

        return;
      }

      resultPromise.resolve({ transactionHash });
    };

    const firstParams: BatchTransactionParams = {
      data,
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas,
      to,
      value,
    };

    const mainTransaction: TransactionBatchSingleRequest = {
      existingTransaction: {
        id: transactionId,
        onPublish,
        signedTransaction,
      },
      params: firstParams,
    };

    const extraTransactions = (batchTransactions ?? []).map((transaction) => {
      const { isAfter, type, ...rest } = transaction;
      return {
        isAfter,
        params: rest,
        type,
      };
    });

    const beforeTransactions: TransactionBatchSingleRequest[] =
      extraTransactions
        .filter((transaction) => transaction.isAfter === false)
        .map(({ isAfter, ...rest }) => ({
          ...rest,
        }));

    const afterTransactions: TransactionBatchSingleRequest[] = extraTransactions
      .filter(
        (transaction) =>
          transaction.isAfter === undefined || transaction.isAfter,
      )
      .map(({ isAfter, ...rest }) => ({
        ...rest,
      }));

    const transactions: TransactionBatchSingleRequest[] = [
      ...beforeTransactions,
      mainTransaction,
      ...afterTransactions,
    ];

    log('Adding transaction batch', {
      from,
      networkClientId,
      transactions,
    });

    const options = batchTransactionsOptions ?? {
      disable7702: true,
      disableHook: false,
      disableSequential: true,
    };

    await this.#addTransactionBatch({
      from,
      networkClientId,
      requireApproval: false,
      transactions,
      ...options,
    });

    return resultPromise.promise;
  }
}
