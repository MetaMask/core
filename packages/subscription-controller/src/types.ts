import type { Hex } from '@metamask/utils';

export enum ProductType {
  SHIELD = 'shield',
}

export type Product = {
  name: ProductType;
  id: string;
  currency: string;
  amount: number;
};

export enum PaymentType {
  byCard = 'card',
  byCrypto = 'crypto',
}

export enum RecurringInterval {
  month = 'month',
  year = 'year',
}

export enum SubscriptionStatus {
  // Initial states
  incomplete = 'incomplete',
  incompleteExpired = 'incomplete_expired',

  // Active states
  provisional = 'provisional',
  trialing = 'trialing',
  active = 'active',

  // Payment issues
  pastDue = 'past_due',
  unpaid = 'unpaid',

  // Cancelled states
  canceled = 'canceled',

  // Paused states
  paused = 'paused',
}

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
    payerAddress: string;
    chainId: string;
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
  chainId: string;
  payerAddress: string;
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

export type FetchFunction = (
  input: RequestInfo | URL,
  init?: RequestInit,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

export type ProductPrice = {
  interval: RecurringInterval;
  unitAmount: number; // amount in the smallest unit of the currency, e.g., cents
  unitDecimals: number; // number of decimals for the smallest unit of the currency
  currency: string; // "usd"
  trialPeriodDays: number;
  minBillingCycles: number;
};

export type ProductPricing = {
  name: ProductType;
  prices: ProductPrice[];
};

export type TokenPaymentInfo = {
  symbol: string;
  address: string;
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
  chainId: string;
  paymentAddress: string;
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

export type ISubscriptionService = {
  getSubscriptions(): Promise<GetSubscriptionsResponse>;
  cancelSubscription(request: { subscriptionId: string }): Promise<void>;
  getPricing(): Promise<PricingResponse>;
  startSubscriptionWithCard(
    request: StartSubscriptionRequest,
  ): Promise<StartSubscriptionResponse>;
  startCryptoSubscription(
    request: StartCryptoSubscriptionRequest,
  ): Promise<StartCryptoSubscriptionResponse>;
};
