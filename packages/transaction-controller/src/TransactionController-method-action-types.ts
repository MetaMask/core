/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { TransactionController } from './TransactionController';

/**
 * Handle new method data request.
 *
 * @param fourBytePrefix - The method prefix.
 * @param networkClientId - The ID of the network client used to fetch the method data.
 * @returns The method data object corresponding to the given signature prefix.
 */
export type TransactionControllerHandleMethodDataAction = {
  type: `TransactionController:handleMethodData`;
  handler: TransactionController['handleMethodData'];
};

/**
 * Add a batch of transactions to be submitted after approval.
 *
 * @param request - Request object containing the transactions to add.
 * @returns Result object containing the generated batch ID.
 */
export type TransactionControllerAddTransactionBatchAction = {
  type: `TransactionController:addTransactionBatch`;
  handler: TransactionController['addTransactionBatch'];
};

/**
 * Determine which chains support atomic batch transactions with the given account address.
 *
 * @param request - Request object containing the account address and other parameters.
 * @returns  Result object containing the supported chains and related information.
 */
export type TransactionControllerIsAtomicBatchSupportedAction = {
  type: `TransactionController:isAtomicBatchSupported`;
  handler: TransactionController['isAtomicBatchSupported'];
};

/**
 * Add a new unapproved transaction to state. Parameters will be validated, a
 * unique transaction ID will be generated, and `gas` and `gasPrice` will be calculated
 * if not provided. A `<tx.id>:unapproved` hub event will be emitted once added.
 *
 * @param txParams - Standard parameters for an Ethereum transaction.
 * @param options - Additional options to control how the transaction is added.
 * @returns Object containing a promise resolving to the transaction hash if approved.
 */
export type TransactionControllerAddTransactionAction = {
  type: `TransactionController:addTransaction`;
  handler: TransactionController['addTransaction'];
};

/**
 * Starts polling for incoming transactions from the remote transaction source.
 */
export type TransactionControllerStartIncomingTransactionPollingAction = {
  type: `TransactionController:startIncomingTransactionPolling`;
  handler: TransactionController['startIncomingTransactionPolling'];
};

/**
 * Stops polling for incoming transactions from the remote transaction source.
 */
export type TransactionControllerStopIncomingTransactionPollingAction = {
  type: `TransactionController:stopIncomingTransactionPolling`;
  handler: TransactionController['stopIncomingTransactionPolling'];
};

/**
 * Update the incoming transactions by polling the remote transaction source.
 *
 * @param request - Request object.
 * @param request.tags - Additional tags to identify the source of the request.
 */
export type TransactionControllerUpdateIncomingTransactionsAction = {
  type: `TransactionController:updateIncomingTransactions`;
  handler: TransactionController['updateIncomingTransactions'];
};

/**
 * Attempts to cancel a transaction based on its ID by setting its status to "rejected"
 * and emitting a `<tx.id>:finished` hub event.
 *
 * @param transactionId - The ID of the transaction to cancel.
 * @param gasValues - The gas values to use for the cancellation transaction.
 * @param options - The options for the cancellation transaction.
 * @param options.actionId - Unique ID persisted on transaction metadata.
 * @param options.estimatedBaseFee - The estimated base fee of the transaction.
 */
export type TransactionControllerStopTransactionAction = {
  type: `TransactionController:stopTransaction`;
  handler: TransactionController['stopTransaction'];
};

/**
 * Attempts to speed up a transaction increasing transaction gasPrice by ten percent.
 *
 * @param transactionId - The ID of the transaction to speed up.
 * @param gasValues - The gas values to use for the speed up transaction.
 * @param options - The options for the speed up transaction.
 * @param options.actionId - Unique ID persisted on transaction metadata.
 * @param options.estimatedBaseFee - The estimated base fee of the transaction.
 */
export type TransactionControllerSpeedUpTransactionAction = {
  type: `TransactionController:speedUpTransaction`;
  handler: TransactionController['speedUpTransaction'];
};

/**
 * Estimates required gas for a given transaction.
 *
 * @param transaction - The transaction to estimate gas for.
 * @param networkClientId - The network client id to use for the estimate.
 * @param options - Additional options for the estimate.
 * @param options.ignoreDelegationSignatures - Ignore signature errors if submitting delegations to the DelegationManager.
 * @returns The gas and gas price.
 */
export type TransactionControllerEstimateGasAction = {
  type: `TransactionController:estimateGas`;
  handler: TransactionController['estimateGas'];
};

/**
 * Estimates required gas for a batch of transactions.
 *
 * @param request - Request object.
 * @param request.chainId - Chain ID of the transactions.
 * @param request.from - Address of the sender.
 * @param request.transactions - Array of transactions within a batch request.
 * @returns Object containing the gas limit.
 */
export type TransactionControllerEstimateGasBatchAction = {
  type: `TransactionController:estimateGasBatch`;
  handler: TransactionController['estimateGasBatch'];
};

/**
 * Estimates required gas for a given transaction and add additional gas buffer with the given multiplier.
 *
 * @param transaction - The transaction params to estimate gas for.
 * @param multiplier - The multiplier to use for the gas buffer.
 * @param networkClientId - The network client id to use for the estimate.
 * @returns The buffered estimated gas and whether the estimation failed.
 */
export type TransactionControllerEstimateGasBufferedAction = {
  type: `TransactionController:estimateGasBuffered`;
  handler: TransactionController['estimateGasBuffered'];
};

/**
 * Updates an existing transaction in state.
 *
 * @param transactionMeta - The new transaction to store in state.
 * @param note - A note or update reason to be logged.
 */
export type TransactionControllerUpdateTransactionAction = {
  type: `TransactionController:updateTransaction`;
  handler: TransactionController['updateTransaction'];
};

/**
 * Adds external provided transaction to state as confirmed transaction.
 *
 * @param transactionMeta - TransactionMeta to add transactions.
 * @param transactionReceipt - TransactionReceipt of the external transaction.
 * @param baseFeePerGas - Base fee per gas of the external transaction.
 */
export type TransactionControllerConfirmExternalTransactionAction = {
  type: `TransactionController:confirmExternalTransaction`;
  handler: TransactionController['confirmExternalTransaction'];
};

/**
 * Acquires a nonce lock for the given address on the specified network,
 * ensuring that nonces are assigned sequentially without conflicts.
 *
 * @param address - The account address for which to acquire the nonce lock.
 * @param networkClientId - The ID of the network client to use.
 * @returns A promise that resolves to a nonce lock containing the next nonce and a release function.
 */
export type TransactionControllerGetNonceLockAction = {
  type: `TransactionController:getNonceLock`;
  handler: TransactionController['getNonceLock'];
};

/**
 * Updates the editable parameters of a transaction.
 *
 * @param txId - The ID of the transaction to update.
 * @param params - The editable parameters to update.
 * @param params.containerTypes - Container types applied to the parameters.
 * @param params.data - Data to pass with the transaction.
 * @param params.from - Address to send the transaction from.
 * @param params.gas - Maximum number of units of gas to use for the transaction.
 * @param params.gasPrice - Price per gas for legacy transactions.
 * @param params.maxFeePerGas - Maximum amount per gas to pay for the transaction, including the priority fee.
 * @param params.maxPriorityFeePerGas - Maximum amount per gas to give to validator as incentive.
 * @param params.updateType - Whether to update the transaction type. Defaults to `true`.
 * @param params.to - Address to send the transaction to.
 * @param params.value - Value associated with the transaction.
 * @returns The updated transaction metadata.
 */
export type TransactionControllerUpdateEditableParamsAction = {
  type: `TransactionController:updateEditableParams`;
  handler: TransactionController['updateEditableParams'];
};

/**
 * Update the isActive state of a transaction.
 *
 * @param transactionId - The ID of the transaction to update.
 * @param isActive - The active state.
 */
export type TransactionControllerSetTransactionActiveAction = {
  type: `TransactionController:setTransactionActive`;
  handler: TransactionController['setTransactionActive'];
};

/**
 * Signs and returns the raw transaction data for provided transaction params list.
 *
 * @param listOfTxParams - The list of transaction params to approve.
 * @param opts - Options bag.
 * @param opts.hasNonce - Whether the transactions already have a nonce.
 * @returns The raw transactions.
 */
export type TransactionControllerApproveTransactionsWithSameNonceAction = {
  type: `TransactionController:approveTransactionsWithSameNonce`;
  handler: TransactionController['approveTransactionsWithSameNonce'];
};

/**
 * Update a custodial transaction.
 *
 * @param request - The custodial transaction update request.
 *
 * @returns The updated transaction metadata.
 */
export type TransactionControllerUpdateCustodialTransactionAction = {
  type: `TransactionController:updateCustodialTransaction`;
  handler: TransactionController['updateCustodialTransaction'];
};

/**
 * Search transaction metadata for matching entries.
 *
 * @param opts - Options bag.
 * @param opts.initialList - The transactions to search. Defaults to the current state.
 * @param opts.limit - The maximum number of transactions to return. No limit by default.
 * @param opts.searchCriteria - An object containing values or functions for transaction properties to filter transactions with.
 * @returns An array of transactions matching the provided options.
 */
export type TransactionControllerGetTransactionsAction = {
  type: `TransactionController:getTransactions`;
  handler: TransactionController['getTransactions'];
};

/**
 * Estimates the gas fees for a transaction.
 *
 * @param args - The arguments for estimating gas fees.
 * @param args.transactionParams - The transaction parameters to estimate fees for.
 * @param args.chainId - The chain ID to use. If not provided, the network client ID is used to determine the chain.
 * @param args.networkClientId - The network client ID to use for the estimation.
 * @returns A promise that resolves to the estimated gas fee response.
 */
export type TransactionControllerEstimateGasFeeAction = {
  type: `TransactionController:estimateGasFee`;
  handler: TransactionController['estimateGasFee'];
};

/**
 * Determine the layer 1 gas fee for the given transaction parameters.
 *
 * @param request - The request object.
 * @param request.transactionParams - The transaction parameters to estimate the layer 1 gas fee for.
 * @param request.chainId - The ID of the chain where the transaction will be executed.
 * @param request.networkClientId - The ID of a specific network client to process the transaction.
 * @returns The layer 1 gas fee.
 */
export type TransactionControllerGetLayer1GasFeeAction = {
  type: `TransactionController:getLayer1GasFee`;
  handler: TransactionController['getLayer1GasFee'];
};

/**
 * Removes unapproved transactions from state.
 */
export type TransactionControllerClearUnapprovedTransactionsAction = {
  type: `TransactionController:clearUnapprovedTransactions`;
  handler: TransactionController['clearUnapprovedTransactions'];
};

/**
 * Stop the signing process for a specific transaction.
 * Throws an error causing the transaction status to be set to failed.
 *
 * @param transactionId - The ID of the transaction to stop signing.
 */
export type TransactionControllerAbortTransactionSigningAction = {
  type: `TransactionController:abortTransactionSigning`;
  handler: TransactionController['abortTransactionSigning'];
};

/**
 * Update the transaction data of a single nested transaction within an atomic batch transaction.
 *
 * @param options - The options bag.
 * @param options.transactionId - ID of the atomic batch transaction.
 * @param options.transactionIndex - Index of the nested transaction within the atomic batch transaction.
 * @param options.transactionData - New data to set for the nested transaction.
 * @returns The updated data for the atomic batch transaction.
 */
export type TransactionControllerUpdateAtomicBatchDataAction = {
  type: `TransactionController:updateAtomicBatchData`;
  handler: TransactionController['updateAtomicBatchData'];
};

/**
 * Emulate a new transaction.
 *
 * @param transactionId - The transaction ID.
 */
export type TransactionControllerEmulateNewTransactionAction = {
  type: `TransactionController:emulateNewTransaction`;
  handler: TransactionController['emulateNewTransaction'];
};

/**
 * Emulate a transaction update.
 *
 * @param transactionMeta - Transaction metadata.
 */
export type TransactionControllerEmulateTransactionUpdateAction = {
  type: `TransactionController:emulateTransactionUpdate`;
  handler: TransactionController['emulateTransactionUpdate'];
};

/**
 * Retrieve available gas fee tokens for a transaction.
 *
 * @param request - The request object containing transaction details.
 * @returns The list of available gas fee tokens.
 */
export type TransactionControllerGetGasFeeTokensAction = {
  type: `TransactionController:getGasFeeTokens`;
  handler: TransactionController['getGasFeeTokens'];
};

/**
 * Union of all TransactionController action types.
 */
export type TransactionControllerMethodActions =
  | TransactionControllerHandleMethodDataAction
  | TransactionControllerAddTransactionBatchAction
  | TransactionControllerIsAtomicBatchSupportedAction
  | TransactionControllerAddTransactionAction
  | TransactionControllerStartIncomingTransactionPollingAction
  | TransactionControllerStopIncomingTransactionPollingAction
  | TransactionControllerUpdateIncomingTransactionsAction
  | TransactionControllerStopTransactionAction
  | TransactionControllerSpeedUpTransactionAction
  | TransactionControllerEstimateGasAction
  | TransactionControllerEstimateGasBatchAction
  | TransactionControllerEstimateGasBufferedAction
  | TransactionControllerUpdateTransactionAction
  | TransactionControllerConfirmExternalTransactionAction
  | TransactionControllerGetNonceLockAction
  | TransactionControllerUpdateEditableParamsAction
  | TransactionControllerSetTransactionActiveAction
  | TransactionControllerApproveTransactionsWithSameNonceAction
  | TransactionControllerUpdateCustodialTransactionAction
  | TransactionControllerGetTransactionsAction
  | TransactionControllerEstimateGasFeeAction
  | TransactionControllerGetLayer1GasFeeAction
  | TransactionControllerClearUnapprovedTransactionsAction
  | TransactionControllerAbortTransactionSigningAction
  | TransactionControllerUpdateAtomicBatchDataAction
  | TransactionControllerEmulateNewTransactionAction
  | TransactionControllerEmulateTransactionUpdateAction
  | TransactionControllerGetGasFeeTokensAction;
