import type {
  AcceptResultCallbacks,
  AddApprovalRequest,
  AddResult,
} from '@metamask/approval-controller';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { ApprovalType } from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import type {
  KeyringControllerPrepareUserOperationAction,
  KeyringControllerPatchUserOperationAction,
  KeyringControllerSignUserOperationAction,
} from '@metamask/keyring-controller';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  Provider,
} from '@metamask/network-controller';
import { errorCodes } from '@metamask/rpc-errors';
import {
  determineTransactionType,
  type TransactionMeta,
  type TransactionParams,
  type TransactionType,
} from '@metamask/transaction-controller';
import { add0x } from '@metamask/utils';
// This package purposefully relies on Node's EventEmitter module.
// eslint-disable-next-line import/no-nodejs-modules
import EventEmitter from 'events';
import type { Patch } from 'immer';
import { cloneDeep } from 'lodash';
import { v1 as random } from 'uuid';

import { ADDRESS_ZERO, EMPTY_BYTES, VALUE_ZERO } from './constants';
import { Bundler } from './helpers/Bundler';
import { PendingUserOperationTracker } from './helpers/PendingUserOperationTracker';
import { SnapSmartContractAccount } from './helpers/SnapSmartContractAccount';
import { projectLogger as log } from './logger';
import type {
  SmartContractAccount,
  UserOperation,
  UserOperationMetadata,
} from './types';
import { UserOperationStatus } from './types';
import { updateGas } from './utils/gas';
import { updateGasFees } from './utils/gas-fees';
import { getTransactionMetadata } from './utils/transaction';
import {
  validateAddUserOperationOptions,
  validateAddUserOperationRequest,
  validatePrepareUserOperationResponse,
  validateSignUserOperationResponse,
  validateUpdateUserOperationResponse,
} from './utils/validation';

const controllerName = 'UserOperationController';

const stateMetadata = {
  userOperations: { persist: true, anonymous: false },
};

const getDefaultState = () => ({
  userOperations: {},
});

type Events = {
  'transaction-updated': [metadata: TransactionMeta];
  'user-operation-added': [metadata: UserOperationMetadata];
  'user-operation-confirmed': [metadata: UserOperationMetadata];
  'user-operation-failed': [metadata: UserOperationMetadata, error: Error];
  [key: `${string}:confirmed`]: [metadata: UserOperationMetadata];
  [key: `${string}:failed`]: [metadata: UserOperationMetadata, error: Error];
};

export type UserOperationControllerEventEmitter = EventEmitter & {
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  on<T extends keyof Events>(
    eventName: T,
    listener: (...args: Events[T]) => void,
  ): UserOperationControllerEventEmitter;

  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  once<T extends keyof Events>(
    eventName: T,
    listener: (...args: Events[T]) => void,
  ): UserOperationControllerEventEmitter;

  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
  | AddApprovalRequest
  | KeyringControllerPrepareUserOperationAction
  | KeyringControllerPatchUserOperationAction
  | KeyringControllerSignUserOperationAction;

export type UserOperationControllerEvents = UserOperationStateChange;

export type UserOperationControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  UserOperationControllerActions,
  UserOperationControllerEvents,
  UserOperationControllerActions['type'],
  UserOperationControllerEvents['type']
>;

export type UserOperationControllerOptions = {
  entrypoint: string;
  getGasFeeEstimates: () => Promise<GasFeeState>;
  interval?: number;
  messenger: UserOperationControllerMessenger;
  state?: Partial<UserOperationControllerState>;
};

export type AddUserOperationRequest = {
  data?: string;
  from: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  to?: string;
  value?: string;
};

export type AddUserOperationSwapOptions = {
  approvalTxId?: string;
  destinationTokenAddress?: string;
  destinationTokenAmount?: string;
  destinationTokenDecimals?: number;
  destinationTokenSymbol?: string;
  estimatedBaseFee?: string;
  sourceTokenAddress?: string;
  sourceTokenAmount?: string;
  sourceTokenDecimals?: number;
  sourceTokenSymbol?: string;
  swapAndSendRecipient?: string;
  swapMetaData?: Record<string, unknown>;
  swapTokenValue?: string;
};

export type AddUserOperationOptions = {
  networkClientId: string;
  origin: string;
  requireApproval?: boolean;
  smartContractAccount?: SmartContractAccount;
  swaps?: AddUserOperationSwapOptions;
  type?: TransactionType;
};

export type AddUserOperationResponse = {
  id: string;
  hash: () => Promise<string | undefined>;
  transactionHash: () => Promise<string | undefined>;
};

/**
 * All the objects related to a pending user operation in order to:
 * - Avoid duplicated effort to derive the same properties.
 * - Minimise duplicate arguments in private methods.
 */
type UserOperationCache = {
  chainId: string;
  metadata: UserOperationMetadata;
  options: AddUserOperationOptions & {
    smartContractAccount: SmartContractAccount;
  };
  provider: Provider;
  request: AddUserOperationRequest;
  transaction?: TransactionParams;
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

  #entrypoint: string;

  #getGasFeeEstimates: () => Promise<GasFeeState>;

  #pendingUserOperationTracker: PendingUserOperationTracker;

  /**
   * Construct a UserOperationController instance.
   *
   * @param options - Controller options.
   * @param options.entrypoint - Address of the entrypoint contract.
   * @param options.getGasFeeEstimates - Callback to get gas fee estimates.
   * @param options.messenger - Restricted controller messenger for the user operation controller.
   * @param options.state - Initial state to set on the controller.
   */
  constructor({
    entrypoint,
    getGasFeeEstimates,
    messenger,
    state,
  }: UserOperationControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state },
    });

    this.hub = new EventEmitter() as UserOperationControllerEventEmitter;

    this.#entrypoint = entrypoint;
    this.#getGasFeeEstimates = getGasFeeEstimates;

    this.#pendingUserOperationTracker = new PendingUserOperationTracker({
      getUserOperations: () =>
        cloneDeep(Object.values(this.state.userOperations)),
      messenger,
    });

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
   * @param options.networkClientId - ID of the network client used to query the chain.
   * @param options.origin - Origin of the user operation, such as the hostname of a dApp.
   * @param options.requireApproval - Whether to require user approval before submitting the user operation. Defaults to true.
   * @param options.smartContractAccount - Smart contract abstraction to provide the contract specific values such as call data and nonce. Defaults to the current snap account.
   * @param options.swaps - Swap metadata to record with the user operation.
   * @param options.type - Type of the transaction.
   */
  async addUserOperation(
    request: AddUserOperationRequest,
    options: AddUserOperationOptions,
  ): Promise<AddUserOperationResponse> {
    validateAddUserOperationRequest(request);
    validateAddUserOperationOptions(options);

    return await this.#addUserOperation(request, options);
  }

  /**
   * Create and submit a user operation equivalent to the provided transaction.
   *
   * @param transaction - Transaction to use as the basis for the user operation.
   * @param options - Configuration options when creating a user operation.
   * @param options.networkClientId - ID of the network client used to query the chain.
   * @param options.origin - Origin of the user operation, such as the hostname of a dApp.
   * @param options.requireApproval - Whether to require user approval before submitting the user operation. Defaults to true.
   * @param options.smartContractAccount - Smart contract abstraction to provide the contract specific values such as call data and nonce. Defaults to the current snap account.
   * @param options.swaps - Swap metadata to record with the user operation.
   * @param options.type - Type of the transaction.
   */
  async addUserOperationFromTransaction(
    transaction: TransactionParams,
    options: AddUserOperationOptions,
  ): Promise<AddUserOperationResponse> {
    validateAddUserOperationOptions(options);

    const { data, from, maxFeePerGas, maxPriorityFeePerGas, to, value } =
      transaction;

    const request: AddUserOperationRequest = {
      data: data === '' ? undefined : data,
      from,
      maxFeePerGas,
      maxPriorityFeePerGas,
      to,
      value,
    };

    validateAddUserOperationRequest(request);

    return await this.#addUserOperation(request, { ...options, transaction });
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

    const {
      networkClientId,
      origin,
      smartContractAccount: requestSmartContractAccount,
      swaps,
      transaction,
    } = options;

    const { chainId, provider } = await this.#getProvider(networkClientId);

    const metadata = await this.#createMetadata(
      chainId,
      origin,
      transaction,
      swaps,
    );

    const smartContractAccount =
      requestSmartContractAccount ??
      new SnapSmartContractAccount(this.messagingSystem);

    const cache: UserOperationCache = {
      chainId,
      metadata,
      options: { ...options, smartContractAccount },
      provider,
      request,
      transaction,
    };

    const { id } = metadata;
    let throwError = false;

    const hashValue = (async () => {
      try {
        return await this.#prepareAndSubmitUserOperation(cache);
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

  async #prepareAndSubmitUserOperation(cache: UserOperationCache) {
    const { metadata, options } = cache;
    const { requireApproval, smartContractAccount } = options;
    let resultCallbacks: AcceptResultCallbacks | undefined;

    try {
      await this.#prepareUserOperation(cache);
      await this.#addPaymasterData(metadata, smartContractAccount);

      this.hub.emit('user-operation-added', metadata);

      if (requireApproval !== false) {
        resultCallbacks = await this.#approveUserOperation(cache);
      }

      await this.#signUserOperation(metadata, smartContractAccount);
      await this.#submitUserOperation(metadata);

      resultCallbacks?.success();

      return metadata.hash as string;
    } catch (error) {
      /* istanbul ignore next */
      resultCallbacks?.error(error as Error);
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
    transaction?: TransactionParams,
    swaps?: AddUserOperationSwapOptions,
  ): Promise<UserOperationMetadata> {
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
      swapsMetadata: swaps
        ? {
            approvalTxId: swaps.approvalTxId ?? null,
            destinationTokenAddress: swaps.destinationTokenAddress ?? null,
            destinationTokenAmount: swaps.destinationTokenAmount ?? null,
            destinationTokenDecimals: swaps.destinationTokenDecimals ?? null,
            destinationTokenSymbol: swaps.destinationTokenSymbol ?? null,
            estimatedBaseFee: swaps.estimatedBaseFee ?? null,
            sourceTokenAddress: swaps.sourceTokenAddress ?? null,
            sourceTokenAmount: swaps.sourceTokenAmount ?? null,
            sourceTokenDecimals: swaps.sourceTokenDecimals ?? null,
            sourceTokenSymbol: swaps.sourceTokenSymbol ?? null,
            swapAndSendRecipient: swaps.swapAndSendRecipient ?? null,
            swapMetaData: (swaps.swapMetaData as Record<string, never>) ?? null,
            swapTokenValue: swaps.swapTokenValue ?? null,
          }
        : null,
      time: Date.now(),
      transactionHash: null,
      transactionParams: (transaction as Required<TransactionParams>) ?? null,
      transactionType: null,
      userFeeLevel: null,
      userOperation: this.#createEmptyUserOperation(transaction),
    };

    this.#updateMetadata(metadata);

    log('Added user operation', metadata.id);

    return metadata;
  }

  async #prepareUserOperation(cache: UserOperationCache) {
    const { chainId, metadata, options, provider, request, transaction } =
      cache;

    const { data, from, to, value } = request;
    const { id, transactionParams, userOperation } = metadata;
    const { smartContractAccount } = options;

    log('Preparing user operation', { id });

    const transactionType = await this.#getTransactionType(
      transaction,
      provider,
      options,
    );

    metadata.transactionType = transactionType ?? null;

    log('Determined transaction type', transactionType);

    await updateGasFees({
      getGasFeeEstimates: this.#getGasFeeEstimates,
      metadata,
      originalRequest: request,
      provider,
      transaction: transactionParams ?? undefined,
    });

    const response = await smartContractAccount.prepareUserOperation({
      chainId,
      data,
      from,
      to,
      value,
    });

    validatePrepareUserOperationResponse(response);

    const {
      bundler: bundlerUrl,
      callData,
      dummyPaymasterAndData,
      dummySignature,
      initCode,
      nonce,
      sender,
    } = response;

    userOperation.callData = callData;
    userOperation.initCode = initCode ?? EMPTY_BYTES;
    userOperation.nonce = nonce;
    userOperation.paymasterAndData = dummyPaymasterAndData ?? EMPTY_BYTES;
    userOperation.sender = sender;
    userOperation.signature = dummySignature ?? EMPTY_BYTES;

    metadata.bundlerUrl = bundlerUrl;

    await updateGas(metadata, response, this.#entrypoint);

    this.#updateMetadata(metadata);
  }

  async #addPaymasterData(
    metadata: UserOperationMetadata,
    smartContractAccount: SmartContractAccount,
  ) {
    const { id, userOperation, chainId } = metadata;

    log('Requesting paymaster data', { id });

    const response = await smartContractAccount.updateUserOperation({
      userOperation,
      chainId,
    });

    validateUpdateUserOperationResponse(response);

    userOperation.paymasterAndData = response.paymasterAndData ?? EMPTY_BYTES;
    if (response.callGasLimit) {
      userOperation.callGasLimit = response.callGasLimit;
    }
    if (response.preVerificationGas) {
      userOperation.preVerificationGas = response.preVerificationGas;
    }
    if (response.verificationGasLimit) {
      userOperation.verificationGasLimit = response.verificationGasLimit;
    }

    this.#updateMetadata(metadata);
  }

  async #approveUserOperation(cache: UserOperationCache) {
    log('Requesting approval');

    const { metadata } = cache;

    const { resultCallbacks, value } = await this.#requestApproval(metadata);
    const updatedTransaction = value?.txMeta;

    if (updatedTransaction) {
      await this.#updateUserOperationAfterApproval(cache, updatedTransaction);
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

    const hash = await bundler.sendUserOperation(
      userOperation,
      this.#entrypoint,
    );

    metadata.hash = hash;
    metadata.status = UserOperationStatus.Submitted;

    this.#updateMetadata(metadata);
  }

  #failUserOperation(metadata: UserOperationMetadata, error: unknown) {
    const { id } = metadata;
    const rawError = error as Record<string, string>;

    log('User operation failed', id, error);

    metadata.error = {
      name: rawError.name,
      message: rawError.message,
      stack: rawError.stack,
      code: rawError.code,
      rpc: rawError.value,
    };

    metadata.status = UserOperationStatus.Failed;

    this.#updateMetadata(metadata);

    if (
      String(rawError.code) === String(errorCodes.provider.userRejectedRequest)
    ) {
      this.#deleteMetadata(id);
    }
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

  #deleteMetadata(id: string) {
    this.update((state) => {
      delete state.userOperations[id];
    });
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
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        this.hub.emit(`${metadata.id}:confirmed`, metadata);
      },
    );

    this.#pendingUserOperationTracker.hub.on(
      'user-operation-failed',
      (metadata, error) => {
        this.hub.emit('user-operation-failed', metadata, error);
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
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

  async #requestApproval(metadata: UserOperationMetadata) {
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
    )) as AddResult & { value?: { txMeta?: TransactionMeta } };
  }

  async #getTransactionType(
    transaction: TransactionParams | undefined,
    provider: Provider,
    options: AddUserOperationOptions,
  ): Promise<TransactionType | undefined> {
    if (!transaction) {
      return undefined;
    }

    if (options.type) {
      return options.type;
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
    cache: UserOperationCache,
    updatedTransaction: TransactionMeta,
  ) {
    log('Found updated transaction in approval', { updatedTransaction });

    const { metadata, request } = cache;

    const { userOperation } = metadata;
    const usingPaymaster = userOperation.paymasterAndData !== EMPTY_BYTES;

    const updatedMaxFeePerGas = add0x(
      updatedTransaction.txParams.maxFeePerGas as string,
    );

    const updatedMaxPriorityFeePerGas = add0x(
      updatedTransaction.txParams.maxPriorityFeePerGas as string,
    );

    let regenerateUserOperation = false;
    const previousMaxFeePerGas = userOperation.maxFeePerGas;
    const previousMaxPriorityFeePerGas = userOperation.maxPriorityFeePerGas;

    const gasFeesUpdated =
      previousMaxFeePerGas !== updatedMaxFeePerGas ||
      previousMaxPriorityFeePerGas !== updatedMaxPriorityFeePerGas;

    /**
     * true when we detect {@link getTransactionMetadata} has set the gas fees to zero
     * because the userOperation has a paymaster. This should not be mistaken for gas
     * fees being updated during the approval process.
     */
    const areGasFeesZeroBecauseOfPaymaster =
      usingPaymaster &&
      updatedMaxFeePerGas === VALUE_ZERO &&
      updatedMaxPriorityFeePerGas === VALUE_ZERO;

    if (gasFeesUpdated && !areGasFeesZeroBecauseOfPaymaster) {
      log('Gas fees updated during approval', {
        previousMaxFeePerGas,
        previousMaxPriorityFeePerGas,
        updatedMaxFeePerGas,
        updatedMaxPriorityFeePerGas,
      });

      userOperation.maxFeePerGas = updatedMaxFeePerGas;
      userOperation.maxPriorityFeePerGas = updatedMaxPriorityFeePerGas;

      regenerateUserOperation = usingPaymaster;
    }

    const previousData = request.data ?? EMPTY_BYTES;
    const updatedData = updatedTransaction.txParams.data ?? EMPTY_BYTES;

    if (previousData !== updatedData) {
      log('Data updated during approval', { previousData, updatedData });
      regenerateUserOperation = true;
    }

    const previousValue = request.value ?? VALUE_ZERO;
    const updatedValue = updatedTransaction.txParams.value ?? VALUE_ZERO;

    if (previousValue !== updatedValue) {
      log('Value updated during approval', { previousValue, updatedValue });
      regenerateUserOperation = true;
    }

    if (regenerateUserOperation) {
      const updatedRequest = {
        ...request,
        data: updatedData,
        maxFeePerGas: updatedMaxFeePerGas,
        maxPriorityFeePerGas: updatedMaxPriorityFeePerGas,
        value: updatedValue,
      };

      await this.#regenerateUserOperation({
        ...cache,
        request: updatedRequest,
      });
    }
  }

  async #regenerateUserOperation(cache: UserOperationCache) {
    log(
      'Regenerating user operation as parameters were updated during approval',
    );

    const {
      options: { smartContractAccount },
      metadata,
    } = cache;

    await this.#prepareUserOperation(cache);
    await this.#addPaymasterData(metadata, smartContractAccount);

    log('Regenerated user operation', metadata.userOperation);
  }
}
