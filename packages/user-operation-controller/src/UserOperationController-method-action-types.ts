/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { UserOperationController } from './UserOperationController';

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
export type UserOperationControllerAddUserOperationAction = {
  type: `UserOperationController:addUserOperation`;
  handler: UserOperationController['addUserOperation'];
};

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
export type UserOperationControllerAddUserOperationFromTransactionAction = {
  type: `UserOperationController:addUserOperationFromTransaction`;
  handler: UserOperationController['addUserOperationFromTransaction'];
};

/**
 * Starts polling for pending user operations on the given network.
 *
 * @param networkClientId - The ID of the network client to poll.
 * @returns The polling token that can be used to stop polling.
 */
export type UserOperationControllerStartPollingByNetworkClientIdAction = {
  type: `UserOperationController:startPollingByNetworkClientId`;
  handler: UserOperationController['startPollingByNetworkClientId'];
};

/**
 * Union of all UserOperationController action types.
 */
export type UserOperationControllerMethodActions =
  | UserOperationControllerAddUserOperationAction
  | UserOperationControllerAddUserOperationFromTransactionAction
  | UserOperationControllerStartPollingByNetworkClientIdAction;
