import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import { rpcErrors } from '@metamask/rpc-errors';
import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  PublishBatchHookTransaction,
  TransactionMeta,
  TransactionReceipt,
} from '../types';

const TRANSACTION_CHECK_INTERVAL = 5000; // 5 seconds
const MAX_TRANSACTION_CHECK_ATTEMPTS = 60; // 5 minutes
const RECEIPT_STATUS_SUCCESS = '0x1';
const RECEIPT_STATUS_FAILURE = '0x0';

const log = createModuleLogger(projectLogger, 'sequential-publish-batch-hook');

type SequentialPublishBatchHookParams = {
  publishTransaction: (
    _ethQuery: EthQuery,
    transactionMeta: TransactionMeta,
  ) => Promise<Hex>;
  getTransaction: (id: string) => TransactionMeta;
  getEthQuery: (networkClientId: string) => EthQuery;
};
/**
 * Custom publish logic that also publishes additional sequential transactions in an batch.
 * Requires the batch to be successful to resolve.
 */
export class SequentialPublishBatchHook {
  readonly #publishTransaction: (
    _ethQuery: EthQuery,
    transactionMeta: TransactionMeta,
  ) => Promise<Hex>;

  readonly #getTransaction: (id: string) => TransactionMeta;

  readonly #getEthQuery: (networkClientId: string) => EthQuery;

  constructor({
    publishTransaction,
    getTransaction,
    getEthQuery,
  }: SequentialPublishBatchHookParams) {
    this.#publishTransaction = publishTransaction;
    this.#getTransaction = getTransaction;
    this.#getEthQuery = getEthQuery;
  }

  /**
   * Get the hook function for sequential publishing.
   *
   * @returns The hook function.
   */
  getHook() {
    return async ({
      from,
      networkClientId,
      transactions,
    }: {
      from: string;
      networkClientId: string;
      transactions: PublishBatchHookTransaction[];
    }) => {
      log('Starting sequential publish batch hook', { from, networkClientId });

      const results = [];

      for (const transaction of transactions) {
        try {
          const transactionMeta = this.#getTransaction(String(transaction.id));
          const transactionHash = await this.#publishTransaction(
            this.#getEthQuery(networkClientId),
            transactionMeta,
          );
          log('Transaction published', { transactionHash });

          const isConfirmed = await this.#waitForTransactionConfirmation(
            transactionHash,
            networkClientId,
          );

          if (!isConfirmed) {
            throw new Error(
              `Transaction ${transactionHash} failed or was not confirmed.`,
            );
          }

          results.push({ transactionHash });
        } catch (error) {
          log('Transaction failed', { transaction, error });
          throw rpcErrors.internal(
            `Failed to publish sequential batch transaction`,
          );
        }
      }

      log('Sequential publish batch hook completed', { results });

      return { results };
    };
  }

  async #waitForTransactionConfirmation(
    transactionHash: string,
    networkClientId: string,
  ): Promise<boolean> {
    let attempts = 0;

    while (attempts < MAX_TRANSACTION_CHECK_ATTEMPTS) {
      const isConfirmed = await this.#isTransactionConfirmed(
        transactionHash,
        networkClientId,
      );

      if (isConfirmed) {
        return true;
      }

      const waitPromise = new Promise((resolve) =>
        setTimeout(resolve, TRANSACTION_CHECK_INTERVAL),
      );
      await waitPromise;

      attempts += 1;
    }

    return false;
  }

  async #getTransactionReceipt(
    txHash: string,
    networkClientId: string,
  ): Promise<TransactionReceipt | undefined> {
    return await query(
      this.#getEthQuery(networkClientId),
      'getTransactionReceipt',
      [txHash],
    );
  }

  async #isTransactionConfirmed(
    transactionHash: string,
    networkClientId: string,
  ): Promise<boolean> {
    try {
      const receipt = await this.#getTransactionReceipt(
        transactionHash,
        networkClientId,
      );
      if (!receipt) {
        return false;
      }

      const { status } = receipt;

      if (status === RECEIPT_STATUS_SUCCESS) {
        return true;
      }

      if (status === RECEIPT_STATUS_FAILURE) {
        throw new Error(`Transaction ${transactionHash} failed.`);
      }

      return false;
    } catch (error) {
      log('Error checking transaction status', { transactionHash, error });
      throw error;
    }
  }
}
