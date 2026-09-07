import type { Hex } from '@metamask/utils';

import { PRODUCT_TYPES } from '../types.js';
import type { RecurringInterval } from '../types.js';

/**
 * Storage / CHOMP metadata type for subscription-payment delegations.
 */
export const SUBSCRIPTION_PAYMENT_DELEGATION_TYPE = 'subscription-payment';

/**
 * Request to prepare a subscription-payment delegation.
 *
 * Pricing fields (`unitAmount`, `unitDecimals`, token details,
 * `minimumFundingCycles`) must come from authoritative subscription pricing —
 * never from editable UI input.
 *
 * Only Money Account Plus is supported; Shield continues to use ERC-20
 * approval rather than delegation.
 */
export type PrepareSubscriptionDelegationRequest = {
  product: typeof PRODUCT_TYPES.MONEY_ACCOUNT_PLUS;
  recurringInterval: RecurringInterval;
  chainId: Hex;
  payerAddress: Hex;
  tokenAddress: Hex;
  tokenSymbol: string;
  tokenDecimals: number;
  unitAmount: number;
  unitDecimals: number;
  minimumFundingCycles: number;
};

/**
 * Result of {@link SubscriptionDelegationService.prepareDelegation}.
 */
export type PreparedSubscriptionDelegation = {
  delegationHash: Hex;
  disposition: 'created' | 'reused';
};

/**
 * Delegation Framework enforcers used by subscription-payment delegations.
 */
export type SubscriptionDelegationEnforcers = {
  valueLte: Hex;
  erc20TokenPeriodTransfer: Hex;
};

/**
 * Immutable, chain-scoped CHOMP subscription-payment configuration supplied
 * at service construction (mirrors Money Account upgrade config).
 *
 * Wallet supplies the CHOMP delegate. The service resolves Delegation
 * Framework enforcers for {@link chainId} from
 * `@metamask/delegation-deployments`.
 */
export type SubscriptionDelegationConfig = {
  chainId: Hex;
  delegateAddress: Hex;
};
