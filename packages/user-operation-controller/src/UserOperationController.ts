/* eslint-disable n/no-process-env */

import { defaultAbiCoder } from '@ethersproject/abi';
import { AddressZero } from '@ethersproject/constants';
import { Web3Provider } from '@ethersproject/providers';
import type {
  AddResult,
  AddApprovalRequest,
} from '@metamask/approval-controller';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import {
  ApprovalType,
  ORIGIN_METAMASK,
  toHex,
} from '@metamask/controller-utils';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import type {
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import { stripHexPrefix } from 'ethereumjs-util';
import EventEmitter from 'events';
import type { Patch } from 'immer';
import { cloneDeep } from 'lodash';
import { v1 as random } from 'uuid';

import type { BlockTracker, ProviderProxy } from '../../network-controller/src';
import { ENTRYPOINT } from './constants';
import type { Bundler } from './helpers/Bundler';
import { getBundler } from './helpers/Bundler';
import { PendingUserOperationTracker } from './helpers/PendingUserOperationTracker';
import { projectLogger as log } from './logger';
import {
  sendSnapPaymasterRequest,
  sendSnapUserOperationRequest,
  sendSnapUserOperationSignatureRequest,
} from './snaps';
import type { SnapProvider } from './snaps/types';
import type { UserOperation, UserOperationMetadata } from './types';
import { UserOperationStatus } from './types';
import { updateGasFees } from './utils/gas-fees';
import { getTransactionMetadata } from './utils/transaction';

const DUMMY_SIGNATURE =
  '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c';

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
  getGasFeeEstimates: () => Promise<GasFeeState>;
  getPrivateKey: () => Promise<string>;
  getTransactions: () => TransactionMeta[];
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

  #getGasFeeEstimates: () => Promise<GasFeeState>;

  #getPrivateKey: () => Promise<string>;

  #getTransactions: () => TransactionMeta[];

  #pendingTracker: PendingUserOperationTracker;

  #provider: ProviderProxy;

  /**
   * Construct a UserOperation controller.
   *
   * @param options - Controller options.
   * @param options.blockTracker -
   * @param options.getGasFeeEstimates -
   * @param options.getPrivateKey -
   * @param options.getTransactions -
   * @param options.messenger - Restricted controller messenger for the user operation controller.
   * @param options.provider -
   * @param options.state - Initial state to set on the controller.
   */
  constructor({
    blockTracker,
    getGasFeeEstimates,
    getPrivateKey,
    getTransactions,
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
    this.#getGasFeeEstimates = getGasFeeEstimates;
    this.#getPrivateKey = getPrivateKey;
    this.#getTransactions = getTransactions;
    this.#provider = provider;

    this.#pendingTracker = new PendingUserOperationTracker({
      blockTracker: this.#blockTracker,
      getBlockByHash: (hash: string) =>
        new Web3Provider(this.#provider as any).getBlock(hash),
      getUserOperations: () => Object.values(this.#getState().userOperations),
      onStateChange: (
        listener: (state: UserOperationControllerState) => void,
      ) =>
        this.hub.on(
          'user-operations-updated',
          (newState: UserOperationControllerState) => {
            listener(newState);
          },
        ),
    });

    this.#pendingTracker.hub.on('user-operation-updated', (metadata) => {
      this.#updateMetadata(metadata);
    });
  }

  async addUserOperationFromTransaction(
    transaction: TransactionParams,
    { chainId, snapId }: { chainId: string; snapId: string },
  ) {
    const bundler = getBundler(chainId);
    const metadata = this.#createMetadata(chainId);
    const { id } = metadata;

    const hash = (async () => {
      try {
        await this.#applySnapData(metadata, transaction, snapId);
        await this.#updateGasFees(metadata);
        await this.#updateGas(metadata, bundler);
        await this.#addPaymasterData(metadata, snapId);

        const resultCallbacks = await this.#approveUserOperation(metadata);

        await this.#signUserOperation(metadata, snapId);
        await this.#submitUserOperation(metadata, bundler);

        resultCallbacks?.success();

        return metadata.hash as string;
      } catch (error) {
        this.#failUserOperation(metadata, error);
        throw error;
      }
    })();

    const transactionHash = new Promise<string>((resolve, reject) => {
      this.#pendingTracker.hub.once(`${id}:confirmed`, (meta) => {
        resolve(meta.transactionHash as string);
      });

      this.#pendingTracker.hub.once(`${id}:failed`, (_metadata, error) => {
        reject(error);
      });
    });

    return {
      id,
      hash,
      transactionHash,
    };
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
      userFeeLevel: null,
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
      request: ({ method, params }) => provider.send(method, params),
    };

    const response = await sendSnapUserOperationRequest(snapId, {
      ethereum,
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
    });

    userOperation.callData = response.callData;
    userOperation.initCode = response.initCode;
    userOperation.nonce = response.nonce;
    userOperation.sender = response.sender;

    metadata.transactionParams = transaction as any;

    this.#updateMetadata(metadata);
  }

  async #updateGasFees(metadata: UserOperationMetadata) {
    await updateGasFees({
      getGasFeeEstimates: this.#getGasFeeEstimates,
      metadata,
      provider: new Web3Provider(this.#provider as any),
    });

    this.#updateMetadata(metadata);
  }

  async #updateGas(
    metadata: UserOperationMetadata,
    bundler: Bundler,
  ): Promise<void> {
    const { id, userOperation } = metadata;

    log('Updating gas', id);

    const paymasterAddress = process.env.PAYMASTER_ADDRESS;

    const encodedValidUntilAfter = stripHexPrefix(
      defaultAbiCoder.encode(['uint48', 'uint48'], [0, 0]),
    );

    const dummyPaymasterData = paymasterAddress
      ? `${paymasterAddress}${encodedValidUntilAfter}${stripHexPrefix(
          DUMMY_SIGNATURE,
        )}`
      : '0x';

    const payload = {
      ...userOperation,
      callGasLimit: '0x1',
      preVerificationGas: '0x1',
      verificationGasLimit: '0x1',
      signature: DUMMY_SIGNATURE,
      paymasterAndData: dummyPaymasterData,
    };

    log('Estimating gas', {
      paymasterAddress,
      encodedValidUntilAfter,
      dummySignature: payload.signature,
      dummyPaymasterData: payload.paymasterAndData,
    });

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

  async #addPaymasterData(metadata: UserOperationMetadata, snapId: string) {
    const { id, userOperation } = metadata;

    log('Requesting paymaster from snap', { id, snapId });

    const provider = new Web3Provider(this.#provider as any);

    const ethereum: SnapProvider = {
      request: ({ method, params }) => provider.send(method, params),
    };

    const response = await sendSnapPaymasterRequest(snapId, {
      ethereum,
      userOperation,
      privateKey: await this.#getPrivateKey(),
    });

    userOperation.paymasterAndData = response.paymasterAndData;

    this.#updateMetadata(metadata);
  }

  async #approveUserOperation(metadata: UserOperationMetadata) {
    const { resultCallbacks } = await this.#requestApproval(metadata);

    const transaction = this.#getTransactions().find(
      (tx) => tx.id === metadata.id,
    );

    const { userOperation } = metadata;

    if (
      transaction?.txParams.maxFeePerGas &&
      transaction?.txParams.maxPriorityFeePerGas &&
      userOperation.paymasterAndData === '0x'
    ) {
      userOperation.maxFeePerGas = transaction.txParams.maxFeePerGas;

      userOperation.maxPriorityFeePerGas =
        transaction.txParams.maxPriorityFeePerGas;

      log('Updated gas fees after approval', {
        maxFeePerGas: userOperation.maxFeePerGas,
        maxPriorityFeePerGas: userOperation.maxPriorityFeePerGas,
      });
    }

    metadata.status = UserOperationStatus.Approved;

    this.#updateMetadata(metadata);

    return resultCallbacks;
  }

  async #signUserOperation(metadata: UserOperationMetadata, snapId: string) {
    const { id, chainId, userOperation } = metadata;

    log('Signing user operation', id, userOperation);

    const { signature } = await sendSnapUserOperationSignatureRequest(snapId, {
      userOperation,
      chainId,
      privateKey: await this.#getPrivateKey(),
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
