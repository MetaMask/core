import type {
  ControllerStateChangeEvent,
  ControllerGetStateAction,
  RestrictedMessenger,
} from '@metamask/base-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';

import type { controllerName, Env } from './constants';

// state
export type Subscription = {
  id: string;
  createdDate: string;
  status: 'active' | 'inactive';
  paymentStatus: 'pending' | 'completed' | 'failed';
  paymentMethod: 'card' | 'crypto';
  paymentType: 'monthly' | 'yearly';
  paymentAmount: number;
  paymentCurrency: string;
  paymentDate: string;
  paymentId: string;
};

export type AuthUserData = {
  // Authentication token reference (managed by user storage controller)
  authTokenRef: {
    lastRefreshTriggered: string;
    refreshStatus: 'pending' | 'completed' | 'failed';
  };
};

export type PendingPaymentTransactionData = {
  pendingPaymentTransactions: {
    [transactionId: string]: {
      type: 'subscription_approval' | 'subscription_payment';
      status: 'pending' | 'confirmed' | 'failed';
      chainId: string;
      hash?: string;
    };
  };
};

export type SubscriptionControllerState = Partial<AuthUserData> &
  Partial<PendingPaymentTransactionData> & {
    subscription?: Subscription;
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

export type ISubscriptionService = {
  getSubscription(): Promise<Subscription | null>;
  cancelSubscription(params: { subscriptionId: string }): Promise<void>;
};
