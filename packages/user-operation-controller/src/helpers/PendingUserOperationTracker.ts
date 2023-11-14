import type { Block } from '@ethersproject/providers';
import type { BlockTracker } from '@metamask/network-controller';
import { createModuleLogger } from '@metamask/utils';
import EventEmitter from 'events';

import { projectLogger } from '../logger';
import type { UserOperationMetadata, UserOperationReceipt } from '../types';
import { UserOperationStatus } from '../types';
import type { UserOperationControllerState } from '../UserOperationController';
import { getBundler } from './Bundler';

const log = createModuleLogger(projectLogger, 'pending-user-operations');

type Events = {
  [key: `${string}:confirmed`]: [metadata: UserOperationMetadata];
  [key: `${string}:failed`]: [txMeta: UserOperationMetadata, error: Error];
  'user-operation-updated': [txMeta: UserOperationMetadata];
};

export interface PendingUserOperationTrackerEventEmitter extends EventEmitter {
  on<T extends keyof Events>(
    eventName: T,
    listener: (...args: Events[T]) => void,
  ): this;

  once<T extends keyof Events>(
    eventName: T,
    listener: (...args: Events[T]) => void,
  ): this;

  emit<T extends keyof Events>(eventName: T, ...args: Events[T]): boolean;
}

export class PendingUserOperationTracker {
  hub: PendingUserOperationTrackerEventEmitter;

  #blockTracker: BlockTracker;

  #getBlockByHash: (hash: string) => Promise<Block>;

  #getUserOperations: () => UserOperationMetadata[];

  #listener: any;

  #onStateChange: (
    listener: (state: UserOperationControllerState) => void,
  ) => void;

  #running: boolean;

  constructor({
    blockTracker,
    getBlockByHash,
    getUserOperations,
    onStateChange,
  }: {
    blockTracker: BlockTracker;
    getBlockByHash: (hash: string) => Promise<Block>;
    getUserOperations: () => UserOperationMetadata[];
    onStateChange: (
      listener: (state: UserOperationControllerState) => void,
    ) => void;
  }) {
    this.hub = new EventEmitter() as PendingUserOperationTrackerEventEmitter;

    this.#blockTracker = blockTracker;
    this.#getBlockByHash = getBlockByHash;
    this.#getUserOperations = getUserOperations;
    this.#listener = this.#onLatestBlock.bind(this);
    this.#onStateChange = onStateChange;
    this.#running = false;

    this.#onStateChange((state) => {
      const pendingUserOperations = this.#getPendingUserOperations(
        Object.values(state.userOperations),
      );

      if (pendingUserOperations.length) {
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
    try {
      log('Checking latest block', latestBlockNumber);
      await this.#checkUserOperations();
    } catch (error) {
      /* istanbul ignore next */
      log('Failed to check user operations', error);
    }
  }

  async #checkUserOperations() {
    const pendingUserOperations = this.#getPendingUserOperations();

    if (!pendingUserOperations.length) {
      log('No pending user operations to check');
      return;
    }

    log('Found pending user operations to check', {
      count: pendingUserOperations.length,
      ids: pendingUserOperations.map((userOperation) => userOperation.id),
    });

    await Promise.all(
      pendingUserOperations.map((userOperation) =>
        this.#checkUserOperation(userOperation),
      ),
    );
  }

  async #checkUserOperation(metadata: UserOperationMetadata) {
    const { chainId, hash, id } = metadata;

    if (!hash) {
      log('Skipping user operation as no hash', id);
      return;
    }

    try {
      const receipt = await this.#getUserOperationReceipt(hash, chainId);
      const isSuccess = receipt?.success;

      if (receipt && !isSuccess) {
        this.#onUserOperationFailed(metadata, receipt);
        return;
      }

      if (isSuccess) {
        await this.#onUserOperationConfirmed(metadata, receipt);
        return;
      }

      log('No receipt found for user operation', { id, hash });
    } catch (error: any) {
      log('Failed to check user operation', id, error);
    }
  }

  async #onUserOperationConfirmed(
    metadata: UserOperationMetadata,
    receipt: UserOperationReceipt,
  ) {
    const { id } = metadata;

    const {
      actualGasCost,
      actualGasUsed,
      receipt: { blockHash, transactionHash },
    } = receipt;

    log('User operation confirmed', id, transactionHash);

    const block = await this.#getBlockByHash(blockHash);

    metadata.baseFeePerGas = (block.baseFeePerGas as any).toHexString();
    metadata.actualGasCost = actualGasCost;
    metadata.actualGasUsed = actualGasUsed;
    metadata.status = UserOperationStatus.Confirmed;
    metadata.transactionHash = transactionHash || null;

    this.#updateUserOperation(metadata);

    this.hub.emit(`${id}:confirmed`, metadata);
  }

  #onUserOperationFailed(
    metadata: UserOperationMetadata,
    _receipt: UserOperationReceipt,
  ) {
    const { id } = metadata;

    log('User operation failed', id);

    metadata.status = UserOperationStatus.Failed;

    this.#updateUserOperation(metadata);

    this.hub.emit(
      `${id}:failed`,
      metadata,
      new Error('User operation receipt has failed status'),
    );
  }

  #getPendingUserOperations(
    userOperations?: UserOperationMetadata[],
  ): UserOperationMetadata[] {
    return (userOperations ?? this.#getUserOperations()).filter(
      (userOperation) => userOperation.status === UserOperationStatus.Submitted,
    );
  }

  #updateUserOperation(metadata: UserOperationMetadata) {
    this.hub.emit('user-operation-updated', metadata);
  }

  async #getUserOperationReceipt(
    hash: string,
    chainId: string,
  ): Promise<UserOperationReceipt | undefined> {
    const bundler = getBundler(chainId);
    return bundler.getUserOperationReceipt(hash);
  }
}
