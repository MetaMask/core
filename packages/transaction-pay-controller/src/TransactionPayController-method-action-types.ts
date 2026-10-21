/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { TransactionPayController } from './TransactionPayController.js';

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
 * Returns additional transactions for the paymentOverride flow.
 *
 * Delegates to the client-supplied {@link GetPaymentOverrideDataCallback}.
 * Called during quote execution when `paymentOverride` is defined on the transaction.
 * Returns an empty array when no callback is configured.
 *
 * @param args - The arguments forwarded to the {@link GetPaymentOverrideDataCallback}.
 * @returns A promise resolving to the additional transactions array.
 */
export type TransactionPayControllerGetAmountDataAction = {
  type: `TransactionPayController:getAmountData`;
  handler: TransactionPayController['getAmountData'];
};

/**
 * Returns optional fiat execution configuration.
 *
 * This is intentionally not stored in controller state.
 *
 * @returns Fiat execution options, if configured.
 */
export type TransactionPayControllerGetFiatOptionsAction = {
  type: `TransactionPayController:getFiatOptions`;
  handler: TransactionPayController['getFiatOptions'];
};

export type TransactionPayControllerGetPaymentOverrideDataAction = {
  type: `TransactionPayController:getPaymentOverrideData`;
  handler: TransactionPayController['getPaymentOverrideData'];
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
 * Derives the Polymarket deposit-wallet address for an EOA via the
 * client-supplied callback.
 *
 * @param args - The arguments forwarded to {@link PolymarketCallbacks.getDepositWalletAddress}.
 * @returns A promise resolving to the deposit-wallet address.
 */
export type TransactionPayControllerPolymarketGetDepositWalletAddressAction = {
  type: `TransactionPayController:polymarketGetDepositWalletAddress`;
  handler: TransactionPayController['polymarketGetDepositWalletAddress'];
};

/**
 * Signs and broadcasts a Polymarket deposit-wallet batch via the
 * client-supplied callback.
 *
 * @param args - The arguments forwarded to {@link PolymarketCallbacks.submitDepositWalletBatch}.
 * @returns A promise resolving to the relayer-issued source hash.
 */
export type TransactionPayControllerPolymarketSubmitDepositWalletBatchAction = {
  type: `TransactionPayController:polymarketSubmitDepositWalletBatch`;
  handler: TransactionPayController['polymarketSubmitDepositWalletBatch'];
};

/**
 * Union of all TransactionPayController action types.
 */
export type TransactionPayControllerMethodActions =
  | TransactionPayControllerSetTransactionConfigAction
  | TransactionPayControllerUpdatePaymentTokenAction
  | TransactionPayControllerUpdateFiatPaymentAction
  | TransactionPayControllerGetDelegationTransactionAction
  | TransactionPayControllerGetAmountDataAction
  | TransactionPayControllerGetFiatOptionsAction
  | TransactionPayControllerGetPaymentOverrideDataAction
  | TransactionPayControllerGetStrategyAction
  | TransactionPayControllerPolymarketGetDepositWalletAddressAction
  | TransactionPayControllerPolymarketSubmitDepositWalletBatchAction;
