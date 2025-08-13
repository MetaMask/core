import type {
  ControllerStateChangeEvent,
  ControllerGetStateAction,
  RestrictedMessenger,
} from '@metamask/base-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';

import type { controllerName, Env, SubscriptionProduct } from './constants';

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

export type StartSubscriptionRequest = {
  products: SubscriptionProduct[];
  isTrialRequested: boolean;
};

export type StartSubscriptionResponse = {
  checkoutSessionUrl: string;
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

export type SubscriptionControllerConfig = {
  env: Env;
};

/**
 * Seedless Onboarding Controller Options.
 *
 * @param messenger - The messenger to use for this controller.
 * @param state - The initial state to set on this controller.
 * @param encryptor - The encryptor to use for encrypting and decrypting seedless onboarding vault.
 */
export type SubscriptionControllerOptions = {
  messenger: SubscriptionControllerMessenger;

  /**
   * Initial state to set on this controller.
   */
  state?: Partial<SubscriptionControllerState>;

  /**
   * Configuration for this controller.
   */
  config?: Partial<SubscriptionControllerConfig>;

  /**
   * Subscription service to use for the subscription controller.
   */
  subscriptionService?: ISubscriptionService;
};

export type ISubscriptionService = {
  getSubscription(): Promise<Subscription | null>;
  cancelSubscription(params: { subscriptionId: string }): Promise<void>;
  startSubscriptionWithCard(
    request: StartSubscriptionRequest,
  ): Promise<StartSubscriptionResponse>;
};
