import {
  BaseController,
  type StateMetadata,
  type ControllerStateChangeEvent,
  type ControllerGetStateAction,
  type RestrictedMessenger,
} from '@metamask/base-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';

import {
  controllerName,
  SubscriptionControllerErrorMessage,
} from './constants';
import type { ProductType, ISubscriptionService, Subscription } from './types';

export type SubscriptionControllerState = {
  subscriptions: Subscription[];
};

// Messenger Actions
type CreateActionsObj<Controller extends keyof SubscriptionController> = {
  [K in Controller]: {
    type: `${typeof controllerName}:${K}`;
    handler: SubscriptionController[K];
  };
};
type ActionsObj = CreateActionsObj<'getSubscriptions' | 'cancelSubscription'>;

export type SubscriptionControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  SubscriptionControllerState
>;
export type SubscriptionControllerActions =
  | ActionsObj[keyof ActionsObj]
  | SubscriptionControllerGetStateAction;

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
   * Subscription service to use for the subscription controller.
   */
  subscriptionService: ISubscriptionService;
};

/**
 * Get the default state for the Subscription Controller.
 *
 * @returns The default state for the Subscription Controller.
 */
export function getDefaultSubscriptionControllerState(): SubscriptionControllerState {
  return {
    subscriptions: [],
  };
}

/**
 * Seedless Onboarding Controller State Metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
const subscriptionControllerMetadata: StateMetadata<SubscriptionControllerState> =
  {
    subscriptions: {
      persist: true,
      anonymous: false,
    },
  };

export class SubscriptionController extends BaseController<
  typeof controllerName,
  SubscriptionControllerState,
  SubscriptionControllerMessenger
> {
  readonly #subscriptionService: ISubscriptionService;

  /**
   * Creates a new SubscriptionController instance.
   *
   * @param options - The options for the SubscriptionController.
   * @param options.messenger - A restricted messenger.
   * @param options.state - Initial state to set on this controller.
   * @param options.subscriptionService - The subscription service for communicating with subscription server.
   */
  constructor({
    messenger,
    state,
    subscriptionService,
  }: SubscriptionControllerOptions) {
    super({
      name: controllerName,
      metadata: subscriptionControllerMetadata,
      state: {
        ...getDefaultSubscriptionControllerState(),
        ...state,
      },
      messenger,
    });

    this.#subscriptionService = subscriptionService;

    this.#registerMessageHandlers();
  }

  /**
   * Constructor helper for registering this controller's messaging system
   * actions.
   */
  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      'SubscriptionController:getSubscriptions',
      this.getSubscriptions.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'SubscriptionController:cancelSubscription',
      this.cancelSubscription.bind(this),
    );
  }

  async getSubscriptions() {
    const { subscriptions } =
      await this.#subscriptionService.getSubscriptions();

    this.update((state) => {
      state.subscriptions = subscriptions;
    });

    return subscriptions;
  }

  async cancelSubscription(request: {
    subscriptionId: string;
    type: ProductType;
  }) {
    this.#assertIsUserSubscribed({ productType: request.type });

    await this.#subscriptionService.cancelSubscription({
      subscriptionId: request.subscriptionId,
    });

    this.update((state) => {
      state.subscriptions = state.subscriptions.map((subscription) =>
        subscription.id === request.subscriptionId
          ? { ...subscription, status: 'cancelled' }
          : subscription,
      );
    });
  }

  #assertIsUserSubscribed(request: { productType: ProductType }) {
    if (
      !this.state.subscriptions.find((subscription) =>
        subscription.products.some(
          (product) => product.name === request.productType,
        ),
      )
    ) {
      throw new Error(SubscriptionControllerErrorMessage.UserNotSubscribed);
    }
  }
}
