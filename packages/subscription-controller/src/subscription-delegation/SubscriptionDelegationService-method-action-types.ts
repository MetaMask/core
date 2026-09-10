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
 * Prepares a cash-subscription delegation and returns its hash.
 *
 * Reuses a stored AUS delegation that matches the semantic fingerprint when
 * one exists (ensuring a CHOMP intent is active for its hash, unless
 * `skipChompInteractions` is true). Otherwise builds, signs, optionally
 * verifies with CHOMP, persists, and optionally registers a new delegation.
 *
 * When `skipChompInteractions` is true (alpha demos / tests), CHOMP verify
 * and intent calls are skipped; the returned hash is computed locally.
 *
 * @param request - Authoritative pricing and payer details for the delegation.
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
  | SubscriptionDelegationServicePrepareDelegationAction;
