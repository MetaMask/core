import { query, safelyExecute } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { BlockTracker } from '@metamask/network-controller';
import EventEmitter from 'events';

import { pendingTransactionsLogger } from './logger';
import type { TransactionMeta } from './types';
import { TransactionStatus } from './types';

export class PendingTransactionTracker {
  hub: EventEmitter;

  #blockTracker: BlockTracker;

  #failTransaction: (txMeta: TransactionMeta, error: Error) => void;

  #getChainId: () => string;

  #getEthQuery: () => EthQuery;

  #getTransactions: () => TransactionMeta[];

  constructor({
    blockTracker,
    failTransaction,
    getChainId,
    getEthQuery,
    getTransactions,
  }: {
    blockTracker: BlockTracker;
    failTransaction: (txMeta: TransactionMeta, error: Error) => void;
    getChainId: () => string;
    getEthQuery: () => EthQuery;
    getTransactions: () => TransactionMeta[];
  }) {
    this.hub = new EventEmitter();

    this.#blockTracker = blockTracker;
    this.#failTransaction = failTransaction;
    this.#getChainId = getChainId;
    this.#getEthQuery = getEthQuery;
    this.#getTransactions = getTransactions;
  }

  start() {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    this.#blockTracker.on('latest', async () => {
      await safelyExecute(() => this.#onLatestBlock());
    });
  }

  /**
   * Check the status of submitted transactions on the network to determine whether they have
   * been included in a block. Any that have been included in a block are marked as confirmed.
   */
  async #onLatestBlock() {
    pendingTransactionsLogger.log('Checking transactions');

    const transactions = this.#getTransactions();
    const currentChainId = this.#getChainId();
    let gotUpdates = false;

    await safelyExecute(() =>
      Promise.all(
        transactions.map(async (meta, index) => {
          if (!meta.verifiedOnBlockchain && meta.chainId === currentChainId) {
            const [reconciledTx, updateRequired] =
              await this.#blockchainTransactionStateReconciler(meta);
            if (updateRequired) {
              transactions[index] = reconciledTx;
              gotUpdates = updateRequired;
            }
          }
        }),
      ),
    );

    /* istanbul ignore else */
    if (gotUpdates) {
      this.hub.emit('transactions', transactions);
    }
  }

  /**
   * Method to verify the state of a transaction using the Blockchain as a source of truth.
   *
   * @param meta - The local transaction to verify on the blockchain.
   * @returns A tuple containing the updated transaction, and whether or not an update was required.
   */
  async #blockchainTransactionStateReconciler(
    meta: TransactionMeta,
  ): Promise<[TransactionMeta, boolean]> {
    const {
      status,
      hash,
      id,
      chainId,
      txParams: { to },
    } = meta;

    switch (status) {
      case TransactionStatus.confirmed:
        pendingTransactionsLogger.log('Checking confirmed transaction', {
          id,
          chainId,
          to,
        });

        const txReceipt = await query(
          this.#getEthQuery(),
          'getTransactionReceipt',
          [hash],
        );

        if (!txReceipt) {
          return [meta, false];
        }

        const txBlock = await query(this.#getEthQuery(), 'getBlockByHash', [
          txReceipt.blockHash,
        ]);

        meta.verifiedOnBlockchain = true;
        meta.txParams.gasUsed = txReceipt.gasUsed;
        meta.txReceipt = txReceipt;
        meta.baseFeePerGas = txBlock?.baseFeePerGas;
        meta.blockTimestamp = txBlock?.timestamp;

        // According to the Web3 docs:
        // TRUE if the transaction was successful, FALSE if the EVM reverted the transaction.
        if (Number(txReceipt.status) === 0) {
          const error: Error = new Error(
            'Transaction failed. The transaction was reversed',
          );
          this.#failTransaction(meta, error);
          return [meta, false];
        }

        return [meta, true];
      case TransactionStatus.submitted:
        pendingTransactionsLogger.log('Checking submitted transaction', {
          id,
          chainId,
          to,
        });

        const txObj = await query(this.#getEthQuery(), 'getTransactionByHash', [
          hash,
        ]);

        if (!txObj) {
          const receiptShowsFailedStatus =
            await this.#checkTxReceiptStatusIsFailed(hash);

          // Case the txObj is evaluated as false, a second check will
          // determine if the tx failed or it is pending or confirmed
          if (receiptShowsFailedStatus) {
            const error: Error = new Error(
              'Transaction failed. The transaction was dropped or replaced by a new one',
            );
            this.#failTransaction(meta, error);
          }
        }

        /* istanbul ignore next */
        if (txObj?.blockNumber) {
          meta.status = TransactionStatus.confirmed;
          this.hub.emit(`${meta.id}:confirmed`, meta);
          return [meta, true];
        }

        return [meta, false];
      default:
        return [meta, false];
    }
  }

  /**
   * Method to check if a tx has failed according to their receipt
   * According to the Web3 docs:
   * TRUE if the transaction was successful, FALSE if the EVM reverted the transaction.
   * The receipt is not available for pending transactions and returns null.
   *
   * @param txHash - The transaction hash.
   * @returns Whether the transaction has failed.
   */
  async #checkTxReceiptStatusIsFailed(
    txHash: string | undefined,
  ): Promise<boolean> {
    const txReceipt = await query(
      this.#getEthQuery(),
      'getTransactionReceipt',
      [txHash],
    );
    if (!txReceipt) {
      // Transaction is pending
      return false;
    }
    return Number(txReceipt.status) === 0;
  }
}
