import { query } from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import type { Provider } from '@metamask/network-controller';
import { StaticIntervalPollingControllerOnly } from '@metamask/polling-controller';
import type { Json } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import EventEmitter from 'events';

import { projectLogger } from '../logger';
import type { UserOperationMetadata, UserOperationReceipt } from '../types';
import { UserOperationStatus } from '../types';
import type { UserOperationControllerMessenger } from '../UserOperationController';
import { Bundler } from './Bundler';

const log = createModuleLogger(projectLogger, 'pending-user-operations');

type Events = {
  'user-operation-confirmed': [metadata: UserOperationMetadata];
  'user-operation-failed': [txMeta: UserOperationMetadata, error: Error];
  'user-operation-updated': [txMeta: UserOperationMetadata];
};

export type PendingUserOperationTrackerEventEmitter = EventEmitter & {
  on<T extends keyof Events>(
    eventName: T,
    listener: (...args: Events[T]) => void,
  ): PendingUserOperationTrackerEventEmitter;

  once<T extends keyof Events>(
    eventName: T,
    listener: (...args: Events[T]) => void,
  ): PendingUserOperationTrackerEventEmitter;

  emit<T extends keyof Events>(eventName: T, ...args: Events[T]): boolean;
};

/**
 * A helper class to periodically query the bundlers
 * and update the status of any submitted user operations.
 */
export class PendingUserOperationTracker extends StaticIntervalPollingControllerOnly {
  hub: PendingUserOperationTrackerEventEmitter;

  #getUserOperations: () => UserOperationMetadata[];

  #messenger: UserOperationControllerMessenger;

  constructor({
    getUserOperations,
    messenger,
  }: {
    getUserOperations: () => UserOperationMetadata[];
    messenger: UserOperationControllerMessenger;
  }) {
    super();

    this.hub = new EventEmitter() as PendingUserOperationTrackerEventEmitter;

    this.#getUserOperations = getUserOperations;
    this.#messenger = messenger;
  }

  async _executePoll(networkClientId: string, _options: Json) {
    try {
      const { blockTracker, configuration, provider } = this.#messenger.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
      );

      log('Polling', {
        blockNumber: blockTracker.getCurrentBlock(),
        chainId: configuration.chainId,
        rpcUrl: configuration.rpcUrl,
      });

      await this.#checkUserOperations(configuration.chainId, provider);
    } catch (error) {
      /* istanbul ignore next */
      log('Failed to check user operations', error);
    }
  }

  async #checkUserOperations(chainId: string, provider: Provider) {
    const pendingUserOperations = this.#getPendingUserOperations().filter(
      (metadata) => metadata.chainId === chainId,
    );

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
        this.#checkUserOperation(userOperation, provider),
      ),
    );
  }

  async #checkUserOperation(
    metadata: UserOperationMetadata,
    provider: Provider,
  ) {
    const { bundlerUrl, hash, id } = metadata;

    if (!hash || !bundlerUrl) {
      log('Skipping user operation as missing hash or bundler', id);
      return;
    }

    try {
      const receipt = await this.#getUserOperationReceipt(hash, bundlerUrl);
      const isSuccess = receipt?.success;

      if (receipt && !isSuccess) {
        this.#onUserOperationFailed(metadata, receipt);
        return;
      }

      if (isSuccess) {
        await this.#onUserOperationConfirmed(metadata, receipt, provider);
        return;
      }

      log('No receipt found for user operation', { id, hash });
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      log('Failed to check user operation', id, error);
    }
  }

  async #onUserOperationConfirmed(
    metadata: UserOperationMetadata,
    receipt: UserOperationReceipt,
    provider: Provider,
  ) {
    const { id } = metadata;

    const {
      actualGasCost,
      actualGasUsed,
      receipt: { blockHash, transactionHash },
    } = receipt;

    log('User operation confirmed', id, transactionHash);

    const { baseFeePerGas } = await query(
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new EthQuery(provider as any),
      'getBlockByHash',
      [blockHash, false],
    );

    metadata.actualGasCost = actualGasCost;
    metadata.actualGasUsed = actualGasUsed;
    metadata.baseFeePerGas = baseFeePerGas;
    metadata.status = UserOperationStatus.Confirmed;
    metadata.transactionHash = transactionHash;

    this.#updateUserOperation(metadata);

    this.hub.emit('user-operation-confirmed', metadata);
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
      'user-operation-failed',
      metadata,
      new Error('User operation receipt has failed status'),
    );
  }

  #getPendingUserOperations(): UserOperationMetadata[] {
    return this.#getUserOperations().filter(
      (userOperation) => userOperation.status === UserOperationStatus.Submitted,
    );
  }

  #updateUserOperation(metadata: UserOperationMetadata) {
    this.hub.emit('user-operation-updated', metadata);
  }

  async #getUserOperationReceipt(
    hash: string,
    bundlerUrl: string,
  ): Promise<UserOperationReceipt | undefined> {
    const bundler = new Bundler(bundlerUrl);
    return bundler.getUserOperationReceipt(hash);
  }
}
