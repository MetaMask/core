import { BaseController, type StateMetadata } from '@metamask/base-controller';

import {
  controllerName,
  type Env,
  SubscriptionControllerErrorMessage,
} from './constants';
import { SubscriptionService } from './SubscriptionService';
import type {
  ProductType,
  ISubscriptionService,
  SubscriptionControllerMessenger,
  SubscriptionControllerOptions,
  SubscriptionControllerState,
} from './types';

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
    pendingPaymentTransactions: {
      persist: true,
      anonymous: false,
    },
    authTokenRef: {
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

  readonly #env: Env;

  /**
   * Creates a new SubscriptionController instance.
   *
   * @param options - The options for the SubscriptionController.
   * @param options.messenger - A restricted messenger.
   * @param options.state - Initial state to set on this controller.
   * @param options.env - Environment for this controller.
   * @param options.subscriptionService - The subscription service for communicating with subscription server.
   */
  constructor({
    messenger,
    state,
    env,
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

    this.#env = env;

    this.#subscriptionService =
      subscriptionService ??
      new SubscriptionService({
        env: this.#env,
        auth: {
          getAccessToken: () =>
            this.messagingSystem.call(
              'AuthenticationController:getBearerToken',
            ),
        },
      });
  }

  async getSubscription() {
    const { subscriptions } =
      await this.#subscriptionService.getSubscriptions();

    this.update((state) => {
      state.subscriptions = subscriptions ?? [];
    });

    return subscriptions;
  }

  async cancelSubscription(request: {
    subscriptionId: string;
    type: ProductType;
  }) {
    this.#assertIsUserSubscribed({ productType: request.type });

    await this.#subscriptionService.cancelSubscription(request);
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
