import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { BlockTracker } from '@metamask/network-controller';
import EventEmitter from 'events';
import type NonceTracker from 'nonce-tracker';

import { pendingTransactionsLogger as log } from '../logger';
import type { TransactionState } from '../TransactionController';
import type { TransactionMeta, TransactionReceipt } from '../types';
import { TransactionStatus } from '../types';

/**
 * We wait this many blocks before emitting a 'transaction-dropped' event
 * This is because we could be talking to a node that is out of sync
 */
const DROPPED_BLOCK_COUNT = 3;

const MAX_RETRY_BLOCK_DISTANCE = 50;

const KNOWN_TRANSACTION_ERRORS = [
  'replacement transaction underpriced',
  'known transaction',
  'gas price too low to replace',
  'transaction with the same hash was already imported',
  'gateway timeout',
  'nonce too low',
];

type Events = {
  'transaction-confirmed': [txMeta: TransactionMeta];
  'transaction-dropped': [txMeta: TransactionMeta];
  'transaction-failed': [txMeta: TransactionMeta, error: Error];
  'transaction-updated': [txMeta: TransactionMeta, note: string];
};

export interface PendingTransactionTrackerEventEmitter extends EventEmitter {
  on<T extends keyof Events>(
    eventName: T,
    listener: (...args: Events[T]) => void,
  ): this;

  emit<T extends keyof Events>(eventName: T, ...args: Events[T]): boolean;
}

export class PendingTransactionTracker {
  hub: PendingTransactionTrackerEventEmitter;

  #approveTransaction: (transactionId: string) => Promise<void>;

  #blockTracker: BlockTracker;

  #droppedBlockCountByHash: Map<string, number>;

  #getChainId: () => string;

  #getEthQuery: () => EthQuery;

  #getTransactions: () => TransactionMeta[];

  #isResubmitEnabled: boolean;

  #listener: any;

  #nonceTracker: NonceTracker;

  #onStateChange: (listener: (state: TransactionState) => void) => void;

  #publishTransaction: (rawTx: string) => Promise<string>;

  #running: boolean;

  constructor({
    approveTransaction,
    blockTracker,
    getChainId,
    getEthQuery,
    getTransactions,
    isResubmitEnabled,
    nonceTracker,
    onStateChange,
    publishTransaction,
  }: {
    approveTransaction: (transactionId: string) => Promise<void>;
    blockTracker: BlockTracker;
    getChainId: () => string;
    getEthQuery: () => EthQuery;
    getTransactions: () => TransactionMeta[];
    isResubmitEnabled?: boolean;
    nonceTracker: NonceTracker;
    onStateChange: (listener: (state: TransactionState) => void) => void;
    publishTransaction: (rawTx: string) => Promise<string>;
  }) {
    this.hub = new EventEmitter() as PendingTransactionTrackerEventEmitter;

    this.#approveTransaction = approveTransaction;
    this.#blockTracker = blockTracker;
    this.#droppedBlockCountByHash = new Map();
    this.#getChainId = getChainId;
    this.#getEthQuery = getEthQuery;
    this.#getTransactions = getTransactions;
    this.#isResubmitEnabled = isResubmitEnabled ?? true;
    this.#listener = this.#onLatestBlock.bind(this);
    this.#nonceTracker = nonceTracker;
    this.#onStateChange = onStateChange;
    this.#publishTransaction = publishTransaction;
    this.#running = false;

    this.#onStateChange((state) => {
      const pendingTransactions = this.#getPendingTransactions(
        state.transactions,
      );

      if (pendingTransactions.length) {
        this.#start();
      } else {
        this.#stop();
      }
    });
  }

  #start() {
    if (this.#running) {
      return;
    }

    this.#blockTracker.on('latest', this.#listener);
    this.#running = true;

    log('Started polling');
  }

  #stop() {
    if (!this.#running) {
      return;
    }

    this.#blockTracker.removeListener('latest', this.#listener);
    this.#running = false;

    log('Stopped polling');
  }

  async #onLatestBlock(latestBlockNumber: string) {
    const nonceGlobalLock = await this.#nonceTracker.getGlobalLock();

    try {
      await this.#checkTransactions();
    } catch (error) {
      /* istanbul ignore next */
      log('Failed to check transactions', error);
    } finally {
      nonceGlobalLock.releaseLock();
    }

    try {
      await this.#resubmitTransactions(latestBlockNumber);
    } catch (error) {
      /* istanbul ignore next */
      log('Failed to resubmit transactions', error);
    }
  }

  async #checkTransactions() {
    log('Checking transactions');

    const pendingTransactions = this.#getPendingTransactions();

    if (!pendingTransactions.length) {
      log('No pending transactions to check');
      return;
    }

    log('Found pending transactions to check', {
      count: pendingTransactions.length,
      ids: pendingTransactions.map((tx) => tx.id),
    });

    await Promise.all(
      pendingTransactions.map((tx) => this.#checkTransaction(tx)),
    );
  }

  async #resubmitTransactions(latestBlockNumber: string) {
    if (!this.#isResubmitEnabled || !this.#running) {
      return;
    }

    log('Resubmitting transactions');

    const pendingTransactions = this.#getPendingTransactions();

    if (!pendingTransactions.length) {
      log('No pending transactions to resubmit');
      return;
    }

    log('Found pending transactions to resubmit', {
      count: pendingTransactions.length,
      ids: pendingTransactions.map((tx) => tx.id),
    });

    for (const txMeta of pendingTransactions) {
      try {
        await this.#resubmitTransaction(txMeta, latestBlockNumber);
      } catch (error: any) {
        /* istanbul ignore next */
        const errorMessage =
          error.value?.message?.toLowerCase() || error.message.toLowerCase();

        if (this.#isKnownTransactionError(errorMessage)) {
          log('Ignoring known transaction error', errorMessage);
          return;
        }

        this.#warnTransaction(
          txMeta,
          error.message,
          'There was an error when resubmitting this transaction.',
        );
      }
    }
  }

  #isKnownTransactionError(errorMessage: string) {
    return KNOWN_TRANSACTION_ERRORS.some((knownError) =>
      errorMessage.includes(knownError),
    );
  }

  async #resubmitTransaction(
    txMeta: TransactionMeta,
    latestBlockNumber: string,
  ) {
    if (!this.#isResubmitDue(txMeta, latestBlockNumber)) {
      return;
    }

    log('Resubmitting transaction', txMeta.id);

    const { rawTx } = txMeta;

    if (!rawTx?.length) {
      log('Approving transaction as no raw value');
      await this.#approveTransaction(txMeta.id);
      return;
    }

    await this.#publishTransaction(rawTx);

    txMeta.retryCount = (txMeta.retryCount ?? 0) + 1;

    this.#updateTransaction(
      txMeta,
      'PendingTransactionTracker:transaction-retry - Retry count increased',
    );
  }

  #isResubmitDue(txMeta: TransactionMeta, latestBlockNumber: string): boolean {
    if (!txMeta.firstRetryBlockNumber) {
      txMeta.firstRetryBlockNumber = latestBlockNumber;

      this.#updateTransaction(
        txMeta,
        'PendingTransactionTracker:#isResubmitDue - First retry block number set',
      );
    }

    const firstRetryBlockNumber =
      txMeta.firstRetryBlockNumber || latestBlockNumber;

    const blocksSinceFirstRetry =
      Number.parseInt(latestBlockNumber, 16) -
      Number.parseInt(firstRetryBlockNumber, 16);

    const retryCount = txMeta.retryCount || 0;

    // Exponential backoff to limit retries at publishing
    // Capped at ~15 minutes between retries
    const requiredBlocksSinceFirstRetry = Math.min(
      MAX_RETRY_BLOCK_DISTANCE,
      Math.pow(2, retryCount),
    );

    return blocksSinceFirstRetry >= requiredBlocksSinceFirstRetry;
  }

  async #checkTransaction(txMeta: TransactionMeta) {
    const { hash, id } = txMeta;

    if (!hash) {
      const error = new Error(
        'We had an error while submitting this transaction, please try again.',
      );

      error.name = 'NoTxHashError';

      this.#failTransaction(txMeta, error);

      return;
    }

    if (this.#isNonceTaken(txMeta)) {
      log('Nonce already taken', id);
      this.#dropTransaction(txMeta);
      return;
    }

    try {
      const receipt = await this.#getTransactionReceipt(hash);
      const isSuccess = receipt?.status === '0x1';

      if (receipt && !isSuccess) {
        log('Transaction receipt has failed status');

        this.#failTransaction(
          txMeta,
          new Error('Transaction dropped or replaced'),
        );

        return;
      }

      if (receipt?.blockNumber && isSuccess) {
        await this.#onTransactionConfirmed(txMeta, receipt);
        return;
      }
    } catch (error: any) {
      log('Failed to check transaction', id, error);

      this.#warnTransaction(
        txMeta,
        error.message,
        'There was a problem loading this transaction.',
      );

      return;
    }

    if (await this.#isTransactionDropped(txMeta)) {
      this.#dropTransaction(txMeta);
    }
  }

  async #onTransactionConfirmed(
    txMeta: TransactionMeta,
    receipt: TransactionReceipt,
  ) {
    const { id } = txMeta;

    log('Transaction confirmed', id);

    const { baseFeePerGas, timestamp: blockTimestamp } =
      await this.#getBlockByHash(receipt.blockHash as string, false);

    txMeta.baseFeePerGas = baseFeePerGas;
    txMeta.blockTimestamp = blockTimestamp;
    txMeta.status = TransactionStatus.confirmed;
    txMeta.txParams.gasUsed = receipt.gasUsed;
    txMeta.txReceipt = receipt;
    txMeta.verifiedOnBlockchain = true;

    this.#updateTransaction(
      txMeta,
      'PendingTransactionTracker:#onTransactionConfirmed - Transaction confirmed',
    );

    this.hub.emit('transaction-confirmed', txMeta);
  }

  async #isTransactionDropped(txMeta: TransactionMeta) {
    const {
      hash,
      id,
      txParams: { nonce, from },
    } = txMeta;

    /* istanbul ignore next */
    if (!nonce || !hash) {
      return false;
    }

    const networkNextNonceHex = await this.#getNetworkTransactionCount(from);
    const networkNextNonceNumber = parseInt(networkNextNonceHex, 16);
    const nonceNumber = parseInt(nonce, 16);

    if (nonceNumber >= networkNextNonceNumber) {
      return false;
    }

    let droppedBlockCount = this.#droppedBlockCountByHash.get(hash);

    if (droppedBlockCount === undefined) {
      droppedBlockCount = 0;
      this.#droppedBlockCountByHash.set(hash, droppedBlockCount);
    }

    if (droppedBlockCount < DROPPED_BLOCK_COUNT) {
      log('Incrementing dropped block count', { id, droppedBlockCount });
      this.#droppedBlockCountByHash.set(hash, droppedBlockCount + 1);
      return false;
    }

    log('Hit dropped block count', id);

    this.#droppedBlockCountByHash.delete(hash);
    return true;
  }

  #isNonceTaken(txMeta: TransactionMeta): boolean {
    const { id, txParams } = txMeta;

    return this.#getTransactions().some(
      (tx) =>
        tx.id !== id &&
        tx.txParams.from === txParams.from &&
        tx.status === TransactionStatus.confirmed &&
        tx.txParams.nonce === txParams.nonce,
    );
  }

  #getPendingTransactions(transactions?: TransactionMeta[]): TransactionMeta[] {
    const currentChainId = this.#getChainId();

    return (transactions ?? this.#getTransactions()).filter(
      (tx) =>
        tx.status === TransactionStatus.submitted &&
        tx.chainId === currentChainId &&
        !tx.verifiedOnBlockchain,
    );
  }

  #warnTransaction(txMeta: TransactionMeta, error: string, message: string) {
    txMeta.warning = {
      error,
      message,
    };

    this.#updateTransaction(
      txMeta,
      'PendingTransactionTracker:#warnTransaction - Warning added',
    );
  }

  #failTransaction(txMeta: TransactionMeta, error: Error) {
    log('Transaction failed', txMeta.id, error);
    this.hub.emit('transaction-failed', txMeta, error);
  }

  #dropTransaction(txMeta: TransactionMeta) {
    log('Transaction dropped', txMeta.id);
    this.hub.emit('transaction-dropped', txMeta);
  }

  #updateTransaction(txMeta: TransactionMeta, note: string) {
    this.hub.emit('transaction-updated', txMeta, note);
  }

  async #getTransactionReceipt(txHash: string): Promise<TransactionReceipt> {
    return await query(this.#getEthQuery(), 'getTransactionReceipt', [txHash]);
  }

  async #getBlockByHash(
    blockHash: string,
    includeTransactionDetails: boolean,
  ): Promise<any> {
    return await query(this.#getEthQuery(), 'getBlockByHash', [
      blockHash,
      includeTransactionDetails,
    ]);
  }

  async #getNetworkTransactionCount(address: string): Promise<string> {
    return await query(this.#getEthQuery(), 'getTransactionCount', [address]);
  }
}
