import type {
  ControllerStateChangeEvent,
  ControllerGetStateAction,
  RestrictedMessenger,
} from '@metamask/base-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';

import type { controllerName, Env } from './constants';

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

export type SubscriptionControllerState = {
  subscriptions: Subscription[];
  authTokenRef?: AuthTokenRef;
  pendingPaymentTransactions?: {
    [transactionId: string]: PendingPaymentTransaction;
  };
};

// Actions
export type SubscriptionControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  SubscriptionControllerState
>;
export type SubscriptionControllerActions =
  SubscriptionControllerGetStateAction;

export type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerToken;

// Events
export type SubscriptionControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  SubscriptionControllerState
>;
export type SubscriptionControllerEvents =
  SubscriptionControllerStateChangeEvent;

export type AllowedEvents =
  AuthenticationController.AuthenticationControllerStateChangeEvent;

// Messenger
export type SubscriptionControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  SubscriptionControllerActions | AllowedActions,
  SubscriptionControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Subscription Controller Options.
 */
export type SubscriptionControllerOptions = {
  messenger: SubscriptionControllerMessenger;

  /**
   * Initial state to set on this controller.
   */
  state?: Partial<SubscriptionControllerState>;

  /**
   * Environment for this controller.
   */
  env: Env;

  /**
   * Subscription service to use for the subscription controller.
   */
  subscriptionService?: ISubscriptionService;
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
