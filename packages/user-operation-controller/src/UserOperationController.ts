import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import { TransactionParams } from '@metamask/transaction-controller';
import type { Patch } from 'immer';
import { Contract } from '@ethersproject/contracts';
import { AddressZero } from '@ethersproject/constants';
import SimpleAccountABI from './abi/SimpleAccount.json';
import {
  UnsignedUserOperation,
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

const ENTRYPOINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const BUNDLER_URL = 'https://api.blocknative.com/v1/goerli/bundler';

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
  getChainId: () => string;
  getPrivateKey: () => Promise<string>;
  messenger: UserOperationControllerMessenger;
  provider: ProviderProxy;
  state?: Partial<UserOperationControllerState>;
};

type BundlerGasEstimate = {
  preVerificationGas: number;
  verificationGasLimit: number;
  callGasLimit: number;
  verificationGas: number;
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

  #getChainId: () => string;

  #getPrivateKey: () => Promise<string>;

  #provider: ProviderProxy;

  /**
   * Construct a UserOperation controller.
   *
   * @param options - Controller options.
   * @param options.messenger - Restricted controller messenger for the user operation controller.
   * @param options.state - Initial state to set on the controller.
   * @param options.getChainId
   * @param options.getPrivateKey
   */
  constructor({
    blockTracker,
    getChainId,
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
    this.#getChainId = getChainId;
    this.#getPrivateKey = getPrivateKey;
    this.#provider = provider;

    const pendingTracker = new PendingUserOperationTracker({
      blockTracker: this.#blockTracker,
      bundlerQuery: this.#bundlerQuery.bind(this),
      getBlockByHash: (hash: string) =>
        new Web3Provider(this.#provider as any).getBlock(hash),
      getChainId: this.#getChainId.bind(this),
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

  async addUserOperationFromTransaction(transaction: TransactionParams) {
    const id = random();

    const metadata: UserOperationMetadata = {
      actualGasCost: null,
      actualGasUsed: null,
      baseFeePerGas: null,
      chainId: this.#getChainId(),
      error: null,
      hash: null,
      id,
      status: UserOperationStatus.Unapproved,
      time: Date.now(),
      transactionHash: null,
      transactionParams: transaction as Required<TransactionParams>,
      userOperation: null,
    };

    this.#updateMetadata(metadata);

    log('Added user operation', id);

    const unsignedUserOperation =
      await this.#generateUserOperationFromTransaction(transaction);

    metadata.userOperation = unsignedUserOperation;
    this.#updateMetadata(metadata);

    await this.#updateGasFields(unsignedUserOperation);
    this.#updateMetadata(metadata);

    const { resultCallbacks } = await this.requestApproval(metadata);

    const signature = await signUserOperation(
      unsignedUserOperation,
      ENTRYPOINT_ADDRESS,
      this.#getChainId(),
      await this.#getPrivateKey(),
    );

    const signedUserOperation = {
      ...unsignedUserOperation,
      signature,
    };

    metadata.status = UserOperationStatus.Signed;
    metadata.userOperation = signedUserOperation;
    this.#updateMetadata(metadata);

    log('Signed user operation', signature);

    const hash = await this.#submitUserOperation(signedUserOperation);

    metadata.hash = hash;
    metadata.status = UserOperationStatus.Submitted;
    this.#updateMetadata(metadata);

    resultCallbacks?.success();
  }

  async #generateUserOperationFromTransaction(
    transaction: TransactionParams,
  ): Promise<UnsignedUserOperation> {
    const smartContractWallet = new Contract(
      transaction.from,
      SimpleAccountABI,
      new Web3Provider(this.#provider as any),
    );

    const callData = smartContractWallet.interface.encodeFunctionData(
      'execute',
      [
        transaction.to ?? AddressZero,
        transaction.value,
        transaction.data ?? '0x',
      ],
    );

    const callGasLimit = '0x';
    const initCode = '0x';
    const maxFeePerGas = toHex(0.16e9);
    const maxPriorityFeePerGas = toHex(0.15e9);
    const nonce = (await smartContractWallet.getNonce()).toHexString();
    const paymasterAndData = '0x';
    const preVerificationGas = '0x';
    const sender = transaction.from;
    const verificationGasLimit = '0x';

    return {
      callData,
      callGasLimit,
      initCode,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
      paymasterAndData,
      preVerificationGas,
      sender,
      verificationGasLimit,
    };
  }

  async #updateGasFields(userOperation: UnsignedUserOperation): Promise<void> {
    const estimatedGas = await this.#estimateGas(userOperation);

    userOperation.preVerificationGas = toHex(estimatedGas.preVerificationGas);

    userOperation.verificationGasLimit = toHex(
      estimatedGas.verificationGasLimit,
    );

    userOperation.callGasLimit = toHex(estimatedGas.callGasLimit);
  }

  async #estimateGas(
    userOperation: UnsignedUserOperation,
  ): Promise<BundlerGasEstimate> {
    const payload = {
      ...userOperation,
      callGasLimit: '0x1',
      preVerificationGas: '0x1',
      verificationGasLimit: '0x1',
      signature: DUMMY_SIGNATURE,
    };

    const response = await this.#bundlerQuery('eth_estimateUserOperationGas', [
      payload,
      ENTRYPOINT_ADDRESS,
    ]);

    log('Estimated gas', response);

    return response as BundlerGasEstimate;
  }

  async #submitUserOperation(userOperation: UserOperation): Promise<string> {
    const hash = await this.#bundlerQuery('eth_sendUserOperation', [
      userOperation,
      ENTRYPOINT_ADDRESS,
    ]);

    log('Submitted user operation to bundler', hash);

    return hash;
  }

  async #bundlerQuery(method: string, params: any[]): Promise<any> {
    const request = {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    };

    const response = await fetch(BUNDLER_URL, request);
    const responseJson = await response.json();

    if (responseJson.error) {
      throw new Error(responseJson.error.message || responseJson.error);
    }

    return responseJson.result;
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
    const transactionMetadata = getTransactionMetadata(metadata);
    this.hub.emit('transaction-updated', transactionMetadata);
  }

  #getState(): UserOperationControllerState {
    return cloneDeep(this.state);
  }

  private async requestApproval(
    metadata: UserOperationMetadata,
  ): Promise<AddResult> {
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
