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
 * Before the approval, `MoneyAccountUpgradeController` is asked to ensure
 * the Money Account vault delegations and CHOMP intents exist; the
 * Subscription API validates them server-side. The custom approval is the
 * sole consent and funding boundary for the payment permission. No payment
 * delegation signing, persistence, or intent mutation occurs before it
 * returns a funding transaction hash.
 *
 * When `request.skipApproval` is `true`, the approval request and its
 * result validation are skipped and the flow proceeds directly to signing.
 * The caller is then responsible for consent and funding.
 *
 * @param request - Product selection, Money Account identity, and optional
 * `skipApproval` flag.
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
 * When `skipChompInteractions` is true (required for alpha), CHOMP verify
 * and intent calls are skipped; the returned hash is computed locally. The
 * default CHOMP-enabled path requires a follow-up chomp-api-service release
 * that accepts `'cash-subscription'` intent metadata.
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
