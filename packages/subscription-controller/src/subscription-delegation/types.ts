import type { Hex, Json } from '@metamask/utils';

import { PRODUCT_TYPES } from '../types.js';
import type {
  ProductType,
  RecurringInterval,
  StartCryptoSubscriptionResponse,
} from '../types.js';

/**
 * Storage / CHOMP metadata type for cash-subscription delegations.
 *
 * Defined locally so this package does not depend on an unreleased
 * `@metamask/chomp-api-service` intent type. Production CHOMP intent
 * registration still requires a follow-up chomp-api-service release that
 * accepts `'cash-subscription'`.
 */
export const CASH_SUBSCRIPTION_DELEGATION_TYPE = 'cash-subscription' as const;

export const SUBSCRIPTION_DELEGATION_APPROVAL_TYPE =
  'subscription_delegation' as const;

export const SUBSCRIPTION_DELEGATION_POLICY_VERSION = '1' as const;

export type ChompIntentType =
  | 'cash-deposit'
  | 'cash-withdrawal'
  | typeof CASH_SUBSCRIPTION_DELEGATION_TYPE
  | 'cash-deposit-premium'
  | 'cash-withdrawal-premium';

export type SubscriptionPermissionId = ChompIntentType;

export type MoneyAccountAuthorizationReason =
  | 'controller-not-ready'
  | 'address-not-associated'
  | 'eip7702-not-active'
  | 'monitoring-list-missing'
  | 'configuration-changed';

export type UnsignedSubscriptionDelegation = {
  delegate: Hex;
  delegator: Hex;
  authority: Hex;
  caveats: {
    enforcer: Hex;
    terms: Hex;
    args: Hex;
  }[];
  salt: Hex;
};

export type SignedSubscriptionDelegation = UnsignedSubscriptionDelegation & {
  signature: Hex;
};

export type SubscriptionDelegationTypedData = {
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  domain: {
    chainId: number;
    name: string;
    version: string;
    verifyingContract: Hex;
  };
  message: Json;
};

export type DecodedPermission = {
  tokenAddress: Hex;
  delegateAddress: Hex;
  periodAmount: string;
  periodDuration: number;
  startDate: number;
  maxNativeValue: '0';
};

export type PreparedSubscriptionPermission = {
  id: SubscriptionPermissionId;
  owner: 'money-account' | 'subscription';
  disposition: 'new' | 'reused';
  delegation: UnsignedSubscriptionDelegation;
  typedData: SubscriptionDelegationTypedData;
  typedDataHash: Hex;
  decodedAuthority: DecodedPermission;
  existingDelegationHash?: Hex;
};

export type PreparedSubscriptionDelegationBundle = {
  bundleFingerprint: Hex;
  policyVersion: string;
  account: Hex;
  chainId: Hex;
  permissions: PreparedSubscriptionPermission[];
};

export type SubscriptionFundingRequest = {
  useCase: 'subscription';
  destinationAccount: Hex;
  chainId: Hex;
  targetToken: {
    symbol: 'mUSD';
    address: Hex;
  };
  targetAmount: string;
};

export type SubscriptionDelegationApprovalResult = {
  bundleFingerprint: Hex;
  fundingTransactionHash: Hex;
};

export type StartSubscriptionWithDelegationRequest = {
  product: ProductType;
  recurringInterval: RecurringInterval;
  chainId: Hex;
  payerAddress: Hex;
};

export type PrepareAuthorizationBundleResult =
  | {
      status: 'prepared';
      bundle: PreparedSubscriptionDelegationBundle;
    }
  | {
      status: 'money-account-authorization-required';
      reasons: MoneyAccountAuthorizationReason[];
    };

export type CommitAuthorizationBundleRequest = {
  bundle: PreparedSubscriptionDelegationBundle;
  signedPaymentDelegation: SignedSubscriptionDelegation;
};

export type CommitAuthorizationBundleResult = {
  paymentDelegationHash: Hex;
};

export type StartSubscriptionWithDelegationResult =
  StartCryptoSubscriptionResponse;

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
   * When true, skips CHOMP verify/intent interactions. Required for alpha
   * until `@metamask/chomp-api-service` accepts `'cash-subscription'` intent
   * metadata. Defaults to false (production path; unsupported until that
   * follow-up release).
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
};
