import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { BlockTracker } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import EventEmitter from 'events';
import { cloneDeep, merge } from 'lodash';

import { projectLogger } from '../logger';
import type { TransactionMeta, TransactionReceipt } from '../types';
import { TransactionStatus, TransactionType } from '../types';

/**
 * We wait this many blocks before emitting a 'transaction-dropped' event
 * This is because we could be talking to a node that is out of sync
 */
const DROPPED_BLOCK_COUNT = 3;

const RECEIPT_STATUS_SUCCESS = '0x1';
const RECEIPT_STATUS_FAILURE = '0x0';
const MAX_RETRY_BLOCK_DISTANCE = 50;

const KNOWN_TRANSACTION_ERRORS = [
  'replacement transaction underpriced',
  'known transaction',
  'gas price too low to replace',
  'transaction with the same hash was already imported',
  'gateway timeout',
  'nonce too low',
];

const log = createModuleLogger(projectLogger, 'pending-transactions');

type SuccessfulTransactionReceipt = TransactionReceipt & {
  blockNumber: string;
  blockHash: string;
};

type Events = {
  'transaction-confirmed': [txMeta: TransactionMeta];
  'transaction-dropped': [txMeta: TransactionMeta];
  'transaction-failed': [txMeta: TransactionMeta, error: Error];
  'transaction-updated': [txMeta: TransactionMeta, note: string];
};

// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
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

  #beforeCheckPendingTransaction: (transactionMeta: TransactionMeta) => boolean;

  #beforePublish: (transactionMeta: TransactionMeta) => boolean;

  #currentBlockTracker?: BlockTracker;

  #droppedBlockCountByHash: Map<string, number>;

  #getBlockTracker: () => BlockTracker | undefined;

  #getChainId: () => Hex | undefined;

  #getEthQuery: () => EthQuery | undefined;

  #getGlobalLock: (chainId: Hex) => Promise<() => void>;

  #getTransactions: () => TransactionMeta[];

  #isResubmitEnabled: () => boolean;

  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #listener: any;

  #publishTransaction: (ethQuery: EthQuery, rawTx: string) => Promise<string>;

  #running: boolean;

  constructor({
    approveTransaction,
    getBlockTracker,
    getChainId,
    getEthQuery,
    getTransactions,
    isResubmitEnabled,
    getGlobalLock,
    publishTransaction,
    hooks,
  }: {
    approveTransaction: (transactionId: string) => Promise<void>;
    getBlockTracker: () => BlockTracker | undefined;
    getChainId: () => Hex | undefined;
    getEthQuery: () => EthQuery | undefined;
    getTransactions: () => TransactionMeta[];
    isResubmitEnabled?: () => boolean;
    getGlobalLock: (chainId: Hex) => Promise<() => void>;
    publishTransaction: (ethQuery: EthQuery, rawTx: string) => Promise<string>;
    hooks?: {
      beforeCheckPendingTransaction?: (
        transactionMeta: TransactionMeta,
      ) => boolean;
      beforePublish?: (transactionMeta: TransactionMeta) => boolean;
    };
  }) {
    this.hub = new EventEmitter() as PendingTransactionTrackerEventEmitter;

    this.#approveTransaction = approveTransaction;
    this.#droppedBlockCountByHash = new Map();
    this.#getBlockTracker = getBlockTracker;
    this.#getChainId = getChainId;
    this.#getEthQuery = getEthQuery;
    this.#getTransactions = getTransactions;
    this.#isResubmitEnabled = isResubmitEnabled ?? (() => true);
    this.#listener = this.#onLatestBlock.bind(this);
    this.#getGlobalLock = getGlobalLock;
    this.#publishTransaction = publishTransaction;
    this.#running = false;
    this.#beforePublish = hooks?.beforePublish ?? (() => true);
    this.#beforeCheckPendingTransaction =
      hooks?.beforeCheckPendingTransaction ?? (() => true);
  }

  startIfPendingTransactions = () => {
    const { blockTracker, chainId } = this.#getNetworkObjects();

    if (!blockTracker || !chainId) {
      log('Unable to start as network is not available');
      return;
    }

    this.#currentBlockTracker = blockTracker;

    const pendingTransactions = this.#getPendingTransactions(chainId);

    if (pendingTransactions.length) {
      this.#start(blockTracker);
    } else {
      this.stop();
    }
  };

  /**
   * Force checks the network if the given transaction is confirmed and updates its status.
   *
   * @param txMeta - The transaction to check
   */
  async forceCheckTransaction(txMeta: TransactionMeta) {
    let releaseLock: (() => void) | undefined;

    try {
      const { blockTracker, chainId, ethQuery } = this.#getNetworkObjects();

      if (!blockTracker || !chainId || !ethQuery) {
        log(
          'Cannot force check transaction as network not available',
          txMeta.id,
        );
        return;
      }

      releaseLock = await this.#getGlobalLock(chainId);

      await this.#checkTransaction(txMeta, ethQuery, chainId);
    } catch (error) {
      /* istanbul ignore next */
      log('Failed to force check transaction', error);
    } finally {
      releaseLock?.();
    }
  }

  #start(blockTracker: BlockTracker) {
    if (this.#running) {
      return;
    }

    blockTracker.on('latest', this.#listener);
    this.#running = true;

    log('Started polling');
  }

  stop() {
    if (!this.#running) {
      return;
    }

    this.#currentBlockTracker?.removeListener('latest', this.#listener);
    this.#currentBlockTracker = undefined;
    this.#running = false;

    log('Stopped polling');
  }

  async #onLatestBlock(latestBlockNumber: string) {
    try {
      const { blockTracker, chainId, ethQuery } = this.#getNetworkObjects();

      if (!blockTracker || !chainId || !ethQuery) {
        log('Cannot process latest block as network not available');
        return;
      }

      const releaseLock = await this.#getGlobalLock(chainId);

      try {
        await this.#checkTransactions(chainId, ethQuery);
      } catch (error) {
        /* istanbul ignore next */
        log('Failed to check transactions', error);
      } finally {
        releaseLock();
      }

      try {
        await this.#resubmitTransactions(latestBlockNumber, chainId, ethQuery);
      } catch (error) {
        /* istanbul ignore next */
        log('Failed to resubmit transactions', error);
      }
    } catch (error) {
      log('Failed to process latest block', error);
    }
  }

  async #checkTransactions(chainId: Hex, ethQuery: EthQuery) {
    log('Checking transactions');

    const pendingTransactions = this.#getPendingTransactions(chainId);

    if (!pendingTransactions.length) {
      log('No pending transactions to check');
      return;
    }

    log('Found pending transactions to check', {
      count: pendingTransactions.length,
      ids: pendingTransactions.map((tx) => tx.id),
    });

    await Promise.all(
      pendingTransactions.map((tx) =>
        this.#checkTransaction(tx, ethQuery, chainId),
      ),
    );
  }

  async #resubmitTransactions(
    latestBlockNumber: string,
    chainId: Hex,
    ethQuery: EthQuery,
  ) {
    if (!this.#isResubmitEnabled() || !this.#running) {
      return;
    }

    log('Resubmitting transactions');

    const pendingTransactions = this.#getPendingTransactions(chainId);

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
        await this.#resubmitTransaction(txMeta, latestBlockNumber, ethQuery);
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    ethQuery: EthQuery,
  ) {
    if (!this.#isResubmitDue(txMeta, latestBlockNumber)) {
      return;
    }

    log('Resubmitting transaction', txMeta.id);

    const { rawTx } = txMeta;

    if (!this.#beforePublish(txMeta)) {
      return;
    }

    if (!rawTx?.length) {
      log('Approving transaction as no raw value');
      await this.#approveTransaction(txMeta.id);
      return;
    }

    await this.#publishTransaction(ethQuery, rawTx);

    const retryCount = (txMeta.retryCount ?? 0) + 1;

    this.#updateTransaction(
      merge({}, txMeta, { retryCount }),
      'PendingTransactionTracker:transaction-retry - Retry count increased',
    );
  }

  #isResubmitDue(txMeta: TransactionMeta, latestBlockNumber: string): boolean {
    const txMetaWithFirstRetryBlockNumber = cloneDeep(txMeta);

    if (!txMetaWithFirstRetryBlockNumber.firstRetryBlockNumber) {
      txMetaWithFirstRetryBlockNumber.firstRetryBlockNumber = latestBlockNumber;

      this.#updateTransaction(
        txMetaWithFirstRetryBlockNumber,
        'PendingTransactionTracker:#isResubmitDue - First retry block number set',
      );
    }

    const { firstRetryBlockNumber } = txMetaWithFirstRetryBlockNumber;

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

  async #checkTransaction(
    txMeta: TransactionMeta,
    ethQuery: EthQuery,
    chainId: Hex,
  ) {
    const { hash, id } = txMeta;

    if (!hash && this.#beforeCheckPendingTransaction(txMeta)) {
      const error = new Error(
        'We had an error while submitting this transaction, please try again.',
      );

      error.name = 'NoTxHashError';

      this.#failTransaction(txMeta, error);

      return;
    }

    if (this.#isNonceTaken(txMeta, chainId)) {
      log('Nonce already taken', id);
      this.#dropTransaction(txMeta);
      return;
    }

    try {
      const receipt = await this.#getTransactionReceipt(ethQuery, hash);
      const isSuccess = receipt?.status === RECEIPT_STATUS_SUCCESS;
      const isFailure = receipt?.status === RECEIPT_STATUS_FAILURE;

      if (isFailure) {
        log('Transaction receipt has failed status');

        this.#failTransaction(
          txMeta,
          new Error('Transaction dropped or replaced'),
        );

        return;
      }

      const { blockNumber, blockHash } = receipt || {};

      if (isSuccess && blockNumber && blockHash) {
        await this.#onTransactionConfirmed(
          txMeta,
          {
            ...receipt,
            blockNumber,
            blockHash,
          },
          ethQuery,
        );

        return;
      }
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      log('Failed to check transaction', id, error);

      this.#warnTransaction(
        txMeta,
        error.message,
        'There was a problem loading this transaction.',
      );

      return;
    }

    if (await this.#isTransactionDropped(txMeta, ethQuery)) {
      this.#dropTransaction(txMeta);
    }
  }

  async #onTransactionConfirmed(
    txMeta: TransactionMeta,
    receipt: SuccessfulTransactionReceipt,
    ethQuery: EthQuery,
  ) {
    const { id } = txMeta;
    const { blockHash } = receipt;

    log('Transaction confirmed', id);

    const { baseFeePerGas, timestamp: blockTimestamp } =
      await this.#getBlockByHash(blockHash, false, ethQuery);

    const updatedTxMeta = cloneDeep(txMeta);
    updatedTxMeta.baseFeePerGas = baseFeePerGas;
    updatedTxMeta.blockTimestamp = blockTimestamp;
    updatedTxMeta.status = TransactionStatus.confirmed;
    updatedTxMeta.txParams = {
      ...updatedTxMeta.txParams,
      gasUsed: receipt.gasUsed,
    };
    updatedTxMeta.txReceipt = receipt;
    updatedTxMeta.verifiedOnBlockchain = true;

    this.#updateTransaction(
      updatedTxMeta,
      'PendingTransactionTracker:#onTransactionConfirmed - Transaction confirmed',
    );

    this.hub.emit('transaction-confirmed', updatedTxMeta);
  }

  async #isTransactionDropped(txMeta: TransactionMeta, ethQuery: EthQuery) {
    const {
      hash,
      id,
      txParams: { nonce, from },
    } = txMeta;

    /* istanbul ignore next */
    if (!nonce || !hash) {
      return false;
    }

    const networkNextNonceHex = await this.#getNetworkTransactionCount(
      from,
      ethQuery,
    );

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

  #isNonceTaken(txMeta: TransactionMeta, chainId: Hex): boolean {
    const { id, txParams } = txMeta;

    return this.#getCurrentChainTransactions(chainId).some(
      (tx) =>
        tx.id !== id &&
        tx.txParams.from === txParams.from &&
        tx.status === TransactionStatus.confirmed &&
        tx.txParams.nonce === txParams.nonce &&
        tx.type !== TransactionType.incoming,
    );
  }

  #getPendingTransactions(chainId: Hex): TransactionMeta[] {
    return this.#getCurrentChainTransactions(chainId).filter(
      (tx) =>
        tx.status === TransactionStatus.submitted &&
        !tx.verifiedOnBlockchain &&
        !tx.isUserOperation,
    );
  }

  #warnTransaction(txMeta: TransactionMeta, error: string, message: string) {
    this.#updateTransaction(
      {
        ...txMeta,
        warning: { error, message },
      },
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

  async #getTransactionReceipt(
    ethQuery: EthQuery,
    txHash?: string,
  ): Promise<TransactionReceipt | undefined> {
    return await query(ethQuery, 'getTransactionReceipt', [txHash]);
  }

  async #getBlockByHash(
    blockHash: string,
    includeTransactionDetails: boolean,
    ethQuery: EthQuery,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return await query(ethQuery, 'getBlockByHash', [
      blockHash,
      includeTransactionDetails,
    ]);
  }

  async #getNetworkTransactionCount(
    address: string,
    ethQuery: EthQuery,
  ): Promise<string> {
    return await query(ethQuery, 'getTransactionCount', [address]);
  }

  #getCurrentChainTransactions(currentChainId: Hex): TransactionMeta[] {
    return this.#getTransactions().filter(
      (tx) => tx.chainId === currentChainId,
    );
  }

  #getNetworkObjects() {
    const blockTracker = this.#getBlockTracker();
    const chainId = this.#getChainId();
    const ethQuery = this.#getEthQuery();

    return { blockTracker, chainId, ethQuery };
  }
}
