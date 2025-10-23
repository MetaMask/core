import type { Hex } from '@metamask/utils';

export const PRODUCT_TYPES = {
  SHIELD: 'shield',
} as const;

export type ProductType = (typeof PRODUCT_TYPES)[keyof typeof PRODUCT_TYPES];

export const PAYMENT_TYPES = {
  byCard: 'card',
  byCrypto: 'crypto',
} as const;

export type PaymentType = (typeof PAYMENT_TYPES)[keyof typeof PAYMENT_TYPES];

export const RECURRING_INTERVALS = {
  month: 'month',
  year: 'year',
} as const;

export type RecurringInterval =
  (typeof RECURRING_INTERVALS)[keyof typeof RECURRING_INTERVALS];

export const SUBSCRIPTION_STATUSES = {
  // Initial states
  incomplete: 'incomplete',
  incompleteExpired: 'incomplete_expired',
  // Active states
  provisional: 'provisional',
  trialing: 'trialing',
  active: 'active',
  // Payment issues
  pastDue: 'past_due',
  unpaid: 'unpaid',
  // Cancelled states
  canceled: 'canceled',
  // Paused states
  paused: 'paused',
} as const;

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUSES)[keyof typeof SUBSCRIPTION_STATUSES];

export const CRYPTO_PAYMENT_METHOD_ERRORS = {
  APPROVAL_TRANSACTION_TOO_OLD: 'approval_transaction_too_old',
  APPROVAL_TRANSACTION_REVERTED: 'approval_transaction_reverted',
  APPROVAL_TRANSACTION_MAX_VERIFICATION_ATTEMPTS_REACHED:
    'approval_transaction_max_verification_attempts_reached',
  INSUFFICIENT_BALANCE: 'insufficient_balance',
  INSUFFICIENT_ALLOWANCE: 'insufficient_allowance',
} as const;

export type CryptoPaymentMethodError =
  (typeof CRYPTO_PAYMENT_METHOD_ERRORS)[keyof typeof CRYPTO_PAYMENT_METHOD_ERRORS];

/** only usd for now */
export type Currency = 'usd';

export type Product = {
  name: ProductType;
  currency: Currency;
  unitAmount: number;
  unitDecimals: number;
};

// state
export type Subscription = {
  id: string;
  products: Product[];
  currentPeriodStart: string; // ISO 8601
  currentPeriodEnd: string; // ISO 8601
  /** is subscription scheduled for cancellation */
  cancelAtPeriodEnd?: boolean;
  status: SubscriptionStatus;
  interval: RecurringInterval;
  paymentMethod: SubscriptionPaymentMethod;
  trialPeriodDays?: number;
  trialStart?: string; // ISO 8601
  trialEnd?: string; // ISO 8601
  /** Crypto payment only: next billing cycle date (e.g after 12 months) */
  endDate?: string; // ISO 8601
  billingCycles?: number;
};

export type SubscriptionCardPaymentMethod = {
  type: Extract<PaymentType, 'card'>;
  card: {
    brand: string;
    /** display brand account for dual brand card */
    displayBrand: string;
    last4: string;
  };
};

export type SubscriptionCryptoPaymentMethod = {
  type: Extract<PaymentType, 'crypto'>;
  crypto: {
    payerAddress: Hex;
    chainId: Hex;
    tokenSymbol: string;
    error?: CryptoPaymentMethodError;
  };
};

export type SubscriptionPaymentMethod =
  | SubscriptionCardPaymentMethod
  | SubscriptionCryptoPaymentMethod;

export type GetSubscriptionsResponse = {
  customerId?: string;
  subscriptions: Subscription[];
  trialedProducts: ProductType[];
};

export type StartSubscriptionRequest = {
  products: ProductType[];
  isTrialRequested: boolean;
  recurringInterval: RecurringInterval;
  successUrl?: string;
};

export type StartSubscriptionResponse = {
  checkoutSessionUrl: string;
};

export type StartCryptoSubscriptionRequest = {
  products: ProductType[];
  isTrialRequested: boolean;
  recurringInterval: RecurringInterval;
  billingCycles: number;
  chainId: Hex;
  payerAddress: Hex;
  /**
   * e.g. "USDC"
   */
  tokenSymbol: string;
  rawTransaction: Hex;
  isSponsored?: boolean;
};

export type StartCryptoSubscriptionResponse = {
  subscriptionId: string;
  status: SubscriptionStatus;
};

export type AuthUtils = {
  getAccessToken: () => Promise<string>;
};

export type ProductPrice = {
  interval: RecurringInterval;
  unitAmount: number; // amount in the smallest unit of the currency, e.g., cents
  unitDecimals: number; // number of decimals for the smallest unit of the currency
  /** only usd for now */
  currency: Currency;
  trialPeriodDays: number;
  minBillingCycles: number;
};

export type ProductPricing = {
  name: ProductType;
  prices: ProductPrice[];
};

export type TokenPaymentInfo = {
  symbol: string;
  address: Hex;
  decimals: number;
  /**
   * example: {
      usd: '1.0',
    },
   */
  conversionRate: {
    usd: string;
  };
};

export type ChainPaymentInfo = {
  chainId: Hex;
  paymentAddress: Hex;
  tokens: TokenPaymentInfo[];
};

export type PricingPaymentMethod = {
  type: PaymentType;
  chains?: ChainPaymentInfo[];
};

export type PricingResponse = {
  products: ProductPricing[];
  paymentMethods: PricingPaymentMethod[];
};

export type GetCryptoApproveTransactionRequest = {
  /**
   * payment chain ID
   */
  chainId: Hex;
  /**
   * Payment token address
   */
  paymentTokenAddress: Hex;
  productType: ProductType;
  interval: RecurringInterval;
};

export type GetCryptoApproveTransactionResponse = {
  /**
   * The amount to approve
   * e.g: "100000000"
   */
  approveAmount: string;
  /**
   * The contract address (spender)
   */
  paymentAddress: Hex;
  /**
   * The payment token address
   */
  paymentTokenAddress: Hex;
  chainId: Hex;
};

export type SubscriptionEligibility = {
  product: ProductType;
  canSubscribe: boolean;
  minBalanceUSD: number;
  canViewEntryModal: boolean;
};

export const SubscriptionUserEvent = {
  ShieldEntryModalViewed: 'shield_entry_modal_viewed',
} as const;

export type SubscriptionUserEventType =
  (typeof SubscriptionUserEvent)[keyof typeof SubscriptionUserEvent];

export type SubmitUserEventRequest = {
  event: SubscriptionUserEventType;
};

/**
 * Request object for submitting sponsorship intents.
 */
export type SubmitSponsorshipIntentsRequest = {
  address: `0x${string}`;
  products: ProductType[];
  recurringInterval: RecurringInterval;
  billingCycles: number;
};

export type ISubscriptionService = {
  getSubscriptions(): Promise<GetSubscriptionsResponse>;
  cancelSubscription(request: {
    subscriptionId: string;
  }): Promise<Subscription>;
  unCancelSubscription(request: {
    subscriptionId: string;
  }): Promise<Subscription>;
  startSubscriptionWithCard(
    request: StartSubscriptionRequest,
  ): Promise<StartSubscriptionResponse>;
  getBillingPortalUrl(): Promise<BillingPortalResponse>;
  getPricing(): Promise<PricingResponse>;
  startSubscriptionWithCrypto(
    request: StartCryptoSubscriptionRequest,
  ): Promise<StartCryptoSubscriptionResponse>;
  updatePaymentMethodCard(
    request: UpdatePaymentMethodCardRequest,
  ): Promise<UpdatePaymentMethodCardResponse>;
  updatePaymentMethodCrypto(
    request: UpdatePaymentMethodCryptoRequest,
  ): Promise<void>;
  getSubscriptionsEligibilities(): Promise<SubscriptionEligibility[]>;
  submitUserEvent(request: SubmitUserEventRequest): Promise<void>;

  /**
   * Submit sponsorship intents to the Subscription Service backend.
   *
   * This is intended to be used together with the crypto subscription flow.
   * When the user has enabled the smart transaction feature, we will sponsor the gas fees for the subscription approval transaction.
   *
   * @param request - Request object containing the address and products.
   * @example {
   *   address: '0x1234567890123456789012345678901234567890',
   *   products: [ProductType.Shield],
   *   recurringInterval: RecurringInterval.Month,
   *   billingCycles: 1,
   * }
   */
  submitSponsorshipIntents(
    request: SubmitSponsorshipIntentsRequest,
  ): Promise<void>;
};

export type UpdatePaymentMethodOpts =
  | ({
      paymentType: Extract<PaymentType, 'card'>;
    } & UpdatePaymentMethodCardRequest)
  | ({
      paymentType: Extract<PaymentType, 'crypto'>;
    } & UpdatePaymentMethodCryptoRequest);

export type UpdatePaymentMethodCardRequest = {
  /**
   * Subscription ID
   */
  subscriptionId: string;

  /**
   * Recurring interval
   */
  recurringInterval: RecurringInterval;
  successUrl?: string;
};

export type UpdatePaymentMethodCardResponse = {
  redirectUrl: string;
};

export type UpdatePaymentMethodCryptoRequest = {
  subscriptionId: string;
  chainId: Hex;
  payerAddress: Hex;
  tokenSymbol: string;
  /**
   * The raw transaction to pay for the subscription
   * Can be empty if retry after topping up balance
   */
  rawTransaction?: Hex;
  recurringInterval: RecurringInterval;
  billingCycles: number;
};

export type BillingPortalResponse = {
  url: string;
};
