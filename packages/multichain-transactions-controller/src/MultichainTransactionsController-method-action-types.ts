/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MultichainTransactionsController } from './MultichainTransactionsController';

/**
 * Adds or replaces a pending multichain transaction by approval ID.
 *
 * @param entry - Pending transaction entry to add.
 */
export type MultichainTransactionsControllerAddPendingTransactionAction = {
  type: `MultichainTransactionsController:addPendingTransaction`;
  handler: MultichainTransactionsController['addPendingTransaction'];
};

/**
 * Updates a pending multichain transaction by approval ID.
 *
 * @param approvalId - Approval ID for the pending transaction.
 * @param patch - Shallow patch to apply to the pending transaction.
 */
export type MultichainTransactionsControllerUpdatePendingTransactionAction = {
  type: `MultichainTransactionsController:updatePendingTransaction`;
  handler: MultichainTransactionsController['updatePendingTransaction'];
};

/**
 * Removes a pending multichain transaction by approval ID.
 *
 * @param approvalId - Approval ID for the pending transaction.
 */
export type MultichainTransactionsControllerRemovePendingTransactionAction = {
  type: `MultichainTransactionsController:removePendingTransaction`;
  handler: MultichainTransactionsController['removePendingTransaction'];
};

/**
 * Updates transactions for a specific account. This is used for the initial fetch
 * when an account is first added.
 *
 * @param accountId - The ID of the account to get transactions for.
 */
export type MultichainTransactionsControllerUpdateTransactionsForAccountAction =
  {
    type: `MultichainTransactionsController:updateTransactionsForAccount`;
    handler: MultichainTransactionsController['updateTransactionsForAccount'];
  };

/**
 * Union of all MultichainTransactionsController action types.
 */
export type MultichainTransactionsControllerMethodActions =
  | MultichainTransactionsControllerAddPendingTransactionAction
  | MultichainTransactionsControllerUpdatePendingTransactionAction
  | MultichainTransactionsControllerRemovePendingTransactionAction
  | MultichainTransactionsControllerUpdateTransactionsForAccountAction;
