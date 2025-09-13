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

/** only usd for now */
export type Currency = 'usd';

export type Product = {
  name: ProductType;
  id: string;
  currency: Currency;
  amount: number;
};

// state
export type Subscription = {
  id: string;
  products: Product[];
  currentPeriodStart: string; // ISO 8601
  currentPeriodEnd: string; // ISO 8601
  status: SubscriptionStatus;
  interval: RecurringInterval;
  paymentMethod: SubscriptionPaymentMethod;
};

export type SubscriptionPaymentMethod = {
  type: PaymentType;
  crypto?: {
    payerAddress: Hex;
    chainId: Hex;
    tokenSymbol: string;
  };
};

export type GetSubscriptionsResponse = {
  customerId?: string;
  subscriptions: Subscription[];
  trialedProducts: ProductType[];
};

export type StartSubscriptionRequest = {
  products: ProductType[];
  isTrialRequested: boolean;
  recurringInterval: RecurringInterval;
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

export type ISubscriptionService = {
  getSubscriptions(): Promise<GetSubscriptionsResponse>;
  cancelSubscription(request: { subscriptionId: string }): Promise<void>;
  startSubscriptionWithCard(
    request: StartSubscriptionRequest,
  ): Promise<StartSubscriptionResponse>;
  getPricing(): Promise<PricingResponse>;
  startSubscriptionWithCrypto(
    request: StartCryptoSubscriptionRequest,
  ): Promise<StartCryptoSubscriptionResponse>;
  updatePaymentMethodCard(
    request: UpdatePaymentMethodCardRequest,
  ): Promise<void>;
  updatePaymentMethodCrypto(
    request: UpdatePaymentMethodCryptoRequest,
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
};

export type UpdatePaymentMethodCryptoRequest = {
  subscriptionId: string;
  chainId: Hex;
  payerAddress: Hex;
  tokenSymbol: string;
  rawTransaction: Hex;
  recurringInterval: RecurringInterval;
  billingCycles: number;
};
