import { Messenger } from '@metamask/messenger';
import {
  Env,
  SubscriptionService,
  SUBSCRIPTION_URL,
} from '@metamask/subscription-controller';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { subscriptionService } from './subscription-service.js';

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

describe('subscriptionService', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(subscriptionService);
  });

  it('initializes a SubscriptionService with the provided options', () => {
    const messenger = subscriptionService.getMessenger(getRootMessenger());

    const instance = subscriptionService.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(SubscriptionService);
  });

  it('defaults to the production environment when env is omitted', async () => {
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
      'AuthenticationController:getSessionProfile',
      async () => ({
        profileId: 'profile-1',
        canonicalProfileId: 'canonical-profile-1',
        metaMetricsId: 'metametrics-1',
      }),
    );
    const messenger = subscriptionService.getMessenger(rootMessenger);
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
      messenger,
      options: {
        fetchFunction,
      },
    });

    await rootMessenger.call('SubscriptionService:getSubscriptions');

    expect(fetchFunction).toHaveBeenCalledWith(
      SUBSCRIPTION_URL(Env.PRD, 'subscriptions'),
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('delegates AuthenticationController auth actions', () => {
    const parent = getRootMessenger();
    const delegateSpy = jest.spyOn(parent, 'delegate');
    const messenger = subscriptionService.getMessenger(parent);

    expect(delegateSpy).toHaveBeenCalledWith({
      messenger,
      actions: [
        'AuthenticationController:getBearerToken',
        'AuthenticationController:getSessionProfile',
      ],
    });
  });

  it('wires getBearerToken to authenticated subscription API calls', async () => {
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
      'AuthenticationController:getSessionProfile',
      async () => ({
        profileId: 'profile-1',
        canonicalProfileId: 'canonical-profile-1',
        metaMetricsId: 'metametrics-1',
      }),
    );
    const messenger = subscriptionService.getMessenger(rootMessenger);
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
      messenger,
      options: {
        env: Env.DEV,
        fetchFunction,
      },
    });

    await rootMessenger.call('SubscriptionService:getSubscriptions');

    expect(fetchFunction).toHaveBeenCalledWith(
      SUBSCRIPTION_URL(Env.DEV, 'subscriptions'),
      expect.objectContaining({
        method: 'GET',
      }),
    );
    const [, requestInit] = fetchFunction.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const headers = new globalThis.Headers(requestInit.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-bearer-token');
  });
});
