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

export type ISubscriptionService = {
  hasAuthUtils(): boolean;
  setAuthUtils(authUtils: AuthUtils): void;
  getSubscriptions(): Promise<GetSubscriptionsResponse>;
  cancelSubscription(request: { subscriptionId: string }): Promise<void>;
};
