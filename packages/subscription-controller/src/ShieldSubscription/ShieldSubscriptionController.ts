import { BaseController } from '@metamask/base-controller';
import type { StateMetadata } from '@metamask/base-controller';

import {
  DEFAULT_INTERVAL,
  shieldSubscriptionControllerName,
} from './constants';
import type {
  ShieldSubscriptionControllerMessenger,
  ShieldSubscriptionControllerOptions,
  ShieldSubscriptionControllerState,
} from './type';
import { PRODUCT_TYPES, type Subscription } from '../types';

const shieldSubscriptionControllerMetadata: StateMetadata<ShieldSubscriptionControllerState> =
  {
    id: {
      includeInStateLogs: true,
      persist: true,
      anonymous: false,
      usedInUi: true,
    },
    status: {
      includeInStateLogs: true,
      persist: true,
      anonymous: false,
      usedInUi: true,
    },
    paymentMethod: {
      includeInStateLogs: false,
      persist: false,
      anonymous: false,
      usedInUi: false,
    },
  };

const getDefaultShieldSubscriptionControllerState =
  (): ShieldSubscriptionControllerState => ({});

export class ShieldSubscriptionController extends BaseController<
  typeof shieldSubscriptionControllerName,
  ShieldSubscriptionControllerState,
  ShieldSubscriptionControllerMessenger
> {
  #intervalId?: ReturnType<typeof setTimeout>;

  readonly #pollingInterval: number;

  constructor({
    messenger,
    state,
    pollingInterval = DEFAULT_INTERVAL,
  }: ShieldSubscriptionControllerOptions) {
    super({
      name: shieldSubscriptionControllerName,
      metadata: shieldSubscriptionControllerMetadata,
      messenger,
      state: {
        ...getDefaultShieldSubscriptionControllerState(),
        ...state,
      },
    });

    this.#pollingInterval = pollingInterval;

    this.#registerMessageHandlers();
  }

  #registerMessageHandlers() {
    this.messagingSystem.subscribe(
      'SubscriptionController:stateChange',
      this.#handleSubscriptionControllerStateChange,
      (state) => state.subscriptions,
    );
  }

  #handleSubscriptionControllerStateChange(subscriptions: Subscription[]) {
    // extract the shield subscription
    const shieldSubscription = subscriptions.find((subscription) =>
      subscription.products.some(
        (product) => product.name === PRODUCT_TYPES.SHIELD,
      ),
    );

    if (
      shieldSubscription &&
      // check if the new subscription is different from the current state
      this.#isSubscriptionDifferent(this.state, shieldSubscription)
    ) {
      this.update((state) => {
        state.id = shieldSubscription.id;
        state.status = shieldSubscription.status;
        state.paymentMethod = shieldSubscription.paymentMethod;
      });
      // start polling if not already started
      if (!this.#intervalId) {
        this.#startPolling();
      }
    } else {
      this.update((state) => {
        state.id = undefined;
        state.status = undefined;
        state.paymentMethod = undefined;
      });
      this.#stopPolling();
    }
  }

  #startPolling() {
    this.#stopPolling();
    this.#intervalId = setInterval(() => {
      // fetch the latest updates from subscription api
      this.messagingSystem.call('SubscriptionController:getSubscriptions');
    }, this.#pollingInterval);
  }

  #stopPolling() {
    if (this.#intervalId) {
      clearInterval(this.#intervalId);
      this.#intervalId = undefined;
    }
  }

  #isSubscriptionDifferent(
    oldState: ShieldSubscriptionControllerState,
    newState: ShieldSubscriptionControllerState,
  ) {
    return (
      oldState.id !== newState.id ||
      oldState.status !== newState.status ||
      oldState.paymentMethod !== newState.paymentMethod
    );
  }
}
