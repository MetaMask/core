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
 * Prepares a subscription-payment delegation and returns its verified hash.
 *
 * Reuses a stored AUS delegation that matches the semantic fingerprint when
 * one exists (ensuring a CHOMP intent is active for its hash). Otherwise
 * builds, signs, verifies, persists, and registers a new delegation.
 *
 * @param request - Authoritative pricing and payer details for the delegation.
 * @returns The verified delegation hash and whether it was created or reused.
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
