import { AddressZero } from '@ethersproject/constants';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { toHex } from '@metamask/controller-utils';
import type { Provider } from '@metamask/network-controller';
import EventEmitter from 'events';
import type { Patch } from 'immer';
import { cloneDeep } from 'lodash';
import { v1 as random } from 'uuid';

import { ENTRYPOINT } from './constants';
import { Bundler } from './helpers/Bundler';
import { projectLogger as log } from './logger';
import type {
  SmartContractAccount,
  UserOperation,
  UserOperationMetadata,
} from './types';
import { UserOperationStatus } from './types';

const GAS_BUFFER = 2;

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
   * Construct a UserOperation controller.
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
    {
      data,
      maxFeePerGas,
      maxPriorityFeePerGas,
      to,
      value,
    }: {
      data?: string;
      maxFeePerGas: string;
      maxPriorityFeePerGas: string;
      to?: string;
      value?: string;
    },
    {
      chainId,
      smartContractAccount,
    }: { chainId: string; smartContractAccount: SmartContractAccount },
  ) {
    const metadata = this.#createMetadata(chainId);
    const { id } = metadata;

    const hash = (async () => {
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
        throw error;
      }
    })();

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

    const {
      bundler: bundlerUrl,
      callData,
      dummyPaymasterAndData,
      dummySignature,
      initCode,
      nonce,
      sender,
    } = await smartContractAccount.prepareUserOperation({
      chainId,
      data,
      provider,
      to,
      value,
    });

    if (!bundlerUrl) {
      throw new Error(`No bundler specified for chain ID: ${chainId}`);
    }

    userOperation.callData = callData;
    userOperation.initCode = initCode;
    userOperation.nonce = nonce;
    userOperation.paymasterAndData = dummyPaymasterAndData ?? '0x';
    userOperation.sender = sender;
    userOperation.signature = dummySignature ?? '0x';

    metadata.bundlerUrl = bundlerUrl;

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
    };

    const estimatedGas = await bundler.estimateUserOperationGas(
      payload,
      ENTRYPOINT,
    );

    userOperation.preVerificationGas = toHex(
      Math.round(estimatedGas.preVerificationGas * GAS_BUFFER),
    );

    userOperation.verificationGasLimit = toHex(
      Math.round(estimatedGas.verificationGasLimit * GAS_BUFFER),
    );

    userOperation.callGasLimit = toHex(
      Math.round(estimatedGas.callGasLimit * GAS_BUFFER),
    );

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

    userOperation.paymasterAndData = response.paymasterAndData;

    this.#updateMetadata(metadata);
  }

  async #signUserOperation(
    metadata: UserOperationMetadata,
    smartContractAccount: SmartContractAccount,
  ) {
    const { id, chainId, userOperation } = metadata;

    log('Signing user operation', id, userOperation);

    const { signature } = await smartContractAccount.signUserOperation({
      userOperation,
      chainId,
    });

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
  }
}
