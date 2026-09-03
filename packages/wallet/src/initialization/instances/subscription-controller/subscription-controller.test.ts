import { Messenger } from '@metamask/messenger';
import {
  Env,
  getDefaultSubscriptionControllerState,
  SubscriptionController,
  SUBSCRIPTION_URL,
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
        'SubscriptionService:getBenefits',
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
      'AuthenticationController:getSessionProfile',
      async () => ({
        profileId: 'profile-1',
        canonicalProfileId: 'canonical-profile-1',
        metaMetricsId: 'metametrics-1',
      }),
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

  it('calls SubscriptionService:getBenefits through the controller messenger', async () => {
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
            eligible: true,
            billingPeriodId: 'bp_1',
            products: {
              swaps: {
                feeBips: '0',
                capMicroUsd: 100,
                consumedMicroUsd: 0,
                remainingMicroUsd: 100,
                exhausted: false,
              },
              perps: {
                builderFeeBips: '0',
                builderCode: 'builder-code',
                capMicroUsd: 100,
                consumedMicroUsd: 0,
                remainingMicroUsd: 100,
                exhausted: false,
              },
              predict: {
                builderCode: 'builder-code',
                capTxCount: 3,
                consumedTxCount: 0,
                remainingTxCount: 3,
                exhausted: false,
              },
            },
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
      state: {
        subscriptions: [
          {
            id: 'sub_money_account',
            products: [
              {
                name: 'money_account_plus',
                currency: 'usd',
                unitAmount: 499,
                unitDecimals: 2,
              },
            ],
            currentPeriodStart: '2024-01-01T00:00:00Z',
            currentPeriodEnd: '2024-02-01T00:00:00Z',
            status: 'active',
            interval: 'month',
            paymentMethod: {
              type: 'card',
              card: {
                brand: 'visa',
                displayBrand: 'visa',
                last4: '1234',
              },
            },
            isEligibleForSupport: true,
            cancelType: 'allowed_at_period_end',
          },
        ],
        trialedProducts: [],
      },
      messenger: controllerMessenger,
      options: {},
    });

    await rootMessenger.call('SubscriptionController:getBenefits');

    expect(fetchFunction).toHaveBeenCalledWith(
      SUBSCRIPTION_URL(Env.PRD, 'benefits'),
      expect.objectContaining({ method: 'POST' }),
    );
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

  it('calls generic startSubscriptionWithCard through the root messenger', async () => {
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
    registerActionHandler(
      rootMessenger,
      'AuthenticationController',
      'AuthenticationController:performSignOut',
      jest.fn(),
    );
    const serviceMessenger = subscriptionService.getMessenger(rootMessenger);
    const fetchFunction = jest.fn(async (url: string) => {
      if (url === SUBSCRIPTION_URL(Env.PRD, 'subscriptions/card')) {
        return new globalThis.Response(
          JSON.stringify({
            checkoutSessionUrl: 'https://checkout.example.com/session/123',
          }),
          { status: 200 },
        );
      }

      return new globalThis.Response(
        JSON.stringify({
          customerId: 'cus_1',
          subscriptions: [],
          trialedProducts: [],
        }),
        { status: 200 },
      );
    });

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
      state: {
        subscriptions: [],
        trialedProducts: [],
        pricing: {
          products: [
            {
              name: 'money_account_plus',
              prices: [
                {
                  interval: 'month',
                  currency: 'usd',
                  unitAmount: 499,
                  unitDecimals: 2,
                  trialPeriodDays: 0,
                  minBillingCycles: 12,
                  minBillingCyclesForBalance: 1,
                },
              ],
            },
          ],
          paymentMethods: [],
        },
      },
      messenger: controllerMessenger,
      options: {},
    });

    const result = await rootMessenger.call(
      'SubscriptionController:startSubscriptionWithCard',
      {
        products: ['money_account_plus'],
        isTrialRequested: false,
        recurringInterval: 'month',
      },
    );

    expect(result).toStrictEqual({
      checkoutSessionUrl: 'https://checkout.example.com/session/123',
    });
    expect(fetchFunction).toHaveBeenCalledWith(
      SUBSCRIPTION_URL(Env.PRD, 'subscriptions'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchFunction).toHaveBeenCalledWith(
      SUBSCRIPTION_URL(Env.PRD, 'subscriptions/card'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('forwards dual-product initial state to the controller', () => {
    const messenger = subscriptionController.getMessenger(getRootMessenger());

    const instance = subscriptionController.init({
      state: {
        subscriptions: [
          {
            id: 'sub_shield',
            products: [
              {
                name: 'shield',
                currency: 'usd',
                unitAmount: 900,
                unitDecimals: 2,
              },
            ],
            currentPeriodStart: '2024-01-01T00:00:00Z',
            currentPeriodEnd: '2024-02-01T00:00:00Z',
            status: 'active',
            interval: 'month',
            paymentMethod: {
              type: 'card',
              card: {
                brand: 'visa',
                displayBrand: 'visa',
                last4: '1234',
              },
            },
            isEligibleForSupport: true,
            cancelType: 'allowed_at_period_end',
          },
          {
            id: 'sub_money_account',
            products: [
              {
                name: 'money_account_plus',
                currency: 'usd',
                unitAmount: 499,
                unitDecimals: 2,
              },
            ],
            currentPeriodStart: '2024-01-01T00:00:00Z',
            currentPeriodEnd: '2024-02-01T00:00:00Z',
            status: 'active',
            interval: 'month',
            paymentMethod: {
              type: 'crypto',
              crypto: {
                payerAddress: '0x1234567890123456789012345678901234567890',
                chainId: '0x8f',
                tokenSymbol: 'pvmUSD',
              },
            },
            isEligibleForSupport: false,
            cancelType: 'allowed_at_period_end',
          },
        ],
        trialedProducts: ['shield'],
      },
      messenger,
      options: {},
    });

    expect(instance.state.subscriptions).toHaveLength(2);
    expect(instance.state.trialedProducts).toStrictEqual(['shield']);
  });
});
