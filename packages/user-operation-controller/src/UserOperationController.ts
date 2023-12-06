import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { toHex } from '@metamask/controller-utils';
import type { NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import EventEmitter from 'events';
import type { Patch } from 'immer';
import { cloneDeep } from 'lodash';
import { v1 as random } from 'uuid';

import { ADDRESS_ZERO, EMPTY_BYTES, ENTRYPOINT } from './constants';
import { Bundler } from './helpers/Bundler';
import { PendingUserOperationTracker } from './helpers/PendingUserOperationTracker';
import { projectLogger as log } from './logger';
import type {
  SmartContractAccount,
  UserOperation,
  UserOperationMetadata,
} from './types';
import { UserOperationStatus } from './types';
import {
  validateAddUserOperationOptions,
  validateAddUserOperationRequest,
  validatePrepareUserOperationResponse,
  validateSignUserOperationResponse,
  validateUpdateUserOperationResponse,
} from './utils/validation';

const GAS_BUFFER = 1.5;
const DEFAULT_INTERVAL = 10 * 1000; // 10 Seconds

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
  | NetworkControllerGetNetworkClientByIdAction;

export type UserOperationControllerEvents = UserOperationStateChange;

export type UserOperationControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  UserOperationControllerActions,
  UserOperationControllerEvents,
  UserOperationControllerActions['type'],
  UserOperationControllerEvents['type']
>;

export type UserOperationControllerOptions = {
  interval?: number;
  messenger: UserOperationControllerMessenger;
  state?: Partial<UserOperationControllerState>;
};

/**
 * Controller for creating and managing the life cycle of user operations.
 */
export class UserOperationController extends BaseController<
  typeof controllerName,
  UserOperationControllerState,
  UserOperationControllerMessenger
> {
  hub: EventEmitter;

  #pendingUserOperationTracker: PendingUserOperationTracker;

  /**
   * Construct a UserOperationController instance.
   *
   * @param options - Controller options.
   * @param options.interval - Polling interval used to check the status of pending user operations.
   * @param options.messenger - Restricted controller messenger for the user operation controller.
   * @param options.state - Initial state to set on the controller.
   */
  constructor({ interval, messenger, state }: UserOperationControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state },
    });

    this.hub = new EventEmitter();

    this.#pendingUserOperationTracker = new PendingUserOperationTracker({
      getUserOperations: () =>
        cloneDeep(Object.values(this.state.userOperations)),
      messenger,
    });

    this.#pendingUserOperationTracker.setIntervalLength(
      interval ?? DEFAULT_INTERVAL,
    );

    this.#addPendingUserOperationTrackerListeners();
  }

  /**
   * Create and submit a user operation.
   *
   * @param request - Information required to create a user operation.
   * @param request.data - Data to include in the resulting transaction.
   * @param request.maxFeePerGas - Maximum fee per gas to pay towards the transaction.
   * @param request.maxPriorityFeePerGas - Maximum priority fee per gas to pay towards the transaction.
   * @param request.to - Destination address of the resulting transaction.
   * @param request.value - Value to include in the resulting transaction.
   * @param options - Configuration options when creating a user operation.
   * @param options.chainId - Chain ID of the resulting transaction.
   * @param options.smartContractAccount - Smart contract abstraction to provide the contract specific values such as call data and nonce.
   */
  async addUserOperation(
    request: {
      data?: string;
      maxFeePerGas: string;
      maxPriorityFeePerGas: string;
      to?: string;
      value?: string;
    },
    options: { chainId: string; smartContractAccount: SmartContractAccount },
  ) {
    validateAddUserOperationRequest(request);
    validateAddUserOperationOptions(options);

    const { chainId } = options;
    const metadata = this.#createMetadata(chainId);
    const { id } = metadata;
    let throwError = false;

    const hashValue = (async () => {
      try {
        return await this.#prepareAndSubmitUserOperation(
          metadata,
          request,
          options,
        );
      } catch (error) {
        this.#failUserOperation(metadata, error);

        if (throwError) {
          throw error;
        }

        return undefined;
      }
    })();

    const hash = async () => {
      throwError = true;
      return await hashValue;
    };

    const transactionHash = async () => {
      await hash();

      const { transactionHash: finalTransactionHash } =
        await this.#waitForConfirmation(metadata);

      return finalTransactionHash;
    };

    return {
      id,
      hash,
      transactionHash,
    };
  }

  startPollingByNetworkClientId(networkClientId: string): string {
    return this.#pendingUserOperationTracker.startPollingByNetworkClientId(
      networkClientId,
    );
  }

  async #prepareAndSubmitUserOperation(
    metadata: UserOperationMetadata,
    request: {
      data?: string;
      maxFeePerGas: string;
      maxPriorityFeePerGas: string;
      to?: string;
      value?: string;
    },
    options: { chainId: string; smartContractAccount: SmartContractAccount },
  ) {
    const { data, maxFeePerGas, maxPriorityFeePerGas, to, value } = request;
    const { chainId, smartContractAccount } = options;

    await this.#prepareUserOperation(
      to,
      value,
      data,
      metadata,
      smartContractAccount,
      chainId,
    );

    const bundler = new Bundler(metadata.bundlerUrl as string);

    metadata.userOperation.maxFeePerGas = maxFeePerGas;
    metadata.userOperation.maxPriorityFeePerGas = maxPriorityFeePerGas;

    await this.#updateGas(metadata, bundler);
    await this.#addPaymasterData(metadata, smartContractAccount);
    await this.#signUserOperation(metadata, smartContractAccount);
    await this.#submitUserOperation(metadata, bundler);

    return metadata.hash as string;
  }

  async #waitForConfirmation(
    metadata: UserOperationMetadata,
  ): Promise<UserOperationMetadata> {
    const { id, hash } = metadata;

    log('Waiting for confirmation', id, hash);

    return new Promise((resolve, reject) => {
      this.hub.once(`${id}:confirmed`, (finalMetadata) => {
        resolve(finalMetadata);
      });

      this.hub.once(`${id}:failed`, (_finalMetadata, error) => {
        reject(error);
      });
    });
  }

  #createMetadata(chainId: string): UserOperationMetadata {
    const metadata: UserOperationMetadata = {
      actualGasCost: null,
      actualGasUsed: null,
      baseFeePerGas: null,
      bundlerUrl: null,
      chainId,
      error: null,
      hash: null,
      id: random(),
      status: UserOperationStatus.Unapproved,
      time: Date.now(),
      transactionHash: null,
      userOperation: this.#createEmptyUserOperation(),
    };

    this.#updateMetadata(metadata);

    log('Added user operation', metadata.id);

    return metadata;
  }

  async #prepareUserOperation(
    to: string | undefined,
    value: string | undefined,
    data: string | undefined,
    metadata: UserOperationMetadata,
    smartContractAccount: SmartContractAccount,
    chainId: string,
  ) {
    const { id, userOperation } = metadata;

    log('Preparing user operation', { id });

    const response = await smartContractAccount.prepareUserOperation({
      chainId,
      data,
      to,
      value,
    });

    validatePrepareUserOperationResponse(response);

    const {
      bundler: bundlerUrl,
      callData,
      dummyPaymasterAndData,
      dummySignature,
      gas,
      initCode,
      nonce,
      sender,
    } = response;

    userOperation.callData = callData;
    userOperation.callGasLimit = gas?.callGasLimit ?? EMPTY_BYTES;
    userOperation.initCode = initCode ?? EMPTY_BYTES;
    userOperation.nonce = nonce;
    userOperation.paymasterAndData = dummyPaymasterAndData ?? EMPTY_BYTES;
    userOperation.preVerificationGas = gas?.preVerificationGas ?? EMPTY_BYTES;
    userOperation.sender = sender;
    userOperation.signature = dummySignature ?? EMPTY_BYTES;
    userOperation.verificationGasLimit =
      gas?.verificationGasLimit ?? EMPTY_BYTES;

    metadata.bundlerUrl = bundlerUrl;

    this.#updateMetadata(metadata);
  }

  async #updateGas(
    metadata: UserOperationMetadata,
    bundler: Bundler,
  ): Promise<void> {
    const { id, userOperation } = metadata;

    log('Updating gas', id);

    // Previous validation ensures that all gas values are set or none are.
    if (userOperation.callGasLimit !== EMPTY_BYTES) {
      log('Skipping gas estimation as already set', {
        callGasLimit: userOperation.callGasLimit,
        preVerificationGas: userOperation.preVerificationGas,
        verificationGasLimit: userOperation.verificationGasLimit,
      });

      return;
    }

    const payload = {
      ...userOperation,
      callGasLimit: '0x1',
      preVerificationGas: '0x1',
      verificationGasLimit: '0x1',
    };

    const { preVerificationGas, verificationGas, callGasLimit } =
      await bundler.estimateUserOperationGas(payload, ENTRYPOINT);

    const normalizeGas = (value: number) =>
      toHex(Math.round(value * GAS_BUFFER));

    userOperation.callGasLimit = normalizeGas(callGasLimit);
    userOperation.preVerificationGas = normalizeGas(preVerificationGas);
    userOperation.verificationGasLimit = normalizeGas(verificationGas);

    this.#updateMetadata(metadata);
  }

  async #addPaymasterData(
    metadata: UserOperationMetadata,
    smartContractAccount: SmartContractAccount,
  ) {
    const { id, userOperation } = metadata;

    log('Requesting paymaster data', { id });

    const response = await smartContractAccount.updateUserOperation({
      userOperation,
    });

    validateUpdateUserOperationResponse(response);

    userOperation.paymasterAndData = response.paymasterAndData ?? EMPTY_BYTES;

    this.#updateMetadata(metadata);
  }

  async #signUserOperation(
    metadata: UserOperationMetadata,
    smartContractAccount: SmartContractAccount,
  ) {
    const { id, chainId, userOperation } = metadata;

    log('Signing user operation', id, userOperation);

    const response = await smartContractAccount.signUserOperation({
      userOperation,
      chainId,
    });

    validateSignUserOperationResponse(response);

    const { signature } = response;

    userOperation.signature = signature;

    log('Signed user operation', signature);

    metadata.status = UserOperationStatus.Signed;

    this.#updateMetadata(metadata);
  }

  async #submitUserOperation(
    metadata: UserOperationMetadata,
    bundler: Bundler,
  ) {
    const { userOperation } = metadata;

    log('Submitting user operation', userOperation);

    const hash = await bundler.sendUserOperation(userOperation, ENTRYPOINT);

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
      callData: EMPTY_BYTES,
      callGasLimit: EMPTY_BYTES,
      initCode: EMPTY_BYTES,
      maxFeePerGas: EMPTY_BYTES,
      maxPriorityFeePerGas: EMPTY_BYTES,
      nonce: EMPTY_BYTES,
      paymasterAndData: EMPTY_BYTES,
      preVerificationGas: EMPTY_BYTES,
      sender: ADDRESS_ZERO,
      signature: EMPTY_BYTES,
      verificationGasLimit: EMPTY_BYTES,
    };
  }

  #updateMetadata(metadata: UserOperationMetadata) {
    const { id } = metadata;

    this.update((state) => {
      state.userOperations[id] = cloneDeep(metadata);
    });
  }

  #addPendingUserOperationTrackerListeners() {
    this.#pendingUserOperationTracker.hub.on(
      'user-operation-confirmed',
      (metadata) => {
        log('In listener...');
        this.hub.emit('user-operation-confirmed', metadata);
        this.hub.emit(`${metadata.id}:confirmed`, metadata);
      },
    );

    this.#pendingUserOperationTracker.hub.on(
      'user-operation-failed',
      (metadata, error) => {
        this.hub.emit('user-operation-failed', metadata, error);
        this.hub.emit(`${metadata.id}:failed`, metadata, error);
      },
    );

    this.#pendingUserOperationTracker.hub.on(
      'user-operation-updated',
      (metadata) => {
        this.#updateMetadata(metadata);
      },
    );
  }
}
