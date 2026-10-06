/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ChompApiService } from './chomp-api-service.js';

/**
 * Associates an address with a CHOMP profile.
 *
 * POST /v1/auth/address
 *
 * @param params - The association params containing signature, timestamp,
 * and address.
 * @returns The profile association result: `status: 'created'` for a new
 * association, `status: 'active'` when the address was already associated
 * with the authenticated profile. Throws on 409, which indicates the
 * address is associated with a different profile.
 */
export type ChompApiServiceAssociateAddressAction = {
  type: `ChompApiService:associateAddress`;
  handler: ChompApiService['associateAddress'];
};

/**
 * Requests a single-use challenge for associating an address through the v2
 * flow. Sign the returned `message` exactly as received, using
 * `personal_sign` with the address being associated, then submit it with
 * {@link ChompApiService.associateAddressV2} before `expiresAt`. Requesting
 * a new challenge for the same address replaces the previous one.
 *
 * POST /v2/auth/address/challenge
 *
 * Each call issues a new challenge, so the result is never cached.
 *
 * @param params - The address to associate and the association purpose.
 * `ASSOCIATE_SUCCESSOR` also requires the predecessor address.
 * @returns The challenge ID, the message to sign, and when it expires.
 */
export type ChompApiServiceCreateAddressChallengeAction = {
  type: `ChompApiService:createAddressChallenge`;
  handler: ChompApiService['createAddressChallenge'];
};

/**
 * Associates an address with a CHOMP profile by submitting the signature of
 * a challenge from {@link ChompApiService.createAddressChallenge}. The
 * address, purpose and predecessor come from the challenge. For
 * `ASSOCIATE_SUCCESSOR`, the association and the link to the predecessor
 * are written atomically.
 *
 * POST /v2/auth/address
 *
 * @param params - The challenge ID and its signature.
 * @returns The profile association result: `status: 'created'` when the
 * association or link was written, `status: 'active'` when the address was
 * already associated with the authenticated profile. Throws on 400
 * `CHALLENGE_INVALID_OR_EXPIRED` (request a new challenge), on 409 when the
 * address is associated with a different profile, and on link validation
 * errors.
 */
export type ChompApiServiceAssociateAddressV2Action = {
  type: `ChompApiService:associateAddressV2`;
  handler: ChompApiService['associateAddressV2'];
};

/**
 * Fetches the addresses associated with the authenticated profile.
 *
 * GET /v1/auth/address
 *
 * The result is scoped to the authenticated profile and consumers use it
 * to decide whether an association already exists, so it is always fetched
 * fresh (`staleTime: 0`) and evicted as soon as the call settles
 * (`gcTime: 0`). The query key carries a SHA-256 digest of the bearer
 * token — the same token the request is made with — so concurrent calls
 * only share an in-flight request when they are for the same profile. The
 * digest, not the token, is used because query keys leave the service via
 * the `cacheUpdated` messenger events.
 *
 * @returns The active address associations; empty array if none exist.
 * Addresses are lowercased.
 */
export type ChompApiServiceGetAssociatedAddressesAction = {
  type: `ChompApiService:getAssociatedAddresses`;
  handler: ChompApiService['getAssociatedAddresses'];
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
 * Callers use the result to decide whether an intent already exists, so it
 * is always fetched fresh (`staleTime: 0`).
 *
 * @param address - The address to look up intents for.
 * @returns The array of intents for the address, omitting any with an
 * intent type this service does not recognise.
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
  | ChompApiServiceCreateAddressChallengeAction
  | ChompApiServiceAssociateAddressV2Action
  | ChompApiServiceGetAssociatedAddressesAction
  | ChompApiServiceCreateUpgradeAction
  | ChompApiServiceGetUpgradesAction
  | ChompApiServiceVerifyDelegationAction
  | ChompApiServiceCreateIntentsAction
  | ChompApiServiceGetIntentsByAddressAction
  | ChompApiServiceCreateWithdrawalAction
  | ChompApiServiceGetServiceDetailsAction;
