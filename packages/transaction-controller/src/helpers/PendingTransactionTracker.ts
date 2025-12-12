import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type {
  BlockTracker,
  NetworkClientId,
} from '@metamask/network-controller';
import type { Hex, Json } from '@metamask/utils';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import-x/no-nodejs-modules
import EventEmitter from 'events';
import { cloneDeep, merge } from 'lodash';

import { TransactionPoller } from './TransactionPoller';
import { createModuleLogger, projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { TransactionMeta, TransactionReceipt } from '../types';
import { TransactionStatus, TransactionType } from '../types';
import {
  getAcceleratedPollingParams,
  getTimeoutAttempts,
} from '../utils/feature-flags';

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
  on<EventName extends keyof Events>(
    eventName: EventName,
    listener: (...args: Events[EventName]) => void,
  ): this;

  emit<EventName extends keyof Events>(
    eventName: EventName,
    ...args: Events[EventName]
  ): boolean;
}

export class PendingTransactionTracker {
  hub: PendingTransactionTrackerEventEmitter;

  readonly #beforeCheckPendingTransaction: (
    transactionMeta: TransactionMeta,
  ) => Promise<boolean>;

  readonly #droppedBlockCountByHash: Map<string, number>;

  readonly #isTimeoutEnabled: (transactionMeta: TransactionMeta) => boolean;

  readonly #getChainId: () => string;

  readonly #getEthQuery: (networkClientId?: NetworkClientId) => EthQuery;

  readonly #getGlobalLock: () => Promise<() => void>;

  readonly #getNetworkClientId: () => NetworkClientId;

  readonly #getTransactions: () => TransactionMeta[];

  readonly #isResubmitEnabled: () => boolean;

  readonly #lastSeenTimestampByHash: Map<string, number>;

  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly #listener: any;

  readonly #log: debug.Debugger;

  readonly #messenger: TransactionControllerMessenger;

  readonly #publishTransaction: (
    ethQuery: EthQuery,
    transactionMeta: TransactionMeta,
  ) => Promise<string>;

  #running: boolean;

  readonly #transactionPoller: TransactionPoller;

  #transactionToForcePoll: TransactionMeta | undefined;

  constructor({
    blockTracker,
    getChainId,
    getEthQuery,
    getGlobalLock,
    getNetworkClientId,
    getTransactions,
    isTimeoutEnabled,
    hooks,
    isResubmitEnabled,
    messenger,
    publishTransaction,
  }: {
    blockTracker: BlockTracker;
    getChainId: () => Hex;
    getEthQuery: (networkClientId?: NetworkClientId) => EthQuery;
    getGlobalLock: () => Promise<() => void>;
    getNetworkClientId: () => string;
    getTransactions: () => TransactionMeta[];
    hooks?: {
      beforeCheckPendingTransaction?: (
        transactionMeta: TransactionMeta,
      ) => Promise<boolean>;
    };
    isResubmitEnabled?: () => boolean;
    isTimeoutEnabled: (transactionMeta: TransactionMeta) => boolean;
    messenger: TransactionControllerMessenger;
    publishTransaction: (
      ethQuery: EthQuery,
      transactionMeta: TransactionMeta,
    ) => Promise<string>;
  }) {
    this.hub = new EventEmitter() as PendingTransactionTrackerEventEmitter;

    this.#droppedBlockCountByHash = new Map();
    this.#getChainId = getChainId;
    this.#getEthQuery = getEthQuery;
    this.#getGlobalLock = getGlobalLock;
    this.#getNetworkClientId = getNetworkClientId;
    this.#getTransactions = getTransactions;
    this.#isResubmitEnabled = isResubmitEnabled ?? ((): boolean => true);
    this.#lastSeenTimestampByHash = new Map();
    this.#listener = this.#onLatestBlock.bind(this);
    this.#messenger = messenger;
    this.#publishTransaction = publishTransaction;
    this.#running = false;
    this.#transactionToForcePoll = undefined;

    this.#transactionPoller = new TransactionPoller({
      blockTracker,
      chainId: getChainId(),
      messenger,
    });

    this.#beforeCheckPendingTransaction =
      hooks?.beforeCheckPendingTransaction ??
      /* istanbul ignore next */
      ((): Promise<boolean> => Promise.resolve(true));

    this.#isTimeoutEnabled = isTimeoutEnabled;

    this.#log = createModuleLogger(
      log,
      `${getChainId()}:${getNetworkClientId()}`,
    );
  }

  startIfPendingTransactions = (): void => {
    const pendingTransactions = this.#getPendingTransactions();

    if (pendingTransactions.length) {
      this.#start(pendingTransactions);
    } else {
      this.stop();
    }
  };

  /**
   * Adds a transaction to the polling mechanism for monitoring its status.
   *
   * This method forcefully adds a single transaction to the list of transactions
   * being polled, ensuring that its status is checked, event emitted but no update is performed.
   * It overrides the default behavior by prioritizing the given transaction for polling.
   *
   * @param transactionMeta - The transaction metadata to be added for polling.
   *
   * The transaction will now be monitored for updates, such as confirmation or failure.
   */
  addTransactionToPoll(transactionMeta: TransactionMeta): void {
    this.#start([transactionMeta]);
    this.#transactionToForcePoll = transactionMeta;
  }

  /**
   * Force checks the network if the given transaction is confirmed and updates it's status.
   *
   * @param txMeta - The transaction to check
   */
  async forceCheckTransaction(txMeta: TransactionMeta): Promise<void> {
    const releaseLock = await this.#getGlobalLock();

    try {
      await this.#checkTransaction(txMeta);
    } catch (error) {
      /* istanbul ignore next */
      this.#log('Failed to check transaction', error);
    } finally {
      releaseLock();
    }
  }

  #start(pendingTransactions: TransactionMeta[]): void {
    this.#transactionPoller.setPendingTransactions(pendingTransactions);

    if (this.#running) {
      return;
    }

    this.#transactionPoller.start(this.#listener);
    this.#running = true;

    this.#log('Started polling');
  }

  stop(): void {
    if (!this.#running) {
      return;
    }

    this.#transactionPoller.stop();
    this.#running = false;

    this.#log('Stopped polling');
  }

  async #onLatestBlock(latestBlockNumber: string): Promise<void> {
    const releaseLock = await this.#getGlobalLock();

    try {
      await this.#checkTransactions();
    } catch (error) {
      /* istanbul ignore next */
      this.#log('Failed to check transactions', error);
    } finally {
      releaseLock();
    }

    try {
      await this.#resubmitTransactions(latestBlockNumber);
    } catch (error) {
      /* istanbul ignore next */
      this.#log('Failed to resubmit transactions', error);
    }
  }

  async #checkTransactions(): Promise<void> {
    this.#log('Checking transactions');

    const pendingTransactions: TransactionMeta[] = [
      ...this.#getPendingTransactions(),
      ...(this.#transactionToForcePoll ? [this.#transactionToForcePoll] : []),
    ];

    if (!pendingTransactions.length) {
      this.#log('No pending transactions to check');
      return;
    }

    this.#log('Found pending transactions to check', {
      count: pendingTransactions.length,
      ids: pendingTransactions.map((tx) => tx.id),
    });

    await Promise.all(
      pendingTransactions.map((tx) => this.#checkTransaction(tx)),
    );
  }

  async #resubmitTransactions(latestBlockNumber: string): Promise<void> {
    if (!this.#isResubmitEnabled() || !this.#running) {
      return;
    }

    this.#log('Resubmitting transactions');

    const pendingTransactions = this.#getPendingTransactions();

    if (!pendingTransactions.length) {
      this.#log('No pending transactions to resubmit');
      return;
    }

    this.#log('Found pending transactions to resubmit', {
      count: pendingTransactions.length,
      ids: pendingTransactions.map((tx) => tx.id),
    });

    for (const txMeta of pendingTransactions) {
      try {
        await this.#resubmitTransaction(txMeta, latestBlockNumber);
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        /* istanbul ignore next */
        const errorMessage =
          error.value?.message?.toLowerCase() ??
          error.message?.toLowerCase() ??
          String(error);

        if (this.#isKnownTransactionError(errorMessage)) {
          this.#log('Ignoring known transaction error', errorMessage);
          continue;
        }

        this.#warnTransaction(
          txMeta,
          error.message,
          'There was an error when resubmitting this transaction.',
        );
      }
    }
  }

  #isKnownTransactionError(errorMessage: string): boolean {
    return KNOWN_TRANSACTION_ERRORS.some((knownError) =>
      errorMessage.includes(knownError),
    );
  }

  async #resubmitTransaction(
    txMeta: TransactionMeta,
    latestBlockNumber: string,
  ): Promise<void> {
    if (!this.#isResubmitDue(txMeta, latestBlockNumber)) {
      return;
    }

    if (!(await this.#beforeCheckPendingTransaction(txMeta))) {
      return;
    }

    const ethQuery = this.#getEthQuery(txMeta.networkClientId);
    await this.#publishTransaction(ethQuery, txMeta);

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

    const retryCount = txMeta.retryCount ?? 0;

    // Exponential backoff to limit retries at publishing
    // Capped at ~15 minutes between retries
    const requiredBlocksSinceFirstRetry = Math.min(
      MAX_RETRY_BLOCK_DISTANCE,
      Math.pow(2, retryCount),
    );

    return blocksSinceFirstRetry >= requiredBlocksSinceFirstRetry;
  }

  #cleanTransactionToForcePoll(transactionId: string): void {
    if (this.#transactionToForcePoll?.id === transactionId) {
      this.#transactionToForcePoll = undefined;
    }
  }

  async #checkTransaction(txMeta: TransactionMeta): Promise<void> {
    const {
      hash,
      id,
      isIntentComplete,
      txParams: { from },
    } = txMeta;

    if (isIntentComplete) {
      await this.#onTransactionConfirmed(txMeta);
      return;
    }

    if (!hash && (await this.#beforeCheckPendingTransaction(txMeta))) {
      const error = new Error(
        'We had an error while submitting this transaction, please try again.',
      );

      error.name = 'NoTxHashError';

      this.#failTransaction(txMeta, error);

      return;
    }

    if (this.#isNonceTaken(txMeta)) {
      this.#log('Nonce already taken', id);
      this.#dropTransaction(txMeta);
      return;
    }

    try {
      const receipt = await this.#getTransactionReceipt(hash);
      const isSuccess = receipt?.status === RECEIPT_STATUS_SUCCESS;
      const isFailure = receipt?.status === RECEIPT_STATUS_FAILURE;

      if (isFailure) {
        this.#log('Transaction receipt has failed status');

        this.#failTransaction(
          txMeta,
          new Error('Transaction dropped or replaced'),
        );

        return;
      }

      const { blockNumber, blockHash } = receipt ?? {};

      if (isSuccess && blockNumber && blockHash) {
        await this.#onTransactionConfirmed(txMeta, {
          ...receipt,
          blockNumber,
          blockHash,
        });

        return;
      }

      this.#log('No receipt status', { hash, receipt });

      const nextNonceHex = await this.#getNetworkTransactionCount(from);
      const nextNonce = parseInt(nextNonceHex, 16);

      // Check if transaction should be failed due to no receipt
      if (!receipt && (await this.#isTransactionTimeout(txMeta, nextNonce))) {
        return;
      }

      if (await this.#isTransactionDropped(txMeta, nextNonce)) {
        this.#dropTransaction(txMeta);
      }
    } catch (error) {
      this.#log('Failed to check transaction', id, error);

      this.#warnTransaction(
        txMeta,
        (error as { message: string }).message,
        'There was a problem loading this transaction.',
      );
    }
  }

  async #onTransactionConfirmed(
    txMeta: TransactionMeta,
    receipt?: SuccessfulTransactionReceipt,
  ): Promise<void> {
    const { id } = txMeta;
    const { blockHash } = receipt ?? {};

    this.#log('Transaction confirmed', id);

    if (this.#transactionToForcePoll) {
      this.#cleanTransactionToForcePoll(txMeta.id);
      this.hub.emit('transaction-confirmed', txMeta);
      return;
    }

    const updatedTxMeta = cloneDeep(txMeta);

    if (receipt && blockHash) {
      const { baseFeePerGas, timestamp: blockTimestamp } =
        await this.#getBlockByHash(blockHash, false);

      updatedTxMeta.baseFeePerGas = baseFeePerGas;
      updatedTxMeta.blockTimestamp = blockTimestamp;
      updatedTxMeta.txParams = {
        ...updatedTxMeta.txParams,
        gasUsed: receipt.gasUsed,
      };
      updatedTxMeta.txReceipt = receipt;
      updatedTxMeta.verifiedOnBlockchain = true;
    }

    updatedTxMeta.status = TransactionStatus.confirmed;

    this.#updateTransaction(
      updatedTxMeta,
      'PendingTransactionTracker:#onTransactionConfirmed - Transaction confirmed',
    );

    this.hub.emit('transaction-confirmed', updatedTxMeta);
  }

  async #isTransactionTimeout(
    txMeta: TransactionMeta,
    nextNonce: number,
  ): Promise<boolean> {
    const {
      chainId,
      hash,
      id: transactionId,
      submittedTime,
      txParams: { nonce },
    } = txMeta;

    if (!hash || !nonce) {
      return false;
    }

    if (!this.#isTimeoutEnabled(txMeta)) {
      this.#log('Timeout disabled for transaction', txMeta);
      return false;
    }

    const threshold = getTimeoutAttempts(chainId, this.#messenger);

    // Feature is disabled if threshold is undefined or zero
    if (threshold === undefined || threshold === 0) {
      this.#log('Timeout disabled due to threshold', { chainId, threshold });
      return false;
    }

    // Skip timeout if this transaction's nonce is a queued transaction with a future nonce
    const nonceNumber = parseInt(nonce, 16);

    if (nonceNumber > nextNonce) {
      this.#log('Skipping timeout as queued transaction', {
        transactionNonce: nonceNumber,
        nextNonce,
      });
      return false;
    }

    try {
      // Check if transaction exists on the network
      const transaction = await this.#getTransactionByHash(hash);

      // If transaction exists, record the timestamp
      if (transaction !== null) {
        const currentTimestamp = Date.now();

        this.#log(
          'Transaction found on network, recording timestamp',
          transactionId,
        );

        this.#lastSeenTimestampByHash.set(hash, currentTimestamp);
        return false;
      }

      const lastSeenTimestamp =
        this.#lastSeenTimestampByHash.get(hash) ?? submittedTime;

      if (lastSeenTimestamp === undefined) {
        this.#log(
          'Transaction not yet seen on network and has no submitted time, skipping timeout check',
          transactionId,
        );

        return false;
      }

      const { blockTime } = getAcceleratedPollingParams(
        chainId,
        this.#messenger,
      );

      const currentTimestamp = Date.now();
      const durationSinceLastSeen = currentTimestamp - lastSeenTimestamp;
      const timeoutDuration = blockTime * threshold;

      this.#log('Checking timeout duration', {
        transactionId,
        durationSinceLastSeen,
        timeoutDuration,
        threshold,
        blockTime,
      });

      if (durationSinceLastSeen < timeoutDuration) {
        return false;
      }

      this.#log('Hit timeout duration threshold', transactionId);
      this.#lastSeenTimestampByHash.delete(hash);

      this.#failTransaction(
        txMeta,
        new Error('Transaction not found on network after timeout'),
      );

      return true;
    } catch (error) {
      this.#log('Failed to check transaction by hash', transactionId, error);
      return false;
    }
  }

  async #isTransactionDropped(
    txMeta: TransactionMeta,
    nextNonce: number,
  ): Promise<boolean> {
    const {
      hash,
      id,
      txParams: { nonce },
    } = txMeta;

    /* istanbul ignore next */
    if (!nonce || !hash) {
      return false;
    }

    const nonceNumber = parseInt(nonce, 16);

    if (nonceNumber >= nextNonce) {
      return false;
    }

    let droppedBlockCount = this.#droppedBlockCountByHash.get(hash);

    if (droppedBlockCount === undefined) {
      droppedBlockCount = 0;
      this.#droppedBlockCountByHash.set(hash, droppedBlockCount);
    }

    if (droppedBlockCount < DROPPED_BLOCK_COUNT) {
      this.#log('Incrementing dropped block count', { id, droppedBlockCount });
      this.#droppedBlockCountByHash.set(hash, droppedBlockCount + 1);
      return false;
    }

    this.#log('Hit dropped block count', id);

    this.#droppedBlockCountByHash.delete(hash);
    return true;
  }

  #isNonceTaken(txMeta: TransactionMeta): boolean {
    const { id, txParams } = txMeta;

    return this.#getChainTransactions().some(
      (tx) =>
        tx.id !== id &&
        tx.txParams.from === txParams.from &&
        tx.status === TransactionStatus.confirmed &&
        tx.txParams.nonce &&
        tx.txParams.nonce === txParams.nonce &&
        tx.type !== TransactionType.incoming &&
        tx.isTransfer === undefined,
    );
  }

  #getPendingTransactions(): TransactionMeta[] {
    return this.#getNetworkClientTransactions().filter(
      (tx) =>
        tx.status === TransactionStatus.submitted &&
        !tx.verifiedOnBlockchain &&
        !tx.isUserOperation,
    );
  }

  #warnTransaction(
    txMeta: TransactionMeta,
    error: string,
    message: string,
  ): void {
    this.#updateTransaction(
      {
        ...txMeta,
        warning: { error, message },
      },
      'PendingTransactionTracker:#warnTransaction - Warning added',
    );
  }

  #failTransaction(txMeta: TransactionMeta, error: Error): void {
    this.#log('Transaction failed', txMeta.id, error);
    this.#cleanTransactionToForcePoll(txMeta.id);
    this.hub.emit('transaction-failed', txMeta, error);
  }

  #dropTransaction(txMeta: TransactionMeta): void {
    this.#log('Transaction dropped', txMeta.id);
    this.#cleanTransactionToForcePoll(txMeta.id);
    this.hub.emit('transaction-dropped', txMeta);
  }

  #updateTransaction(txMeta: TransactionMeta, note: string): void {
    this.hub.emit('transaction-updated', txMeta, note);
  }

  async #getTransactionReceipt(
    txHash?: string,
  ): Promise<TransactionReceipt | undefined> {
    return await query(this.#getEthQuery(), 'getTransactionReceipt', [txHash]);
  }

  async #getTransactionByHash(txHash?: string): Promise<Json> {
    return await query(this.#getEthQuery(), 'getTransactionByHash', [txHash]);
  }

  async #getBlockByHash(
    blockHash: string,
    includeTransactionDetails: boolean,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return await query(this.#getEthQuery(), 'getBlockByHash', [
      blockHash,
      includeTransactionDetails,
    ]);
  }

  async #getNetworkTransactionCount(address: string): Promise<string> {
    return await query(this.#getEthQuery(), 'getTransactionCount', [address]);
  }

  #getChainTransactions(): TransactionMeta[] {
    const chainId = this.#getChainId();
    return this.#getTransactions().filter((tx) => tx.chainId === chainId);
  }

  #getNetworkClientTransactions(): TransactionMeta[] {
    const networkClientId = this.#getNetworkClientId();
    return this.#getTransactions().filter(
      (tx) => tx.networkClientId === networkClientId,
    );
  }
}
