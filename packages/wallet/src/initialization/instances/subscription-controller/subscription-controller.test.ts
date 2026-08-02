import { Messenger } from '@metamask/messenger';
import {
  getDefaultSubscriptionControllerState,
  SubscriptionController,
} from '@metamask/subscription-controller';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { subscriptionService } from '../subscription-service/subscription-service.js';
import { subscriptionController } from './subscription-controller.js';

type ActionHandler = (...args: unknown[]) => unknown;

type AnyMessenger = Messenger<string>;

function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

function registerActionHandler(
  parent: RootMessenger<DefaultActions, DefaultEvents>,
  namespace: string,
  actionType: string,
  handler: ActionHandler,
): void {
  const messenger = new Messenger({
    namespace,
    parent: parent as unknown as AnyMessenger,
  });

  (
    messenger as unknown as {
      registerActionHandler(type: string, handler: ActionHandler): void;
    }
  ).registerActionHandler(actionType, handler);
}

describe('subscriptionController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      subscriptionController,
    );
  });

  it('initializes a SubscriptionController with default state', () => {
    const messenger = subscriptionController.getMessenger(getRootMessenger());

    const instance = subscriptionController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(SubscriptionController);
    expect(instance.state).toStrictEqual(
      getDefaultSubscriptionControllerState(),
    );
  });

  it('forwards the provided state to the controller', () => {
    const messenger = subscriptionController.getMessenger(getRootMessenger());

    const instance = subscriptionController.init({
      state: {
        subscriptions: [],
        customerId: 'cus_test',
        trialedProducts: [],
      },
      messenger,
      options: {},
    });

    expect(instance.state.customerId).toBe('cus_test');
  });

  it('forwards pollingInterval to the controller', () => {
    const messenger = subscriptionController.getMessenger(getRootMessenger());
    const pollingInterval = 60_000;

    const instance = subscriptionController.init({
      state: undefined,
      messenger,
      options: {
        pollingInterval,
      },
    });

    expect(instance.getIntervalLength()).toBe(pollingInterval);
  });

  it('defaults pollingInterval to five minutes', () => {
    const messenger = subscriptionController.getMessenger(getRootMessenger());

    const instance = subscriptionController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance.getIntervalLength()).toBe(5 * 60 * 1_000);
  });

  it('delegates SubscriptionService actions and performSignOut', () => {
    const parent = getRootMessenger();
    const delegateSpy = jest.spyOn(parent, 'delegate');
    const messenger = subscriptionController.getMessenger(parent);

    expect(delegateSpy).toHaveBeenCalledWith({
      messenger,
      actions: [
        'SubscriptionService:getSubscriptions',
        'SubscriptionService:cancelSubscription',
        'SubscriptionService:unCancelSubscription',
        'SubscriptionService:startSubscriptionWithCard',
        'SubscriptionService:startSubscriptionWithCrypto',
        'SubscriptionService:updatePaymentMethodCard',
        'SubscriptionService:updatePaymentMethodCrypto',
        'SubscriptionService:getSubscriptionsEligibilities',
        'SubscriptionService:submitUserEvent',
        'SubscriptionService:assignUserToCohort',
        'SubscriptionService:submitSponsorshipIntents',
        'SubscriptionService:linkRewards',
        'SubscriptionService:getPricing',
        'SubscriptionService:getBillingPortalUrl',
        'AuthenticationController:performSignOut',
      ],
    });
  });

  it('calls SubscriptionService actions through the controller messenger', async () => {
    const rootMessenger = getRootMessenger();
    registerActionHandler(
      rootMessenger,
      'AuthenticationController',
      'AuthenticationController:getBearerToken',
      async () => 'test-bearer-token',
    );
    registerActionHandler(
      rootMessenger,
      'AuthenticationController',
      'AuthenticationController:performSignOut',
      jest.fn(),
    );
    const serviceMessenger = subscriptionService.getMessenger(rootMessenger);
    const fetchFunction = jest.fn(
      async () =>
        new globalThis.Response(
          JSON.stringify({
            customerId: 'cus_1',
            subscriptions: [],
            trialedProducts: [],
          }),
          { status: 200 },
        ),
    );

    subscriptionService.init({
      state: undefined,
      messenger: serviceMessenger,
      options: {
        fetchFunction,
      },
    });

    const controllerMessenger =
      subscriptionController.getMessenger(rootMessenger);
    subscriptionController.init({
      state: undefined,
      messenger: controllerMessenger,
      options: {},
    });

    await rootMessenger.call('SubscriptionController:getSubscriptions');

    expect(fetchFunction).toHaveBeenCalled();
  });

  it('exposes its actions through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = subscriptionController.getMessenger(rootMessenger);

    subscriptionController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(rootMessenger.call('SubscriptionController:getState')).toStrictEqual(
      getDefaultSubscriptionControllerState(),
    );
  });
});
