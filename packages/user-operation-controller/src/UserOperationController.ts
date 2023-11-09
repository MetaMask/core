import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import { TransactionParams } from '@metamask/transaction-controller';
import type { Patch } from 'immer';
import { AddressZero } from '@ethersproject/constants';

import {
  UserOperation,
  UserOperationMetadata,
  UserOperationStatus,
} from './types';
import { projectLogger as log } from './logger';
import { Web3Provider } from '@ethersproject/providers';
import { v1 as random } from 'uuid';
import { signUserOperation } from './utils/signature';
import { BlockTracker, ProviderProxy } from '../../network-controller/src';
import { PendingUserOperationTracker } from './helpers/PendingUserOperationTracker';
import { cloneDeep } from 'lodash';
import EventEmitter from 'events';
import { AddResult } from '@metamask/approval-controller';
import { ApprovalType, ORIGIN_METAMASK } from '@metamask/controller-utils';
import { AddApprovalRequest } from '@metamask/approval-controller';
import { getTransactionMetadata } from './utils/transaction';
import { toHex } from '@metamask/controller-utils';
import { Bundler, getBundler } from './helpers/Bundler';
import { ENTRYPOINT } from './constants';
import { sendSnapRequest } from './snaps';
import { SnapProvider } from './snaps/types';

const DUMMY_SIGNATURE =
  '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c';

const controllerName = 'UserOperationController';

const stateMetadata = {
  userOperations: { persist: true, anonymous: false },
};

const getDefaultState = () => ({
  userOperations: {},
});

export type UserOperationControllerState = {
  userOperations: Record<string, UserOperationMetadata>;
};

export type GetUserOperationState = {
  type: `${typeof controllerName}:getState`;
  handler: () => UserOperationControllerState;
};

export type UserOperationStateChange = {
  type: `${typeof controllerName}:stateChange`;
  payload: [UserOperationControllerState, Patch[]];
};

export type UserOperationControllerActions =
  | GetUserOperationState
  | AddApprovalRequest;

export type UserOperationControllerEvents = UserOperationStateChange;

export type UserOperationControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  UserOperationControllerActions,
  UserOperationControllerEvents,
  UserOperationControllerActions['type'],
  UserOperationControllerEvents['type']
>;

export type UserOperationControllerOptions = {
  blockTracker: BlockTracker;
  getPrivateKey: () => Promise<string>;
  messenger: UserOperationControllerMessenger;
  provider: ProviderProxy;
  state?: Partial<UserOperationControllerState>;
};

/**
 * Controller for creating and managing the life cycle of user operations.
 */
export class UserOperationController extends BaseControllerV2<
  typeof controllerName,
  UserOperationControllerState,
  UserOperationControllerMessenger
> {
  hub: EventEmitter;

  #blockTracker: BlockTracker;

  #getPrivateKey: () => Promise<string>;

  #provider: ProviderProxy;

  /**
   * Construct a UserOperation controller.
   *
   * @param options - Controller options.
   * @param options.messenger - Restricted controller messenger for the user operation controller.
   * @param options.state - Initial state to set on the controller.
   * @param options.getPrivateKey
   */
  constructor({
    blockTracker,
    getPrivateKey,
    messenger,
    provider,
    state,
  }: UserOperationControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state },
    });

    this.hub = new EventEmitter();

    this.#blockTracker = blockTracker;
    this.#getPrivateKey = getPrivateKey;
    this.#provider = provider;

    const pendingTracker = new PendingUserOperationTracker({
      blockTracker: this.#blockTracker,
      getBlockByHash: (hash: string) =>
        new Web3Provider(this.#provider as any).getBlock(hash),
      getUserOperations: () => Object.values(this.#getState().userOperations),
      onStateChange: (
        listener: (state: UserOperationControllerState) => void,
      ) =>
        this.hub.on(
          'user-operations-updated',
          (state: UserOperationControllerState) => {
            listener(state);
          },
        ),
    });

    pendingTracker.hub.on('user-operation-updated', (metadata) => {
      this.#updateMetadata(metadata);
    });
  }

  async addUserOperationFromTransaction(
    transaction: TransactionParams,
    { chainId, snapId }: { chainId: string; snapId: string },
  ) {
    const bundler = getBundler(chainId);
    const metadata = this.#createMetadata(chainId);

    try {
      await this.#applySnapData(metadata, transaction, snapId);
      await this.#updateGas(metadata, bundler);

      const resultCallbacks = await this.#approveUserOperation(metadata);

      await this.#signUserOperation(metadata);
      await this.#submitUserOperation(metadata, bundler);

      resultCallbacks?.success();
    } catch (error) {
      this.#failUserOperation(metadata, error);
      throw error;
    }
  }

  #createMetadata(chainId: string): UserOperationMetadata {
    const metadata = {
      actualGasCost: null,
      actualGasUsed: null,
      baseFeePerGas: null,
      chainId,
      error: null,
      hash: null,
      id: random(),
      status: UserOperationStatus.Unapproved,
      time: Date.now(),
      transactionHash: null,
      transactionParams: null,
      userOperation: this.#createEmptyUserOperation(),
    };

    this.#updateMetadata(metadata);

    log('Added user operation', metadata.id);

    return metadata;
  }

  async #applySnapData(
    metadata: UserOperationMetadata,
    transaction: TransactionParams,
    snapId: string,
  ) {
    const { id, userOperation } = metadata;

    log('Requesting data from snap', { id, snapId });

    const provider = new Web3Provider(this.#provider as any);

    const ethereum: SnapProvider = {
      request: ({method, params}) => provider.send(method, params),
    };

    const response = await sendSnapRequest(snapId, {
      ethereum,
      sender: transaction.from,
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
    });

    userOperation.callData = response.callData;
    userOperation.maxFeePerGas = toHex(0.16e9);
    userOperation.maxPriorityFeePerGas = toHex(0.15e9);
    userOperation.nonce = response.nonce;
    userOperation.sender = transaction.from;

    metadata.transactionParams = transaction as any;

    this.#updateMetadata(metadata);
  }

  async #updateGas(
    metadata: UserOperationMetadata,
    bundler: Bundler,
  ): Promise<void> {
    const { id, userOperation } = metadata;

    log('Updating gas', id);

    const payload = {
      ...userOperation,
      callGasLimit: '0x1',
      preVerificationGas: '0x1',
      verificationGasLimit: '0x1',
      signature: DUMMY_SIGNATURE,
    };

    const estimatedGas = await bundler.estimateUserOperationGas(
      payload,
      ENTRYPOINT,
    );

    userOperation.preVerificationGas = toHex(estimatedGas.preVerificationGas);

    userOperation.verificationGasLimit = toHex(
      estimatedGas.verificationGasLimit,
    );

    userOperation.callGasLimit = toHex(estimatedGas.callGasLimit);

    this.#updateMetadata(metadata);
  }

  async #approveUserOperation(metadata: UserOperationMetadata) {
    const { resultCallbacks } = await this.#requestApproval(metadata);

    metadata.status = UserOperationStatus.Approved;
    this.#updateMetadata(metadata);

    return resultCallbacks;
  }

  async #signUserOperation(metadata: UserOperationMetadata) {
    const { id, chainId, userOperation } = metadata;

    log('Signing user operation', id);

    const signature = await signUserOperation(
      userOperation,
      ENTRYPOINT,
      chainId,
      await this.#getPrivateKey(),
    );

    userOperation.signature = signature;

    log('Signed user operation', signature);

    metadata.status = UserOperationStatus.Signed;

    this.#updateMetadata(metadata);
  }

  async #submitUserOperation(
    metadata: UserOperationMetadata,
    bundler: Bundler,
  ) {
    const { id, userOperation } = metadata;

    log('Submitting user operation', id);

    const hash = await bundler.sendUserOperation(userOperation, ENTRYPOINT);

    log('Submitted user operation', hash);

    metadata.hash = hash;
    metadata.status = UserOperationStatus.Submitted;

    this.#updateMetadata(metadata);
  }

  #failUserOperation(metadata: UserOperationMetadata, error: unknown) {
    const { id } = metadata;
    const rawError = error as any;

    log('User operation failed', id, error);

    metadata.error = {
      name: rawError.name,
      message: rawError.message,
      stack: rawError.stack,
      code: rawError.code,
      rpc: rawError.rpc,
    };

    metadata.status = UserOperationStatus.Failed;

    this.#updateMetadata(metadata);
  }

  #createEmptyUserOperation(): UserOperation {
    return {
      callData: '0x',
      callGasLimit: '0x',
      initCode: '0x',
      maxFeePerGas: '0x',
      maxPriorityFeePerGas: '0x',
      nonce: '0x',
      paymasterAndData: '0x',
      preVerificationGas: '0x',
      sender: AddressZero,
      signature: '0x',
      verificationGasLimit: '0x',
    };
  }

  #updateMetadata(metadata: UserOperationMetadata) {
    const { id } = metadata;

    this.update((state) => {
      state.userOperations[id] = cloneDeep(metadata);
    });

    this.hub.emit('user-operations-updated', this.#getState());

    this.#updateTransaction(metadata);
  }

  #updateTransaction(metadata: UserOperationMetadata) {
    if (!metadata.transactionParams) {
      return;
    }

    const transactionMetadata = getTransactionMetadata(metadata);
    this.hub.emit('transaction-updated', transactionMetadata);
  }

  #getState(): UserOperationControllerState {
    return cloneDeep(this.state);
  }

  async #requestApproval(metadata: UserOperationMetadata): Promise<AddResult> {
    const { id } = metadata;
    const type = ApprovalType.Transaction;
    const requestData = { txId: id };

    return (await this.messagingSystem.call(
      'ApprovalController:addRequest',
      {
        id,
        origin: ORIGIN_METAMASK,
        type,
        requestData,
        expectsResult: true,
      },
      true, // Should display approval request to user
    )) as Promise<AddResult>;
  }
}
