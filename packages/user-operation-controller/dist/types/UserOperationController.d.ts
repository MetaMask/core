/// <reference types="node" />
import type { AddApprovalRequest } from '@metamask/approval-controller';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import type { KeyringControllerPrepareUserOperationAction, KeyringControllerPatchUserOperationAction, KeyringControllerSignUserOperationAction } from '@metamask/keyring-controller';
import type { NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import { type TransactionMeta, type TransactionParams, type TransactionType } from '@metamask/transaction-controller';
import EventEmitter from 'events';
import type { Patch } from 'immer';
import type { SmartContractAccount, UserOperationMetadata } from './types';
declare const controllerName = "UserOperationController";
type Events = {
    'transaction-updated': [metadata: TransactionMeta];
    'user-operation-added': [metadata: UserOperationMetadata];
    'user-operation-confirmed': [metadata: UserOperationMetadata];
    'user-operation-failed': [metadata: UserOperationMetadata, error: Error];
    [key: `${string}:confirmed`]: [metadata: UserOperationMetadata];
    [key: `${string}:failed`]: [metadata: UserOperationMetadata, error: Error];
};
export type UserOperationControllerEventEmitter = EventEmitter & {
    on<T extends keyof Events>(eventName: T, listener: (...args: Events[T]) => void): UserOperationControllerEventEmitter;
    once<T extends keyof Events>(eventName: T, listener: (...args: Events[T]) => void): UserOperationControllerEventEmitter;
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
export type UserOperationControllerActions = GetUserOperationState | NetworkControllerGetNetworkClientByIdAction | AddApprovalRequest | KeyringControllerPrepareUserOperationAction | KeyringControllerPatchUserOperationAction | KeyringControllerSignUserOperationAction;
export type UserOperationControllerEvents = UserOperationStateChange;
export type UserOperationControllerMessenger = RestrictedControllerMessenger<typeof controllerName, UserOperationControllerActions, UserOperationControllerEvents, UserOperationControllerActions['type'], UserOperationControllerEvents['type']>;
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
 * Controller for creating and managing the life cycle of user operations.
 */
export declare class UserOperationController extends BaseController<typeof controllerName, UserOperationControllerState, UserOperationControllerMessenger> {
    #private;
    hub: UserOperationControllerEventEmitter;
    /**
     * Construct a UserOperationController instance.
     *
     * @param options - Controller options.
     * @param options.entrypoint - Address of the entrypoint contract.
     * @param options.getGasFeeEstimates - Callback to get gas fee estimates.
     * @param options.messenger - Restricted controller messenger for the user operation controller.
     * @param options.state - Initial state to set on the controller.
     */
    constructor({ entrypoint, getGasFeeEstimates, messenger, state, }: UserOperationControllerOptions);
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
    addUserOperation(request: AddUserOperationRequest, options: AddUserOperationOptions): Promise<AddUserOperationResponse>;
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
    addUserOperationFromTransaction(transaction: TransactionParams, options: AddUserOperationOptions): Promise<AddUserOperationResponse>;
    startPollingByNetworkClientId(networkClientId: string): string;
}
export {};
//# sourceMappingURL=UserOperationController.d.ts.map