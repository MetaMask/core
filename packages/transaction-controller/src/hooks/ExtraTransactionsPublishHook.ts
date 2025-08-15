import {
  createDeferredPromise,
  createModuleLogger,
  type Hex,
} from '@metamask/utils';

import type { TransactionController } from '..';
import { projectLogger } from '../logger';
import type {
  BatchTransaction,
  BatchTransactionParams,
  NestedTransactionMetadata,
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

  readonly #transactions: BatchTransaction[];

  constructor({
    addTransactionBatch,
    transactions,
  }: {
    addTransactionBatch: TransactionController['addTransactionBatch'];
    transactions: NestedTransactionMetadata[];
  }) {
    this.#addTransactionBatch = addTransactionBatch;
    this.#transactions = transactions;
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

    const { batchTransactionsOptions, id, networkClientId, txParams } =
      transactionMeta;

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

    const onPublish = ({ transactionHash }: { transactionHash?: string }) => {
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
        id,
        onPublish,
        signedTransaction,
      },
      params: firstParams,
    };

    const extraTransactions = this.#transactions.map((transaction) => {
      const { isAfter, type, ...rest } = transaction;
      return {
        isAfter,
        params: rest,
        type,
      };
    });

    const beforeTransactions = extraTransactions.filter(
      (transaction) => transaction.isAfter === false,
    );

    const afterTransactions = extraTransactions.filter(
      (transaction) => transaction.isAfter === undefined || transaction.isAfter,
    );

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
      transactions,
      ...options,
    });

    return resultPromise.promise;
  }
}
