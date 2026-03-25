/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { TransactionPayController } from './TransactionPayController';

/**
 * Sets the transaction configuration.
 *
 * The callback receives the current configuration properties and can mutate
 * them in place. Updated values are written back to the transaction data.
 *
 * @param transactionId - The ID of the transaction to configure.
 * @param callback - A callback that receives a mutable {@link TransactionConfig} object.
 */
export type TransactionPayControllerSetTransactionConfigAction = {
  type: `TransactionPayController:setTransactionConfig`;
  handler: TransactionPayController['setTransactionConfig'];
};

/**
 * Updates the payment token for a transaction.
 *
 * Resolves token metadata and balances, then stores the new payment token
 * in the transaction data. This triggers recalculation of source amounts
 * and quote retrieval.
 *
 * @param request - The payment token update request containing the
 * transaction ID, token address, and chain ID.
 */
export type TransactionPayControllerUpdatePaymentTokenAction = {
  type: `TransactionPayController:updatePaymentToken`;
  handler: TransactionPayController['updatePaymentToken'];
};

/**
 * Updates the fiat payment state for a transaction.
 *
 * The request callback receives the current fiat payment state and can
 * mutate it to update properties such as the selected payment method or
 * fiat amount.
 *
 * @param request - The fiat payment update request containing the
 * transaction ID and a callback to mutate fiat payment state.
 */
export type TransactionPayControllerUpdateFiatPaymentAction = {
  type: `TransactionPayController:updateFiatPayment`;
  handler: TransactionPayController['updateFiatPayment'];
};

/**
 * Gets the delegation transaction for a given transaction.
 *
 * Converts the provided transaction into a redeem delegation by delegating
 * to the configured callback. Returns the delegation transaction data
 * including the encoded call data, target address, value, and an optional
 * authorization list.
 *
 * @param args - The arguments forwarded to the {@link GetDelegationTransactionCallback},
 * containing the transaction metadata.
 * @returns A promise resolving to the delegation transaction data.
 */
export type TransactionPayControllerGetDelegationTransactionAction = {
  type: `TransactionPayController:getDelegationTransaction`;
  handler: TransactionPayController['getDelegationTransaction'];
};

/**
 * Gets the preferred strategy for a transaction.
 *
 * Returns the first strategy from the ordered list of strategies applicable
 * to the given transaction. Falls back to the default strategy order derived
 * from feature flags when no custom strategy callback is configured.
 *
 * @param transaction - The transaction metadata to determine the strategy for.
 * @returns The preferred {@link TransactionPayStrategy} for the transaction.
 */
export type TransactionPayControllerGetStrategyAction = {
  type: `TransactionPayController:getStrategy`;
  handler: TransactionPayController['getStrategy'];
};

/**
 * Union of all TransactionPayController action types.
 */
export type TransactionPayControllerMethodActions =
  | TransactionPayControllerSetTransactionConfigAction
  | TransactionPayControllerUpdatePaymentTokenAction
  | TransactionPayControllerUpdateFiatPaymentAction
  | TransactionPayControllerGetDelegationTransactionAction
  | TransactionPayControllerGetStrategyAction;
