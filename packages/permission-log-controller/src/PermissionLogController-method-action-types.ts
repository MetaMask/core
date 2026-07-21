/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { PermissionLogController } from './PermissionLogController';

/**
 * Updates the exposed account history for the given origin.
 * Sets the 'last seen' time to Date.now() for the given accounts.
 * Does **not** update the 'lastApproved' time for the permission itself.
 * Returns if the accounts array is empty.
 *
 * @param origin - The origin that the accounts are exposed to.
 * @param accounts - The accounts.
 */
export type PermissionLogControllerUpdateAccountsHistoryAction = {
  type: `PermissionLogController:updateAccountsHistory`;
  handler: PermissionLogController['updateAccountsHistory'];
};

/**
 * Create a permissions log middleware. Records permissions activity and history:
 *
 * Activity: requests and responses for restricted and most wallet_ methods.
 *
 * History: for each origin, the last time a permission was granted, including
 * which accounts were exposed, if any.
 *
 * @returns The permissions log middleware.
 */
export type PermissionLogControllerCreateMiddlewareAction = {
  type: `PermissionLogController:createMiddleware`;
  handler: PermissionLogController['createMiddleware'];
};

/**
 * Union of all PermissionLogController action types.
 */
export type PermissionLogControllerMethodActions =
  | PermissionLogControllerUpdateAccountsHistoryAction
  | PermissionLogControllerCreateMiddlewareAction;
