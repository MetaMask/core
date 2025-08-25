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

// Authentication token reference (managed by user storage controller)
export type AuthTokenRef = {
  lastRefreshTriggered: string;
  refreshStatus: 'pending' | 'completed' | 'failed';
};

export type PendingPaymentTransaction = {
  type: 'subscription_approval' | 'subscription_payment';
  status: 'pending' | 'confirmed' | 'failed';
  chainId: string;
  hash?: string;
};

export type GetSubscriptionsResponse = {
  customerId: string;
  subscriptions: Subscription[] | null;
  trialedProducts: ProductType[];
};

export type ISubscriptionService = {
  getSubscriptions(): Promise<GetSubscriptionsResponse>;
  cancelSubscription(request: { subscriptionId: string }): Promise<void>;
};
