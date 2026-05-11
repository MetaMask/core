/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MultichainTransactionsController } from './MultichainTransactionsController';

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
  MultichainTransactionsControllerUpdateTransactionsForAccountAction;
