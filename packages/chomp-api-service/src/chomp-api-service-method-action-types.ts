/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ChompApiService } from './chomp-api-service';

/**
 * Associates an address with a CHOMP profile via POST /v1/auth/address.
 */
export type ChompApiServiceAssociateAddressAction = {
  type: `ChompApiService:associateAddress`;
  handler: ChompApiService['associateAddress'];
};

/**
 * Creates an account upgrade via POST /v1/account-upgrade.
 */
export type ChompApiServiceCreateUpgradeAction = {
  type: `ChompApiService:createUpgrade`;
  handler: ChompApiService['createUpgrade'];
};

/**
 * Fetches the upgrade record for an address via GET /v1/account-upgrade/:address.
 */
export type ChompApiServiceGetUpgradeAction = {
  type: `ChompApiService:getUpgrade`;
  handler: ChompApiService['getUpgrade'];
};

/**
 * Verifies a delegation via POST /v1/intent/verify-delegation.
 */
export type ChompApiServiceVerifyDelegationAction = {
  type: `ChompApiService:verifyDelegation`;
  handler: ChompApiService['verifyDelegation'];
};

/**
 * Submits intents via POST /v1/intent.
 */
export type ChompApiServiceCreateIntentsAction = {
  type: `ChompApiService:createIntents`;
  handler: ChompApiService['createIntents'];
};

/**
 * Fetches intents by address via GET /v1/intent/account/:address.
 */
export type ChompApiServiceGetIntentsByAddressAction = {
  type: `ChompApiService:getIntentsByAddress`;
  handler: ChompApiService['getIntentsByAddress'];
};

/**
 * Submits a withdrawal request via POST /v1/withdrawal
 */
export type ChompApiServiceCreateWithdrawalAction = {
  type: `ChompApiService:createWithdrawal`;
  handler: ChompApiService['createWithdrawal'];
};

/**
 * Retrieves service details via GET /v1/chomp.
 */
export type ChompApiServiceGetServiceDetailsAction = {
  type: `ChompApiService:getServiceDetails`;
  handler: ChompApiService['getServiceDetails'];
};

/**
 * Union of all ChompApiService action types.
 */
export type ChompApiServiceMethodActions =
  | ChompApiServiceAssociateAddressAction
  | ChompApiServiceCreateUpgradeAction
  | ChompApiServiceGetUpgradeAction
  | ChompApiServiceVerifyDelegationAction
  | ChompApiServiceCreateIntentsAction
  | ChompApiServiceGetIntentsByAddressAction
  | ChompApiServiceCreateWithdrawalAction
  | ChompApiServiceGetServiceDetailsAction;
