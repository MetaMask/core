/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MoneyAccountSubscriptionController } from './MoneyAccountSubscriptionController.js';

export type MoneyAccountSubscriptionControllerForceRefreshAction = {
  type: `MoneyAccountSubscriptionController:forceRefresh`;
  handler: MoneyAccountSubscriptionController['forceRefresh'];
};

export type MoneyAccountSubscriptionControllerStartEntitlementRefreshAction = {
  type: `MoneyAccountSubscriptionController:startEntitlementRefresh`;
  handler: MoneyAccountSubscriptionController['startEntitlementRefresh'];
};

export type MoneyAccountSubscriptionControllerStopEntitlementRefreshAction = {
  type: `MoneyAccountSubscriptionController:stopEntitlementRefresh`;
  handler: MoneyAccountSubscriptionController['stopEntitlementRefresh'];
};

export type MoneyAccountSubscriptionControllerClearStateAction = {
  type: `MoneyAccountSubscriptionController:clearState`;
  handler: MoneyAccountSubscriptionController['clearState'];
};

/**
 * Union of all MoneyAccountSubscriptionController action types.
 */
export type MoneyAccountSubscriptionControllerMethodActions =
  | MoneyAccountSubscriptionControllerForceRefreshAction
  | MoneyAccountSubscriptionControllerStartEntitlementRefreshAction
  | MoneyAccountSubscriptionControllerStopEntitlementRefreshAction
  | MoneyAccountSubscriptionControllerClearStateAction;
