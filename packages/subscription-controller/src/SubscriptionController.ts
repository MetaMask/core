import { BaseController, type StateMetadata } from '@metamask/base-controller';

import {
  controllerName,
  Env,
  SubscriptionControllerErrorMessage,
} from './constants';
// import { projectLogger, createModuleLogger } from './logger';
import { SubscriptionService } from './SubscriptionService';
import type {
  ISubscriptionService,
  PricingResponse,
  SubscriptionControllerConfig,
  SubscriptionControllerMessenger,
  SubscriptionControllerOptions,
  SubscriptionControllerState,
} from './types';

// const log = createModuleLogger(projectLogger, controllerName);

/**
 * Get the default state for the Subscription Controller.
 *
 * @returns The default state for the Subscription Controller.
 */
export function getDefaultSubscriptionControllerState(): SubscriptionControllerState {
  return {};
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
    subscription: {
      persist: true,
      anonymous: true,
    },
    pendingPaymentTransactions: {
      persist: true,
      anonymous: true,
    },
    authTokenRef: {
      persist: true,
      anonymous: true,
    },
  };

export class SubscriptionController extends BaseController<
  typeof controllerName,
  SubscriptionControllerState,
  SubscriptionControllerMessenger
> {
  readonly #subscriptionService: ISubscriptionService;

  readonly #config: SubscriptionControllerConfig = {
    env: Env.PRD,
  };

  /**
   * Creates a new SubscriptionController instance.
   *
   * @param options - The options for the SubscriptionController.
   * @param options.messenger - A restricted messenger.
   * @param options.state - Initial state to set on this controller.
   * @param options.config - Configuration for this controller.
   * @param options.subscriptionService - The subscription service for communicating with subscription server.
   */
  constructor({
    messenger,
    state,
    config,
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

    this.#config = {
      ...this.#config,
      ...config,
    };

    this.#subscriptionService =
      subscriptionService ??
      new SubscriptionService({
        env: this.#config.env,
        auth: {
          getAccessToken: () =>
            this.messagingSystem.call(
              'AuthenticationController:getBearerToken',
            ),
        },
      });
  }

  /**
   * Gets the pricing information from the subscription service.
   *
   * @returns The pricing information.
   */
  async getPricing(): Promise<PricingResponse> {
    return await this.#subscriptionService.getPricing();
  }

  /**
   * Gets the subscription information from the subscription service.
   *
   * @returns The subscription information.
   */
  async getSubscription() {
    const subscription = await this.#subscriptionService.getSubscription();

    this.update((state) => {
      state.subscription = subscription ?? undefined;
    });

    return subscription;
  }

  async cancelSubscription(subscriptionId: string) {
    this.#assertIsUserSubscribed();

    await this.#subscriptionService.cancelSubscription({ subscriptionId });
  }

  // #assertIsUserNotSubscribed() {
  //   if (this.state.subscription) {
  //     throw new Error(SubscriptionControllerErrorMessage.UserAlreadySubscribed);
  //   }
  // }

  #assertIsUserSubscribed() {
    if (!this.state.subscription) {
      throw new Error(SubscriptionControllerErrorMessage.UserNotSubscribed);
    }
  }
}
