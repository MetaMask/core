import { AddressZero } from '@ethersproject/constants';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { toHex } from '@metamask/controller-utils';
import type { Provider } from '@metamask/network-controller';
import EventEmitter from 'events';
import type { Patch } from 'immer';
import { cloneDeep } from 'lodash';
import { v1 as random } from 'uuid';

import { EMPTY_BYTES, ENTRYPOINT } from './constants';
import { Bundler } from './helpers/Bundler';
import { projectLogger as log } from './logger';
import type {
  SmartContractAccount,
  UserOperation,
  UserOperationMetadata,
} from './types';
import { UserOperationStatus } from './types';
import {
  validateAddUserOperatioOptions,
  validateAddUserOperationRequest,
  validatePrepareUserOperationResponse,
  validateSignUserOperationResponse,
  validateUpdateUserOperationResponse,
} from './utils/validation';

const GAS_BUFFER = 1.5;

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

export type UserOperationControllerActions = GetUserOperationState;

export type UserOperationControllerEvents = UserOperationStateChange;

export type UserOperationControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  UserOperationControllerActions,
  UserOperationControllerEvents,
  UserOperationControllerActions['type'],
  UserOperationControllerEvents['type']
>;

export type UserOperationControllerOptions = {
  messenger: UserOperationControllerMessenger;
  provider: Provider;
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

  #provider: Provider;

  /**
   * Construct a UserOperationController instance.
   *
   * @param options - Controller options.
   * @param options.messenger - Restricted controller messenger for the user operation controller.
   * @param options.provider - The provider proxy to manage requests to the current network.
   * @param options.state - Initial state to set on the controller.
   */
  constructor({ messenger, provider, state }: UserOperationControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state },
    });

    this.hub = new EventEmitter();

    this.#provider = provider;
  }

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
    validateAddUserOperatioOptions(options);

    const { data, maxFeePerGas, maxPriorityFeePerGas, to, value } = request;
    const { chainId, smartContractAccount } = options;
    const metadata = this.#createMetadata(chainId);
    const { id } = metadata;
    let throwError = false;

    const hashValue = (async () => {
      try {
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
      return hashValue as Promise<string>;
    };

    return {
      id,
      hash,
    };
  }

  #createMetadata(chainId: string): UserOperationMetadata {
    const metadata = {
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
      transactionParams: null,
      userOperation: this.#createEmptyUserOperation(),
      userFeeLevel: null,
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

    const provider = this.#provider;

    const response = await smartContractAccount.prepareUserOperation({
      chainId,
      data,
      provider,
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

    const { preVerificationGas, verificationGasLimit, callGasLimit } =
      await bundler.estimateUserOperationGas(payload, ENTRYPOINT);

    const normalizeGas = (value: number) =>
      toHex(Math.round(value * GAS_BUFFER));

    userOperation.callGasLimit = normalizeGas(callGasLimit);
    userOperation.preVerificationGas = normalizeGas(preVerificationGas);
    userOperation.verificationGasLimit = normalizeGas(verificationGasLimit);

    this.#updateMetadata(metadata);
  }

  async #addPaymasterData(
    metadata: UserOperationMetadata,
    smartContractAccount: SmartContractAccount,
  ) {
    const { id, userOperation } = metadata;

    log('Requesting paymaster data', { id });

    const provider = this.#provider;

    const response = await smartContractAccount.updateUserOperation({
      provider,
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
      sender: AddressZero,
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
}
