import type {
  BlockTracker,
  NetworkClientId,
} from '@metamask/network-controller';
import type { Json } from '@metamask/utils';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import-x/no-nodejs-modules
import EventEmitter from 'events';
import { cloneDeep } from 'lodash';

import { createModuleLogger, projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { TransactionMeta, TransactionReceipt } from '../types';
import { TransactionStatus, TransactionType } from '../types';
import {
  getAcceleratedPollingParams,
  getTimeoutAttempts,
} from '../utils/feature-flags';
import { getChainId, rpcRequest } from '../utils/provider';
import { extractRevert, OnChainFailureError } from '../utils/revert-reason';
import { TransactionPoller } from './TransactionPoller';

/**
 * We wait this many blocks before emitting a 'transaction-dropped' event
 * This is because we could be talking to a node that is out of sync
 */
const DROPPED_BLOCK_COUNT = 3;

const RECEIPT_STATUS_SUCCESS = '0x1';
const RECEIPT_STATUS_FAILURE = '0x0';

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

  readonly #getGlobalLock: () => Promise<() => void>;

  readonly #chainId: string;

  readonly #networkClientId: NetworkClientId;

  readonly #getTransactions: () => TransactionMeta[];

  readonly #lastSeenTimestampByHash: Map<string, number>;

  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly #listener: any;

  readonly #log: debug.Debugger;

  readonly #messenger: TransactionControllerMessenger;

  #running: boolean;

  readonly #transactionPoller: TransactionPoller;

  #transactionToForcePoll: TransactionMeta | undefined;

  constructor({
    blockTracker,
    getGlobalLock,
    getTransactions,
    isTimeoutEnabled,
    hooks,
    messenger,
    networkClientId,
  }: {
    blockTracker: BlockTracker;
    getGlobalLock: () => Promise<() => void>;
    getTransactions: () => TransactionMeta[];
    hooks?: {
      beforeCheckPendingTransaction?: (
        transactionMeta: TransactionMeta,
      ) => Promise<boolean>;
    };
    isTimeoutEnabled: (transactionMeta: TransactionMeta) => boolean;
    messenger: TransactionControllerMessenger;
    networkClientId: NetworkClientId;
  }) {
    this.hub = new EventEmitter() as PendingTransactionTrackerEventEmitter;

    const chainId = getChainId({ messenger, networkClientId });

    this.#chainId = chainId;
    this.#droppedBlockCountByHash = new Map();
    this.#getGlobalLock = getGlobalLock;
    this.#networkClientId = networkClientId;
    this.#getTransactions = getTransactions;
    this.#lastSeenTimestampByHash = new Map();
    this.#listener = this.#onLatestBlock.bind(this);
    this.#messenger = messenger;
    this.#running = false;
    this.#transactionToForcePoll = undefined;

    this.#transactionPoller = new TransactionPoller({
      blockTracker,
      chainId,
      messenger,
    });

    this.#beforeCheckPendingTransaction =
      hooks?.beforeCheckPendingTransaction ??
      /* istanbul ignore next */
      ((): Promise<boolean> => Promise.resolve(true));

    this.#isTimeoutEnabled = isTimeoutEnabled;

    this.#log = createModuleLogger(log, `${chainId}:${networkClientId}`);
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

  async #onLatestBlock(_latestBlockNumber: string): Promise<void> {
    const releaseLock = await this.#getGlobalLock();

    try {
      await this.#checkTransactions();
    } catch (error) {
      /* istanbul ignore next */
      this.#log('Failed to check transactions', error);
    } finally {
      releaseLock();
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

  #cleanTransaction(txMeta: TransactionMeta): void {
    const { hash, id } = txMeta;

    if (this.#transactionToForcePoll?.id === id) {
      this.#transactionToForcePoll = undefined;
    }

    if (hash) {
      this.#lastSeenTimestampByHash.delete(hash);
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
        this.#log('Transaction receipt has failed status', {
          id: txMeta.id,
          hash: txMeta.hash,
          chainId: txMeta.chainId,
          blockNumber: receipt.blockNumber,
        });

        const revert = await extractRevert({
          messenger: this.#messenger,
          networkClientId: txMeta.networkClientId,
          txParams: txMeta.txParams,
        });

        this.#failTransaction(txMeta, new OnChainFailureError(revert));

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

    const isForcePollTransaction = this.#transactionToForcePoll?.id === id;

    this.#cleanTransaction(txMeta);

    if (isForcePollTransaction) {
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
        !tx.isUserOperation &&
        !tx.isStateOnly,
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
    this.#cleanTransaction(txMeta);
    this.hub.emit('transaction-failed', txMeta, error);
  }

  #dropTransaction(txMeta: TransactionMeta): void {
    this.#log('Transaction dropped', txMeta.id);
    this.#cleanTransaction(txMeta);
    this.hub.emit('transaction-dropped', txMeta);
  }

  #updateTransaction(txMeta: TransactionMeta, note: string): void {
    this.hub.emit('transaction-updated', txMeta, note);
  }

  async #getTransactionReceipt(
    txHash?: string,
  ): Promise<TransactionReceipt | undefined> {
    return (await rpcRequest({
      messenger: this.#messenger,
      networkClientId: this.#networkClientId,
      method: 'eth_getTransactionReceipt',
      params: [txHash as string],
    })) as TransactionReceipt | undefined;
  }

  async #getTransactionByHash(txHash?: string): Promise<Json> {
    return (await rpcRequest({
      messenger: this.#messenger,
      networkClientId: this.#networkClientId,
      method: 'eth_getTransactionByHash',
      params: [txHash as string],
    })) as Json;
  }

  async #getBlockByHash(
    blockHash: string,
    includeTransactionDetails: boolean,
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return await rpcRequest({
      messenger: this.#messenger,
      networkClientId: this.#networkClientId,
      method: 'eth_getBlockByHash',
      params: [blockHash, includeTransactionDetails],
    });
  }

  async #getNetworkTransactionCount(address: string): Promise<string> {
    return (await rpcRequest({
      messenger: this.#messenger,
      networkClientId: this.#networkClientId,
      method: 'eth_getTransactionCount',
      params: [address, 'latest'],
    })) as string;
  }

  #getChainTransactions(): TransactionMeta[] {
    return this.#getTransactions().filter((tx) => tx.chainId === this.#chainId);
  }

  #getNetworkClientTransactions(): TransactionMeta[] {
    const networkClientId = this.#networkClientId;
    return this.#getTransactions().filter(
      (tx) => tx.networkClientId === networkClientId,
    );
  }
}
