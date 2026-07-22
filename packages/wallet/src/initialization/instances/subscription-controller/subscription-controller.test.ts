import { Messenger } from '@metamask/messenger';
import {
  Env,
  getDefaultSubscriptionControllerState,
  SubscriptionController,
} from '@metamask/subscription-controller';
import type { ISubscriptionService } from '@metamask/subscription-controller';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
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

function createMockSubscriptionService(): jest.Mocked<ISubscriptionService> {
  return {
    getSubscriptions: jest.fn(),
    getPricing: jest.fn(),
    cancelSubscription: jest.fn(),
    unCancelSubscription: jest.fn(),
    startSubscriptionWithCard: jest.fn(),
    startSubscriptionWithCrypto: jest.fn(),
    getBillingPortalUrl: jest.fn(),
    updatePaymentMethodCard: jest.fn(),
    updatePaymentMethodCrypto: jest.fn(),
    getSubscriptionsEligibilities: jest.fn(),
    submitSponsorshipIntents: jest.fn(),
    submitUserEvent: jest.fn(),
    assignUserToCohort: jest.fn(),
    linkRewards: jest.fn(),
  };
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
      options: {
        env: Env.DEV,
        fetchFunction: globalThis.fetch,
      },
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
      options: {
        env: Env.DEV,
        fetchFunction: globalThis.fetch,
      },
    });

    expect(instance.state.customerId).toBe('cus_test');
  });

  it('constructs a default SubscriptionService from options', () => {
    const messenger = subscriptionController.getMessenger(getRootMessenger());

    const instance = subscriptionController.init({
      state: undefined,
      messenger,
      options: {
        env: Env.DEV,
        fetchFunction: globalThis.fetch,
      },
    });

    expect(instance).toBeInstanceOf(SubscriptionController);
  });

  it('uses a provided subscriptionService override', () => {
    const messenger = subscriptionController.getMessenger(getRootMessenger());
    const mockService = createMockSubscriptionService();

    const instance = subscriptionController.init({
      state: undefined,
      messenger,
      options: {
        subscriptionService: mockService,
        env: Env.DEV,
        fetchFunction: globalThis.fetch,
      },
    });

    expect(instance).toBeInstanceOf(SubscriptionController);
  });

  it('forwards pollingInterval to the controller', () => {
    const messenger = subscriptionController.getMessenger(getRootMessenger());
    const pollingInterval = 60_000;

    const instance = subscriptionController.init({
      state: undefined,
      messenger,
      options: {
        env: Env.DEV,
        fetchFunction: globalThis.fetch,
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
      options: {
        env: Env.DEV,
        fetchFunction: globalThis.fetch,
      },
    });

    expect(instance.getIntervalLength()).toBe(5 * 60 * 1_000);
  });

  it('wires default getAccessToken to AuthenticationController:getBearerToken', async () => {
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
    const messenger = subscriptionController.getMessenger(rootMessenger);
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

    subscriptionController.init({
      state: undefined,
      messenger,
      options: {
        env: Env.DEV,
        fetchFunction,
      },
    });

    await rootMessenger.call('SubscriptionController:getSubscriptions');

    expect(fetchFunction).toHaveBeenCalled();
    const [, requestInit] = fetchFunction.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const headers = new globalThis.Headers(requestInit.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-bearer-token');
  });

  it('delegates AuthenticationController actions and events', () => {
    const parent = getRootMessenger();
    const delegateSpy = jest.spyOn(parent, 'delegate');
    const messenger = subscriptionController.getMessenger(parent);

    expect(delegateSpy).toHaveBeenCalledWith({
      messenger,
      actions: [
        'AuthenticationController:getBearerToken',
        'AuthenticationController:performSignOut',
      ],
      events: ['AuthenticationController:stateChange'],
    });
  });

  it('exposes its actions through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = subscriptionController.getMessenger(rootMessenger);

    subscriptionController.init({
      state: undefined,
      messenger,
      options: {
        env: Env.DEV,
        fetchFunction: globalThis.fetch,
      },
    });

    expect(
      rootMessenger.call('SubscriptionController:getState'),
    ).toStrictEqual(getDefaultSubscriptionControllerState());
  });
});
