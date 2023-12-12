import type {
  AcceptResultCallbacks,
  AddApprovalRequest,
  AddResult,
} from '@metamask/approval-controller';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { ApprovalType, hexToBN } from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  Provider,
} from '@metamask/network-controller';
import {
  determineTransactionType,
  type TransactionMeta,
  type TransactionParams,
  type TransactionType,
} from '@metamask/transaction-controller';
import { BN, addHexPrefix } from 'ethereumjs-util';
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
import { getTransactionMetadata } from './utils/transaction';
import {
  validateAddUserOperationOptions,
  validateAddUserOperationRequest,
  validatePrepareUserOperationResponse,
  validateSignUserOperationResponse,
  validateUpdateUserOperationResponse,
} from './utils/validation';

const GAS_ESTIMATE_MULTIPLIER = 1.5;
const DEFAULT_INTERVAL = 10 * 1000; // 10 Seconds

const controllerName = 'UserOperationController';

const stateMetadata = {
  userOperations: { persist: true, anonymous: false },
};

const getDefaultState = () => ({
  userOperations: {},
});

type Events = {
  'transaction-updated': [metadata: TransactionMeta];
  'user-operation-confirmed': [metadata: UserOperationMetadata];
  'user-operation-failed': [metadata: UserOperationMetadata, error: Error];
  [key: `${string}:confirmed`]: [metadata: UserOperationMetadata];
  [key: `${string}:failed`]: [metadata: UserOperationMetadata, error: Error];
};

export type UserOperationControllerEventEmitter = EventEmitter & {
  on<T extends keyof Events>(
    eventName: T,
    listener: (...args: Events[T]) => void,
  ): UserOperationControllerEventEmitter;

  once<T extends keyof Events>(
    eventName: T,
    listener: (...args: Events[T]) => void,
  ): UserOperationControllerEventEmitter;

  emit<T extends keyof Events>(eventName: T, ...args: Events[T]): boolean;
};

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
  | NetworkControllerGetNetworkClientByIdAction
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
  interval?: number;
  messenger: UserOperationControllerMessenger;
  state?: Partial<UserOperationControllerState>;
};

export type AddUserOperationRequest = {
  data?: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  to?: string;
  value?: string;
};

export type AddUserOperationOptions = {
  networkClientId: string;
  origin: string;
  requireApproval?: boolean;
  smartContractAccount: SmartContractAccount;
  transaction?: TransactionParams;
};

export type AddUserOperationResponse = {
  id: string;
  hash: () => Promise<string | undefined>;
  transactionHash: () => Promise<string | undefined>;
};

/**
 * Controller for creating and managing the life cycle of user operations.
 */
export class UserOperationController extends BaseController<
  typeof controllerName,
  UserOperationControllerState,
  UserOperationControllerMessenger
> {
  hub: UserOperationControllerEventEmitter;

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

    this.hub = new EventEmitter() as UserOperationControllerEventEmitter;

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
    request: AddUserOperationRequest,
    options: AddUserOperationOptions,
  ): Promise<AddUserOperationResponse> {
    validateAddUserOperationRequest(request);
    validateAddUserOperationOptions(options);

    return await this.#addUserOperation(request, options);
  }

  async addUserOperationFromTransaction(
    transaction: TransactionParams,
    options: AddUserOperationOptions,
  ): Promise<AddUserOperationResponse> {
    validateAddUserOperationOptions(options);

    const { data, maxFeePerGas, maxPriorityFeePerGas, to, value } = transaction;

    return await this.#addUserOperation(
      {
        data: data === '' ? undefined : data,
        maxFeePerGas,
        maxPriorityFeePerGas,
        to,
        value,
      } as any,
      { ...options, transaction },
    );
  }

  startPollingByNetworkClientId(networkClientId: string): string {
    return this.#pendingUserOperationTracker.startPollingByNetworkClientId(
      networkClientId,
    );
  }

  async #addUserOperation(
    request: AddUserOperationRequest,
    options: AddUserOperationOptions & { transaction?: TransactionParams },
  ): Promise<AddUserOperationResponse> {
    log('Adding user operation', { request, options });

    const { networkClientId, origin, transaction } = options;
    const { chainId, provider } = await this.#getProvider(networkClientId);

    const metadata = await this.#createMetadata(
      chainId,
      origin,
      provider,
      transaction,
    );

    const { id } = metadata;
    let throwError = false;

    const hashValue = (async () => {
      try {
        return await this.#prepareAndSubmitUserOperation(
          metadata,
          request,
          options,
          { chainId },
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

      return finalTransactionHash as string;
    };

    return {
      id,
      hash,
      transactionHash,
    };
  }

  async #prepareAndSubmitUserOperation(
    metadata: UserOperationMetadata,
    request: AddUserOperationRequest,
    options: AddUserOperationOptions,
    { chainId }: { chainId: string },
  ) {
    const { maxFeePerGas, maxPriorityFeePerGas } = request;
    const { requireApproval, smartContractAccount } = options;
    let resultCallbacks: AcceptResultCallbacks | undefined;

    try {
      await this.#prepareUserOperation(
        request,
        metadata,
        smartContractAccount,
        chainId,
      );

      metadata.userOperation.maxFeePerGas = maxFeePerGas;
      metadata.userOperation.maxPriorityFeePerGas = maxPriorityFeePerGas;

      await this.#updateGas(metadata);
      await this.#addPaymasterData(metadata, smartContractAccount);

      if (requireApproval !== false) {
        resultCallbacks = await this.#approveUserOperation(
          metadata,
          request,
          options,
        );
      }

      await this.#signUserOperation(metadata, smartContractAccount);
      await this.#submitUserOperation(metadata);

      resultCallbacks?.success();

      return metadata.hash as string;
    } catch (error: any) {
      /* istanbul ignore next */
      resultCallbacks?.error(error);
      throw error;
    }
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

  async #createMetadata(
    chainId: string,
    origin: string,
    provider: Provider,
    transaction?: TransactionParams,
  ): Promise<UserOperationMetadata> {
    const transactionType = await this.#getTransactionType(
      transaction,
      provider,
    );

    log('Determined transaction type', transactionType);

    const metadata: UserOperationMetadata = {
      actualGasCost: null,
      actualGasUsed: null,
      baseFeePerGas: null,
      bundlerUrl: null,
      chainId,
      error: null,
      hash: null,
      id: random(),
      origin,
      status: UserOperationStatus.Unapproved,
      time: Date.now(),
      transactionHash: null,
      transactionParams: (transaction as Required<TransactionParams>) ?? null,
      transactionType: transactionType ?? null,
      userOperation: this.#createEmptyUserOperation(transaction),
    };

    this.#updateMetadata(metadata);

    log('Added user operation', metadata.id);

    return metadata;
  }

  async #prepareUserOperation(
    request: AddUserOperationRequest,
    metadata: UserOperationMetadata,
    smartContractAccount: SmartContractAccount,
    chainId: string,
  ) {
    const { data, to, value } = request;
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

  async #updateGas(metadata: UserOperationMetadata): Promise<void> {
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

    const bundler = new Bundler(metadata.bundlerUrl as string);

    const { preVerificationGas, verificationGas, callGasLimit } =
      await bundler.estimateUserOperationGas(payload, ENTRYPOINT);

    userOperation.callGasLimit = this.#normalizeGasEstimate(callGasLimit);
    userOperation.preVerificationGas =
      this.#normalizeGasEstimate(preVerificationGas);
    userOperation.verificationGasLimit =
      this.#normalizeGasEstimate(verificationGas);

    this.#updateMetadata(metadata);
  }

  #normalizeGasEstimate(rawValue: string | number) {
    const value =
      typeof rawValue === 'string' ? hexToBN(rawValue) : new BN(rawValue);

    const bufferedValue = value.muln(GAS_ESTIMATE_MULTIPLIER);

    return addHexPrefix(bufferedValue.toString(16));
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

  async #approveUserOperation(
    metadata: UserOperationMetadata,
    request: AddUserOperationRequest,
    options: AddUserOperationOptions,
  ) {
    log('Requesting approval');

    const { resultCallbacks, value } = await this.#requestApproval(metadata);

    const updatedTransaction = (value as any)?.txMeta as
      | TransactionMeta
      | undefined;

    if (updatedTransaction) {
      await this.#updateUserOperationAfterApproval(
        metadata,
        request,
        options,
        updatedTransaction,
      );
    }

    metadata.status = UserOperationStatus.Approved;

    this.#updateMetadata(metadata);

    return resultCallbacks;
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

  async #submitUserOperation(metadata: UserOperationMetadata) {
    const { userOperation } = metadata;

    log('Submitting user operation', userOperation);

    const bundler = new Bundler(metadata.bundlerUrl as string);
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

  #createEmptyUserOperation(transaction?: TransactionParams): UserOperation {
    return {
      callData: EMPTY_BYTES,
      callGasLimit: EMPTY_BYTES,
      initCode: EMPTY_BYTES,
      maxFeePerGas: transaction?.maxFeePerGas ?? EMPTY_BYTES,
      maxPriorityFeePerGas: transaction?.maxPriorityFeePerGas ?? EMPTY_BYTES,
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

    this.#updateTransaction(metadata);
  }

  #updateTransaction(metadata: UserOperationMetadata) {
    if (!metadata.transactionParams) {
      return;
    }

    const transactionMetadata = getTransactionMetadata(metadata);

    this.hub.emit('transaction-updated', transactionMetadata);
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

  async #requestApproval(metadata: UserOperationMetadata): Promise<AddResult> {
    const { id, origin } = metadata;
    const type = ApprovalType.Transaction;
    const requestData = { txId: id };

    return (await this.messagingSystem.call(
      'ApprovalController:addRequest',
      {
        id,
        origin,
        type,
        requestData,
        expectsResult: true,
      },
      true, // Should display approval request to user
    )) as Promise<AddResult>;
  }

  async #getTransactionType(
    transaction: TransactionParams | undefined,
    provider: Provider,
  ): Promise<TransactionType | undefined> {
    if (!transaction) {
      return undefined;
    }

    const ethQuery = new EthQuery(provider);
    const result = determineTransactionType(transaction, ethQuery);

    return (await result).type;
  }

  async #getProvider(
    networkClientId: string,
  ): Promise<{ provider: Provider; chainId: string }> {
    const { provider, configuration } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );

    const { chainId } = configuration;

    return { provider, chainId };
  }

  async #updateUserOperationAfterApproval(
    metadata: UserOperationMetadata,
    request: AddUserOperationRequest,
    options: AddUserOperationOptions,
    updatedTransaction: TransactionMeta,
  ) {
    log('Found updated transaction in approval', { updatedTransaction });

    const { userOperation } = metadata;
    const usingPaymaster = userOperation.paymasterAndData !== EMPTY_BYTES;

    const updatedMaxFeePerGas = addHexPrefix(
      updatedTransaction.txParams.maxFeePerGas as string,
    );

    const updatedMaxPriorityFeePerGas = addHexPrefix(
      updatedTransaction.txParams.maxPriorityFeePerGas as string,
    );

    let refreshUserOperation = false;
    const previousMaxFeePerGas = userOperation.maxFeePerGas;
    const previousMaxPriorityFeePerGas = userOperation.maxPriorityFeePerGas;

    if (
      previousMaxFeePerGas !== updatedMaxFeePerGas ||
      previousMaxPriorityFeePerGas !== updatedMaxPriorityFeePerGas
    ) {
      log('Gas fees updated during approval', {
        previousMaxFeePerGas,
        previousMaxPriorityFeePerGas,
        updatedMaxFeePerGas,
        updatedMaxPriorityFeePerGas,
      });

      userOperation.maxFeePerGas = updatedMaxFeePerGas;
      userOperation.maxPriorityFeePerGas = updatedMaxPriorityFeePerGas;

      refreshUserOperation = usingPaymaster;
    }

    const previousData = request.data ?? EMPTY_BYTES;
    const updatedData = updatedTransaction.txParams.data ?? EMPTY_BYTES;

    if (previousData !== updatedData) {
      log('Data updated during approval', { previousData, updatedData });
      refreshUserOperation = true;
    }

    const previousValue = request.value ?? '0x0';
    const updatedValue = updatedTransaction.txParams.value ?? '0x0';

    if (previousValue !== updatedValue) {
      log('Value updated during approval', { previousValue, updatedValue });
      refreshUserOperation = true;
    }

    if (refreshUserOperation) {
      const updatedRequest = {
        ...request,
        data: updatedData,
        maxFeePerGas: updatedMaxFeePerGas,
        maxPriorityFeePerGas: updatedMaxPriorityFeePerGas,
        value: updatedValue,
      };

      await this.#regenerateUserOperation(metadata, updatedRequest, options);
    }
  }

  async #regenerateUserOperation(
    metadata: UserOperationMetadata,
    updatedRequest: AddUserOperationRequest,
    options: AddUserOperationOptions,
  ) {
    log(
      'Regenerating user operation as parameters were updated during approval',
    );

    const { chainId } = metadata;
    const { smartContractAccount } = options;

    await this.#prepareUserOperation(
      updatedRequest,
      metadata,
      smartContractAccount,
      chainId,
    );

    await this.#updateGas(metadata);
    await this.#addPaymasterData(metadata, smartContractAccount);

    log('Regenerated user operation', metadata.userOperation);
  }
}
