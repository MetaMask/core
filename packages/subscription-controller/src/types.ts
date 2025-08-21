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
  crypto?: {
    payerAddress: string;
    chainId: string;
    tokenSymbol: string;
  };
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
  paymentMethod: PaymentMethod;
};

export type GetSubscriptionsResponse = {
  customerId: string;
  subscriptions: Subscription[];
  trialedProducts: ProductType[];
};

export type AuthUtils = {
  getAccessToken: () => Promise<string>;
};

export type PricingResponse = {
  products: {
    name: string;
    prices: {
      interval: string; // "month" | "year"
      unitAmount: string; // amount in the smallest unit of the currency, e.g., cents
      unitDecimals: number; // number of decimals for the smallest unit of the currency
      currency: string; // "usd"
      trialPeriodDays: number;
      minBillingCycles: number;
    }[];
  }[];
  paymentMethods: {
    type: string; // "crypto" | "card"
    chains: {
      chainId: string; // "0x1",
      paymentAddress: string; // "0x...",
      tokens: {
        symbol: string; // "USDC" | "USDT"
        address: string; // "0x..."
        decimals: number; // 18
        conversionRate: {
          usd: string; // "1.0"
        };
      }[];
    }[];
  };
};

export type ISubscriptionService = {
  getSubscriptions(): Promise<GetSubscriptionsResponse>;
  cancelSubscription(request: { subscriptionId: string }): Promise<void>;
  getPricing(): Promise<PricingResponse>;
};
