import { CHOMP_INTENT_TYPES } from '@metamask/chomp-api-service';
import type { Hex } from '@metamask/utils';

import { PRODUCT_TYPES } from '../types.js';
import type { RecurringInterval } from '../types.js';

/**
 * Storage / CHOMP metadata type for cash-subscription delegations.
 */
export const CASH_SUBSCRIPTION_DELEGATION_TYPE =
  CHOMP_INTENT_TYPES.CASH_SUBSCRIPTION;

/**
 * Request to prepare a cash-subscription delegation.
 *
 * The service resolves all amount, token, delegate, and trial-duration fields
 * from authoritative pricing held by `SubscriptionController`.
 *
 * Only Money Account Plus is supported; Shield continues to use ERC-20
 * approval rather than delegation.
 */
export type PrepareSubscriptionDelegationRequest = {
  product: typeof PRODUCT_TYPES.MONEY_ACCOUNT_PLUS;
  recurringInterval: RecurringInterval;
  payerAddress: Hex;
  /**
   * Whether the user selected the pricing trial. Pricing `trialPeriodDays`
   * only affects the delegation start date when this is true.
   */
  isTrialRequested: boolean;
  /**
   * When true, gates preparation on a sufficient Money Account balance
   * (`unitAmount × minBillingCyclesForBalance` in mUSD) before side effects.
   */
  checkBalance?: boolean;
  /**
   * When true, skips CHOMP verify/intent interactions. Intended for alpha
   * demos and tests where the subscription API can create a subscription
   * without a registered CHOMP intent. Defaults to false.
   */
  skipChompInteractions?: boolean;
};

/**
 * Result of {@link SubscriptionDelegationService.prepareDelegation}.
 */
export type PreparedSubscriptionDelegation = {
  delegationHash: Hex;
  disposition: 'created' | 'reused';
};

/**
 * Request to check whether a Money Account holds enough convertible mUSD value
 * to cover the subscription funding requirement.
 */
export type MoneyAccountBalanceCheckRequest = Pick<
  PrepareSubscriptionDelegationRequest,
  'product' | 'recurringInterval' | 'payerAddress'
>;

/**
 * Result of {@link SubscriptionDelegationService.checkMoneyAccountBalance}.
 * `balance` and `requiredBalance` are mUSD base units (6 decimals).
 */
export type MoneyAccountBalanceCheckResult = {
  hasSufficientBalance: boolean;
  balance: string;
  requiredBalance: string;
};

/**
 * Delegation Framework enforcers used by cash-subscription delegations.
 */
export type SubscriptionDelegationEnforcers = {
  valueLte: Hex;
  erc20TokenPeriodTransfer: Hex;
  redeemer: Hex;
};
