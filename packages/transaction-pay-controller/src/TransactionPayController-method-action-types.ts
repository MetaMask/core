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

/**
 * Returns the Infura project ID used to resolve `{infuraProjectId}`
 * placeholders in RPC URLs.
 *
 * @returns The Infura project ID, if configured.
 */
export type TransactionPayControllerGetInfuraProjectIdAction = {
  type: `TransactionPayController:getInfuraProjectId`;
  handler: TransactionPayController['getInfuraProjectId'];
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
 * Observes a Solana Pay execution through Relay status and finalizes the
 * externally published target transaction once the outcome is terminal.
 * While Relay has not observed the source transaction, its on-chain status
 * is read once from the Solana RPC to detect a failed or expired source.
 * Once Relay delivered the funds of a Money Account deposit, the non-atomic
 * second leg runs once, guarded by the follow-up checkpoint.
 *
 * This method never signs or broadcasts the Solana source transaction, and
 * never notifies Relay.
 *
 * @param transactionId - Target transaction ID.
 * @returns The latest observed status.
 */
export type TransactionPayControllerReconcileSolanaPayAction = {
  type: `TransactionPayController:reconcileSolanaPay`;
  handler: TransactionPayController['reconcileSolanaPay'];
};

/**
 * Observes every persisted Solana Pay execution that is not terminal once,
 * independently of each other. Clients call it again on foreground or
 * startup to keep observing.
 *
 * This method never signs, broadcasts, or notifies Relay.
 *
 * @returns Latest statuses keyed by target transaction ID, omitting
 * executions whose observation failed.
 */
export type TransactionPayControllerRecoverSolanaPayStatusAction = {
  type: `TransactionPayController:recoverSolanaPayStatus`;
  handler: TransactionPayController['recoverSolanaPayStatus'];
};

/**
 * Returns the privacy-safe support diagnostics of a Solana Pay execution.
 *
 * The diagnostics only carry categorical values and identifier-presence
 * flags, never accounts, assets, amounts, identifiers or failure text.
 *
 * @param transactionId - Target transaction ID.
 * @returns Categorical diagnostics of the persisted execution checkpoint.
 */
export type TransactionPayControllerGetSolanaPaySupportDiagnosticsAction = {
  type: `TransactionPayController:getSolanaPaySupportDiagnostics`;
  handler: TransactionPayController['getSolanaPaySupportDiagnostics'];
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
  | TransactionPayControllerGetInfuraProjectIdAction
  | TransactionPayControllerGetPaymentOverrideDataAction
  | TransactionPayControllerGetStrategyAction
  | TransactionPayControllerPolymarketGetDepositWalletAddressAction
  | TransactionPayControllerPolymarketSubmitDepositWalletBatchAction
  | TransactionPayControllerReconcileSolanaPayAction
  | TransactionPayControllerRecoverSolanaPayStatusAction
  | TransactionPayControllerGetSolanaPaySupportDiagnosticsAction;
