/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ChompApiService } from './chomp-api-service';

/**
 * Associates an address with a CHOMP profile.
 *
 * POST /v1/auth/address
 *
 * @param params - The association params containing signature, timestamp,
 * and address.
 * @returns The profile association result. Returns on both 201 and 409.
 */
export type ChompApiServiceAssociateAddressAction = {
  type: `ChompApiService:associateAddress`;
  handler: ChompApiService['associateAddress'];
};

/**
 * Creates an account upgrade request.
 *
 * POST /v1/account-upgrade
 *
 * @param params - The upgrade params containing signature components and
 * chain details.
 * @returns The upgrade result.
 */
export type ChompApiServiceCreateUpgradeAction = {
  type: `ChompApiService:createUpgrade`;
  handler: ChompApiService['createUpgrade'];
};

/**
 * Fetches all EIP-7702 upgrade authorizations for a given address (one per
 * chain).
 *
 * GET /v1/account-upgrade/:address
 *
 * @param address - The address to look up.
 * @returns The upgrade entries; empty array if none exist.
 */
export type ChompApiServiceGetUpgradesAction = {
  type: `ChompApiService:getUpgrades`;
  handler: ChompApiService['getUpgrades'];
};

/**
 * Verifies a delegation signature.
 *
 * POST /v1/intent/verify-delegation
 *
 * @param params - The delegation verification params.
 * @returns The verification result including validity and optional errors.
 */
export type ChompApiServiceVerifyDelegationAction = {
  type: `ChompApiService:verifyDelegation`;
  handler: ChompApiService['verifyDelegation'];
};

/**
 * Submits one or more intents to the CHOMP API.
 *
 * POST /v1/intent
 *
 * @param intents - The array of intents to submit.
 * @returns The array of intent responses.
 */
export type ChompApiServiceCreateIntentsAction = {
  type: `ChompApiService:createIntents`;
  handler: ChompApiService['createIntents'];
};

/**
 * Fetches intents associated with a given address.
 *
 * GET /v1/intent/account/:address
 *
 * @param address - The address to look up intents for.
 * @returns The array of intents for the address.
 */
export type ChompApiServiceGetIntentsByAddressAction = {
  type: `ChompApiService:getIntentsByAddress`;
  handler: ChompApiService['getIntentsByAddress'];
};

/**
 * Creates a withdrawal for card spend flows.
 *
 * POST /v1/withdrawal
 *
 * @param params - The withdrawal params containing chainId, amount
 * (decimal or hex string), and account address.
 * @returns The withdrawal result.
 */
export type ChompApiServiceCreateWithdrawalAction = {
  type: `ChompApiService:createWithdrawal`;
  handler: ChompApiService['createWithdrawal'];
};

/**
 * Retrieves service details including delegation redeemer addresses and DeFi
 * contract details for signing delegations for auto-deposit functionality.
 *
 * GET /v1/chomp
 *
 * @param chainIds - Array of chain IDs (0x-prefixed hex strings) to retrieve
 * details for.
 * @returns The service details for the requested chains.
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
  | ChompApiServiceGetUpgradesAction
  | ChompApiServiceVerifyDelegationAction
  | ChompApiServiceCreateIntentsAction
  | ChompApiServiceGetIntentsByAddressAction
  | ChompApiServiceCreateWithdrawalAction
  | ChompApiServiceGetServiceDetailsAction;
