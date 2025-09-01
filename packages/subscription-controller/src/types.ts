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

export enum RecurringInterval {
  month = 'month',
  year = 'year',
}

export type PaymentMethod = {
  type: PaymentType;
  crypto?: {
    payerAddress: string;
    chainId: string;
    tokenSymbol: string;
  };
};

export enum SubscriptionStatus {
  // Initial states
  incomplete = 'incomplete',
  incompleteExpired = 'incomplete_expired',

  // Active states
  trialingPending = 'trialing_pending',
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
  paymentMethod: PaymentMethod;
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

export type AuthUtils = {
  getAccessToken: () => Promise<string>;
};

export type ISubscriptionService = {
  getSubscriptions(): Promise<GetSubscriptionsResponse>;
  cancelSubscription(request: { subscriptionId: string }): Promise<void>;
  startSubscriptionWithCard(
    request: StartSubscriptionRequest,
  ): Promise<StartSubscriptionResponse>;
};
