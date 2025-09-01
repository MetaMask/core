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
  CARD = 'card',
  CRYPTO = 'crypto',
}

export type PaymentMethod = {
  type: PaymentType;
  chains?: PaymentMethodChain[];
};

export type PaymentMethodChain = {
  chainId: string;
  paymentAddress: string;
  tokens: PaymentToken[];
};

export type PaymentToken = {
  symbol: string;
  address: string;
  decimals: number;
  /**
   * example: {
      usd: '1.0',
    },
   */
  conversionRate: Record<string, string>;
};

export type PriceInfo = {
  interval: 'month' | 'year';
  currency: string;
  unitAmount: number;
  unitDecimals: number;
  trialPeriodDays: number;
  minBillingCycles: number;
};

export type ProductPrice = {
  name: ProductType;
  prices: PriceInfo[];
};

// state
export type Subscription = {
  id: string;
  products: Product[];
  currentPeriodStart: string; // ISO 8601
  currentPeriodEnd: string; // ISO 8601
  billingCycles?: number;
  status: 'active' | 'inactive' | 'trialing' | 'cancelled';
  interval: 'month' | 'year';
  paymentMethod: {
    type: PaymentType;
    crypto?: {
      payerAddress: string;
      chainId: string;
      tokenSymbol: string;
    };
  };
};

export type GetSubscriptionsResponse = {
  customerId: string;
  subscriptions: Subscription[];
  trialedProducts: ProductType[];
};

export type PriceInfoResponse = {
  products: Product[];
  paymentMethods: PaymentMethod[];
};

export type AuthUtils = {
  getAccessToken: () => Promise<string>;
};

export type ISubscriptionService = {
  getSubscriptions(): Promise<GetSubscriptionsResponse>;
  cancelSubscription(request: { subscriptionId: string }): Promise<void>;
  getPriceInfo(): Promise<PriceInfoResponse>;
};
