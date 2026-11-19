/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SubscriptionDelegationService } from './SubscriptionDelegationService.js';

/**
 * Checks whether the Money Account holds enough convertible mUSD value to
 * cover pricing `unitAmount × minBillingCyclesForBalance`.
 *
 * @param request - Payer address and pricing amount fields.
 * @returns Balance comparison in mUSD base units (6 decimals).
 */
export type SubscriptionDelegationServiceCheckMoneyAccountBalanceAction = {
  type: `SubscriptionDelegationService:checkMoneyAccountBalance`;
  handler: SubscriptionDelegationService['checkMoneyAccountBalance'];
};

/**
 * Runs the complete Money Account subscription checkout authorization flow.
 *
 * Subscriptions are refreshed first. An active subscription for the product
 * is rejected before Money Account upgrade, delegation signing, persistence,
 * or CHOMP registration.
 *
 * The caller must obtain user consent and initiate funding before calling.
 * `MoneyAccountUpgradeController` ensures the Money Account vault
 * delegations and CHOMP intents exist. The Subscription API validates those
 * delegations and the Money Account balance server-side. No payment
 * delegation signing, persistence, or intent mutation occurs before the
 * account is upgraded.
 *
 * @param request - Product selection and Money Account identity.
 * @returns The result from `SubscriptionController:startSubscriptionWithCrypto`.
 */
export type SubscriptionDelegationServiceStartSubscriptionWithDelegationAction =
  {
    type: `SubscriptionDelegationService:startSubscriptionWithDelegation`;
    handler: SubscriptionDelegationService['startSubscriptionWithDelegation'];
  };

/**
 * Prepares a cash-subscription delegation and returns its hash.
 *
 * Reuses a stored AUS delegation that matches the semantic fingerprint when
 * one exists (ensuring a CHOMP intent is active for its hash, unless
 * `skipChompInteractions` is true). Reuse classifies period `startDate` as
 * trial-deferred (`> now`) vs immediately redeemable, matching creation.
 * When several records match, the latest period `startDate` is reused
 * so a `forceNew` replacement is preferred over an older equivalent
 * permission.
 * If there is no match, builds, signs, optionally verifies with CHOMP,
 * persists, and optionally registers a new delegation.
 *
 * When `skipChompInteractions` is true, CHOMP verify and intent calls are
 * skipped; the returned hash is computed locally.
 *
 * @param request - Authoritative pricing and payer details for the delegation.
 * @param forceNew - Whether to create a replacement instead of reusing a
 * matching stored delegation.
 * @returns The delegation hash (CHOMP-verified unless skipped) and whether it
 * was created or reused.
 */
export type SubscriptionDelegationServicePrepareDelegationAction = {
  type: `SubscriptionDelegationService:prepareDelegation`;
  handler: SubscriptionDelegationService['prepareDelegation'];
};

/**
 * Union of all SubscriptionDelegationService action types.
 */
export type SubscriptionDelegationServiceMethodActions =
  | SubscriptionDelegationServiceCheckMoneyAccountBalanceAction
  | SubscriptionDelegationServiceStartSubscriptionWithDelegationAction
  | SubscriptionDelegationServicePrepareDelegationAction;
