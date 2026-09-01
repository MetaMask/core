import { deriveStateFromMetadata } from '@metamask/base-controller';
import { MOCK_ANY_NAMESPACE, Messenger } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import { flushPromises, jestAdvanceTime } from '../../../tests/helpers.js';
import {
  getDefaultMoneyAccountSubscriptionControllerState,
  MoneyAccountSubscriptionController,
} from './MoneyAccountSubscriptionController.js';
import type {
  MoneyAccountSubscriptionControllerMessenger,
  MoneyAccountSubscriptionControllerState,
} from './MoneyAccountSubscriptionController.js';
import { selectHasEntitlement, selectIsActiveSubscriber } from './selectors.js';
import {
  Env,
  getProductEntitlementsClaimKey,
  MoneyAccountFeature,
} from './types.js';

type AllActions = MessengerActions<MoneyAccountSubscriptionControllerMessenger>;
type AllEvents = MessengerEvents<MoneyAccountSubscriptionControllerMessenger>;
type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const claimKey = getProductEntitlementsClaimKey(Env.PRD);
const MONEY_ACCOUNT_PLUS = 'money_account_plus';
const ACTIVE_SUBSCRIPTION_STATUS = 'active';
const CRYPTO_PAYMENT_TYPE = 'crypto';
const MONTH_RECURRING_INTERVAL = 'month';
const ALLOWED_AT_PERIOD_END = 'allowed_at_period_end';

function createBearerToken(payload: unknown): string {
  return [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    ),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.');
}

function createMoneyAccountClaim(overrides = {}): {
  plan: string;
  entitlements: {
    swapFeeWaiver: boolean;
    perpsFeeWaiver: boolean;
    predictFreeTx: boolean;
    premiumApy: boolean;
  };
} {
  return {
    plan: 'premium',
    entitlements: {
      swapFeeWaiver: true,
      perpsFeeWaiver: false,
      predictFreeTx: true,
      premiumApy: false,
    },
    ...overrides,
  };
}

function createSubscriptionState(status = ACTIVE_SUBSCRIPTION_STATUS): {
  customerId: string;
  lastSubscription: undefined;
  pricing: undefined;
  rewardAccountId: undefined;
  subscriptions: {
    id: string;
    products: {
      name: typeof MONEY_ACCOUNT_PLUS;
      currency: 'usd';
      unitAmount: number;
      unitDecimals: number;
    }[];
    currentPeriodStart: string;
    currentPeriodEnd: string;
    status: string;
    interval: typeof MONTH_RECURRING_INTERVAL;
    paymentMethod: {
      type: typeof CRYPTO_PAYMENT_TYPE;
      crypto: {
        chainId: string;
        payerAddress: string;
        tokenSymbol: string;
      };
    };
    isEligibleForSupport: boolean;
    cancelType: typeof ALLOWED_AT_PERIOD_END;
  }[];
  trialedProducts: [typeof MONEY_ACCOUNT_PLUS];
} {
  return {
    customerId: 'cus_1',
    lastSubscription: undefined,
    pricing: undefined,
    rewardAccountId: undefined,
    subscriptions: [
      {
        id: 'sub_money_account',
        products: [
          {
            name: MONEY_ACCOUNT_PLUS,
            currency: 'usd',
            unitAmount: 499,
            unitDecimals: 2,
          },
        ],
        currentPeriodStart: '2026-01-01T00:00:00.000Z',
        currentPeriodEnd: '2026-02-01T00:00:00.000Z',
        status,
        interval: MONTH_RECURRING_INTERVAL,
        paymentMethod: {
          type: CRYPTO_PAYMENT_TYPE,
          crypto: {
            chainId: '0x1',
            payerAddress: '0x0000000000000000000000000000000000000001',
            tokenSymbol: 'USDC',
          },
        },
        isEligibleForSupport: true,
        cancelType: ALLOWED_AT_PERIOD_END,
      },
    ],
    trialedProducts: [MONEY_ACCOUNT_PLUS],
  };
}

function publishAuthenticationState(
  rootMessenger: RootMessenger,
  state: {
    isSignedIn: boolean;
    srpSessionData?: Record<string, unknown>;
  },
): void {
  rootMessenger.publish(
    'AuthenticationController:stateChanged',
    state as never,
    [] as never,
  );
}

function publishSubscriptionState(
  rootMessenger: RootMessenger,
  status = ACTIVE_SUBSCRIPTION_STATUS,
): void {
  publishSubscriptionPayload(rootMessenger, createSubscriptionState(status));
}

function publishSubscriptionPayload(
  rootMessenger: RootMessenger,
  state: unknown,
): void {
  rootMessenger.publish(
    'SubscriptionController:stateChanged',
    state as never,
    [] as never,
  );
}

function createController(options?: {
  state?: Partial<MoneyAccountSubscriptionControllerState>;
  authenticationState?: {
    isSignedIn: boolean;
    srpSessionData?: Record<string, unknown>;
  };
  getBearerTokenImplementation?: () => Promise<string>;
  performSignOutImplementation?: () => void;
  subscriptionState?: unknown;
}): {
  controller: MoneyAccountSubscriptionController;
  getBearerToken: jest.Mock<Promise<string>, []>;
  getAuthenticationState: jest.Mock<
    {
      isSignedIn: boolean;
      srpSessionData?: Record<string, unknown>;
    },
    []
  >;
  getSubscriptionState: jest.Mock<unknown, []>;
  messenger: MoneyAccountSubscriptionControllerMessenger;
  performSignOut: jest.Mock<void, []>;
  rootMessenger: RootMessenger;
} {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const messenger = new Messenger({
    namespace: 'MoneyAccountSubscriptionController',
    parent: rootMessenger,
  }) as MoneyAccountSubscriptionControllerMessenger;

  rootMessenger.delegate({
    messenger,
    actions: [
      'AuthenticationController:getState',
      'AuthenticationController:getBearerToken',
      'AuthenticationController:performSignOut',
      'SubscriptionController:getState',
    ],
    events: [
      'AuthenticationController:stateChanged',
      'SubscriptionController:stateChanged',
    ],
  });

  const getAuthenticationState = jest.fn(() => {
    return options?.authenticationState ?? { isSignedIn: false };
  });
  const getSubscriptionState = jest.fn(() => {
    return (
      options?.subscriptionState ?? {
        subscriptions: [],
        trialedProducts: [],
      }
    );
  });
  const getBearerToken = jest.fn<Promise<string>, []>();
  const performSignOut = jest.fn<void, []>();

  if (options?.getBearerTokenImplementation) {
    getBearerToken.mockImplementation(options.getBearerTokenImplementation);
  }
  if (options?.performSignOutImplementation) {
    performSignOut.mockImplementation(options.performSignOutImplementation);
  }

  rootMessenger.registerActionHandler(
    'AuthenticationController:getState',
    getAuthenticationState,
  );
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    getBearerToken,
  );
  rootMessenger.registerActionHandler(
    'SubscriptionController:getState',
    getSubscriptionState,
  );
  rootMessenger.registerActionHandler(
    'AuthenticationController:performSignOut',
    performSignOut,
  );

  const controller = new MoneyAccountSubscriptionController({
    messenger,
    env: Env.PRD,
    state: options?.state,
  });

  return {
    controller,
    getAuthenticationState,
    getBearerToken,
    getSubscriptionState,
    messenger,
    performSignOut,
    rootMessenger,
  };
}

function createDeferred<DeferredValue>(): {
  promise: Promise<DeferredValue>;
  resolve: (value: DeferredValue) => void;
} {
  let resolve: (value: DeferredValue) => void = () => undefined;

  const promise = new Promise<DeferredValue>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return {
    promise,
    resolve,
  };
}

describe('MoneyAccountSubscriptionController', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the default state and persists all public fields', () => {
    const { controller } = createController();

    expect(getDefaultMoneyAccountSubscriptionControllerState()).toStrictEqual({
      entitlements: null,
      isSubscriber: false,
      lastHydratedAt: null,
      plan: null,
    });
    expect(
      deriveStateFromMetadata(controller.state, controller.metadata, 'persist'),
    ).toStrictEqual(getDefaultMoneyAccountSubscriptionControllerState());
  });

  it('hydrates on bootstrap when authentication is already signed in', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const claim = createMoneyAccountClaim();
    const { controller, getAuthenticationState, getBearerToken } =
      createController({
        authenticationState: {
          isSignedIn: true,
          srpSessionData: { primary: {} },
        },
        getBearerTokenImplementation: async () =>
          createBearerToken({
            [claimKey]: {
              moneyAccountPlus: claim,
            },
          }),
      });

    await flushPromises();

    expect(getAuthenticationState).toHaveBeenCalledTimes(1);
    expect(getBearerToken).toHaveBeenCalledTimes(1);
    expect(controller.state).toStrictEqual({
      entitlements: claim.entitlements,
      isSubscriber: true,
      lastHydratedAt: Date.now(),
      plan: claim.plan,
    });
  });

  it('stays cleared on bootstrap when authentication is signed out', async () => {
    const { controller, getAuthenticationState, getBearerToken } =
      createController({
        authenticationState: {
          isSignedIn: false,
        },
      });

    await flushPromises();

    expect(getAuthenticationState).toHaveBeenCalledTimes(1);
    expect(getBearerToken).not.toHaveBeenCalled();
    expect(controller.state).toStrictEqual(
      getDefaultMoneyAccountSubscriptionControllerState(),
    );
  });

  it('fails closed during deferred bootstrap validation of persisted entitled state', async () => {
    const deferredToken = createDeferred<string>();
    const persistedState: Partial<MoneyAccountSubscriptionControllerState> = {
      entitlements: {
        swapFeeWaiver: true,
        perpsFeeWaiver: true,
        predictFreeTx: true,
        premiumApy: true,
      },
      isSubscriber: true,
      lastHydratedAt: 123,
      plan: 'persisted',
    };

    const { controller } = createController({
      state: persistedState,
      authenticationState: {
        isSignedIn: true,
        srpSessionData: { primary: {} },
      },
      getBearerTokenImplementation: () => deferredToken.promise,
    });

    expect(controller.state).toStrictEqual(
      getDefaultMoneyAccountSubscriptionControllerState(),
    );
    expect(selectIsActiveSubscriber(controller.state)).toBe(false);
    expect(
      selectHasEntitlement(controller.state, MoneyAccountFeature.SwapFeeWaiver),
    ).toBe(false);

    await Promise.resolve();

    expect(controller.state).toStrictEqual(
      getDefaultMoneyAccountSubscriptionControllerState(),
    );

    deferredToken.resolve(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'validated' }),
        },
      }),
    );
    await flushPromises();

    expect(controller.state.plan).toBe('validated');
    expect(selectIsActiveSubscriber(controller.state)).toBe(true);
  });

  it('hydrates state from the bearer token when authentication signs in', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const { controller, getBearerToken, rootMessenger } = createController();
    const claim = createMoneyAccountClaim();
    getBearerToken.mockResolvedValue(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: claim,
        },
      }),
    );

    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    expect(getBearerToken).toHaveBeenCalledTimes(1);
    expect(controller.state).toStrictEqual({
      entitlements: claim.entitlements,
      isSubscriber: true,
      lastHydratedAt: Date.now(),
      plan: claim.plan,
    });
  });

  it('clears state on authentication sign-out without fetching a token', async () => {
    const { controller, getBearerToken, rootMessenger } = createController({
      state: {
        entitlements: {
          swapFeeWaiver: true,
          perpsFeeWaiver: true,
          predictFreeTx: true,
          premiumApy: true,
        },
        isSubscriber: true,
        lastHydratedAt: 123,
        plan: 'premium',
      },
    });

    publishAuthenticationState(rootMessenger, {
      isSignedIn: false,
    });
    await flushPromises();

    expect(getBearerToken).not.toHaveBeenCalled();
    expect(controller.state).toStrictEqual(
      getDefaultMoneyAccountSubscriptionControllerState(),
    );
  });

  it('rehydrates from the bearer token when subscription state changes', async () => {
    const { controller, getBearerToken, rootMessenger } = createController();
    const initialClaim = createMoneyAccountClaim();
    const refreshedClaim = createMoneyAccountClaim({
      entitlements: {
        swapFeeWaiver: false,
        perpsFeeWaiver: true,
        predictFreeTx: false,
        premiumApy: true,
      },
    });

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: initialClaim,
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: refreshedClaim,
        },
      }),
    );

    publishSubscriptionState(rootMessenger);
    await flushPromises();

    expect(getBearerToken).toHaveBeenCalledTimes(1);
    expect(controller.state.entitlements).toStrictEqual(
      refreshedClaim.entitlements,
    );
  });

  it('forces a fresh JWT only once during a sign-out/sign-in refresh cycle and throttles repeated refreshes', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();
    const initialClaim = createMoneyAccountClaim();
    const refreshedClaim = createMoneyAccountClaim({
      plan: 'pro',
    });

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: initialClaim,
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    performSignOut.mockImplementation(() => {
      publishAuthenticationState(rootMessenger, {
        isSignedIn: false,
      });
    });
    getBearerToken.mockImplementation(async () => {
      publishAuthenticationState(rootMessenger, {
        isSignedIn: true,
        srpSessionData: { primary: { refreshed: true } },
      });

      return createBearerToken({
        [claimKey]: {
          moneyAccountPlus: refreshedClaim,
        },
      });
    });

    await controller.forceRefresh();
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(1);
    expect(getBearerToken).toHaveBeenCalledTimes(1);
    expect(controller.state.plan).toBe('pro');

    await controller.forceRefresh();
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(1);
    expect(getBearerToken).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(10_001);

    await controller.forceRefresh();
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(2);
    expect(getBearerToken).toHaveBeenCalledTimes(2);
  });

  it('polls while a trading surface is active only for signed-in subscribers', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    performSignOut.mockImplementation(() => undefined);
    getBearerToken.mockResolvedValue(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );

    controller.startEntitlementRefresh();
    await jestAdvanceTime({ duration: 0 });

    expect(performSignOut).toHaveBeenCalledTimes(1);
    expect(getBearerToken).toHaveBeenCalledTimes(1);
    expect(controller.state.isSubscriber).toBe(true);

    getBearerToken.mockClear();
    await jestAdvanceTime({ duration: 60_000 });
    expect(getBearerToken).toHaveBeenCalledTimes(1);

    controller.stopEntitlementRefresh();
    getBearerToken.mockClear();
    await jestAdvanceTime({ duration: 60_000 });
    expect(getBearerToken).not.toHaveBeenCalled();
  });

  it('does not poll while active when the current state is not entitled', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(createBearerToken({}));
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    performSignOut.mockImplementation(() => undefined);

    controller.startEntitlementRefresh();
    await jestAdvanceTime({ duration: 60_000 });

    expect(controller.state.isSubscriber).toBe(false);
    expect(performSignOut).not.toHaveBeenCalled();
    expect(getBearerToken).not.toHaveBeenCalled();

    controller.stopEntitlementRefresh();
  });

  it('skips direct poll execution while signed out', async () => {
    const { controller, getBearerToken } = createController();

    await controller._executePoll();

    expect(getBearerToken).not.toHaveBeenCalled();
  });

  it('starts polling after a later sign-in when the trading surface is already active', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

    const { controller, getBearerToken, rootMessenger } = createController();

    controller.startEntitlementRefresh();
    await jestAdvanceTime({ duration: 60_000 });

    expect(getBearerToken).not.toHaveBeenCalled();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    getBearerToken.mockResolvedValue(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'polled' }),
        },
      }),
    );
    await jestAdvanceTime({ duration: 0 });

    expect(getBearerToken).toHaveBeenCalledTimes(1);

    getBearerToken.mockClear();
    await jestAdvanceTime({ duration: 60_000 });
    expect(getBearerToken).toHaveBeenCalledTimes(1);

    controller.stopEntitlementRefresh();
  });

  it('stops polling on entitlement loss and restarts when entitlement returns while the surface stays active', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    performSignOut.mockImplementation(() => undefined);
    controller.startEntitlementRefresh();
    getBearerToken.mockClear();
    getBearerToken.mockResolvedValue(createBearerToken({}));
    await jestAdvanceTime({ duration: 0 });

    expect(controller.state.isSubscriber).toBe(false);

    getBearerToken.mockClear();
    await jestAdvanceTime({ duration: 60_000 });
    expect(getBearerToken).not.toHaveBeenCalled();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'returned' }),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: { returned: true } },
    });
    await flushPromises();

    getBearerToken.mockClear();
    getBearerToken.mockResolvedValue(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'repolled' }),
        },
      }),
    );
    await jestAdvanceTime({ duration: 0 });

    expect(getBearerToken).toHaveBeenCalledTimes(1);

    getBearerToken.mockClear();
    await jestAdvanceTime({ duration: 60_000 });
    expect(getBearerToken).toHaveBeenCalledTimes(1);

    controller.stopEntitlementRefresh();
    getBearerToken.mockClear();
    await jestAdvanceTime({ duration: 60_000 });
    expect(getBearerToken).not.toHaveBeenCalled();
  });

  it('clears state through the exposed messenger action', () => {
    const { controller, messenger } = createController({
      state: {
        entitlements: {
          swapFeeWaiver: true,
          perpsFeeWaiver: true,
          predictFreeTx: true,
          premiumApy: true,
        },
        isSubscriber: true,
        lastHydratedAt: 123,
        plan: 'premium',
      },
    });

    messenger.call('MoneyAccountSubscriptionController:clearState');

    expect(controller.state).toStrictEqual(
      getDefaultMoneyAccountSubscriptionControllerState(),
    );
  });

  it('ignores subscription and force refresh requests while signed out', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

    const { controller, getBearerToken, rootMessenger } = createController();

    publishSubscriptionState(rootMessenger);
    await controller.forceRefresh();
    controller.startEntitlementRefresh();
    await jestAdvanceTime({ duration: 0 });

    expect(getBearerToken).not.toHaveBeenCalled();

    controller.stopEntitlementRefresh();
  });

  it('does not create duplicate polling loops when refresh is started twice', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    performSignOut.mockImplementation(() => undefined);
    getBearerToken.mockResolvedValue(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'refreshed' }),
        },
      }),
    );

    controller.startEntitlementRefresh();
    controller.startEntitlementRefresh();
    await jestAdvanceTime({ duration: 0 });

    expect(getBearerToken).toHaveBeenCalledTimes(1);

    controller.stopEntitlementRefresh();
  });

  it('allows stopping polling before polling has started', () => {
    const { controller } = createController();

    expect(() => controller.stopEntitlementRefresh()).not.toThrow();
  });

  it('coalesces a second force refresh onto the in-flight refresh promise', async () => {
    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    const deferred = createDeferred<string>();
    getBearerToken.mockClear();
    performSignOut.mockImplementation(() => undefined);
    getBearerToken.mockReturnValue(deferred.promise);

    const firstRefresh = controller.forceRefresh();
    await Promise.resolve();
    const secondRefresh = controller.forceRefresh();

    expect(performSignOut).toHaveBeenCalledTimes(1);
    expect(getBearerToken).toHaveBeenCalledTimes(1);

    deferred.resolve(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'coalesced' }),
        },
      }),
    );

    await firstRefresh;
    await secondRefresh;

    expect(controller.state.plan).toBe('coalesced');
  });

  it('does not queue another forced refresh while one is already active', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    const deferredToken = createDeferred<string>();
    getBearerToken.mockClear();
    performSignOut.mockImplementation(() => undefined);
    getBearerToken.mockReturnValue(deferredToken.promise);

    const firstRefresh = controller.forceRefresh();
    await Promise.resolve();

    expect(performSignOut).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(10_001);
    const secondRefresh = controller.forceRefresh();

    deferredToken.resolve(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'forced-once' }),
        },
      }),
    );

    await firstRefresh;
    await secondRefresh;

    expect(performSignOut).toHaveBeenCalledTimes(1);
    expect(getBearerToken).toHaveBeenCalledTimes(1);
  });

  it('runs a forced refresh after an in-flight normal hydration completes', async () => {
    const deferredNormalToken = createDeferred<string>();
    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockReturnValueOnce(deferredNormalToken.promise);
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await Promise.resolve();

    getBearerToken.mockImplementationOnce(async () =>
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'forced' }),
        },
      }),
    );

    const forceRefresh = controller.forceRefresh();

    deferredNormalToken.resolve(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'normal' }),
        },
      }),
    );

    await forceRefresh;

    expect(performSignOut).toHaveBeenCalledTimes(1);
    expect(getBearerToken).toHaveBeenCalledTimes(2);
    expect(controller.state.plan).toBe('forced');
  });

  it('cancels a queued forced refresh after a later external sign-out', async () => {
    const deferredNormalToken = createDeferred<string>();
    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockReturnValueOnce(deferredNormalToken.promise);
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await Promise.resolve();

    const forceRefresh = controller.forceRefresh();
    publishAuthenticationState(rootMessenger, {
      isSignedIn: false,
    });

    deferredNormalToken.resolve(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'stale' }),
        },
      }),
    );

    await forceRefresh;
    await flushPromises();

    expect(performSignOut).not.toHaveBeenCalled();
    expect(getBearerToken).toHaveBeenCalledTimes(1);
    expect(controller.state).toStrictEqual(
      getDefaultMoneyAccountSubscriptionControllerState(),
    );
  });

  it('does not apply an in-flight forced token after a newer signed-in auth update arrives', async () => {
    const deferredForcedToken = createDeferred<string>();
    const deferredLatestToken = createDeferred<string>();
    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'initial' }),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    performSignOut.mockImplementation(() => undefined);
    getBearerToken.mockReturnValueOnce(deferredForcedToken.promise);
    getBearerToken.mockReturnValueOnce(deferredLatestToken.promise);

    const forceRefresh = controller.forceRefresh();
    await Promise.resolve();

    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: { latest: true } },
    });
    await Promise.resolve();

    deferredForcedToken.resolve(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'stale-force' }),
        },
      }),
    );
    await Promise.resolve();

    expect(controller.state.plan).toBe('initial');

    deferredLatestToken.resolve(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'latest' }),
        },
      }),
    );

    await forceRefresh;
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(1);
    expect(getBearerToken).toHaveBeenCalledTimes(3);
    expect(controller.state.plan).toBe('latest');
  });

  it('drops a stale queued force refresh without losing a newer normal hydration', async () => {
    const deferredNormalToken = createDeferred<string>();
    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockReturnValueOnce(deferredNormalToken.promise);
    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'latest' }),
        },
      }),
    );

    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await Promise.resolve();

    const forceRefresh = controller.forceRefresh();
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: { changed: true } },
    });

    deferredNormalToken.resolve(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'stale' }),
        },
      }),
    );

    await forceRefresh;
    await flushPromises();

    expect(performSignOut).not.toHaveBeenCalled();
    expect(getBearerToken).toHaveBeenCalledTimes(2);
    expect(controller.state.plan).toBe('latest');
  });

  it('does not apply a stale token result after a later sign-out', async () => {
    const deferredToken = createDeferred<string>();
    const { controller, getBearerToken, rootMessenger } = createController();

    getBearerToken.mockReturnValueOnce(deferredToken.promise);
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await Promise.resolve();

    publishAuthenticationState(rootMessenger, {
      isSignedIn: false,
    });

    deferredToken.resolve(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );

    await flushPromises();

    expect(getBearerToken).toHaveBeenCalledTimes(1);
    expect(controller.state).toStrictEqual(
      getDefaultMoneyAccountSubscriptionControllerState(),
    );
  });

  it('eventually hydrates the latest token if sign-in changes while an older hydration is in flight', async () => {
    const deferredFirstToken = createDeferred<string>();
    const { controller, getBearerToken, rootMessenger } = createController();

    getBearerToken.mockReturnValueOnce(deferredFirstToken.promise);
    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'latest' }),
        },
      }),
    );

    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await Promise.resolve();

    publishAuthenticationState(rootMessenger, {
      isSignedIn: false,
    });
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: { refreshed: true } },
    });

    deferredFirstToken.resolve(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'stale' }),
        },
      }),
    );

    await flushPromises();

    expect(getBearerToken).toHaveBeenCalledTimes(2);
    expect(controller.state.plan).toBe('latest');
  });

  it('does not apply a forced token result if authentication signs out again before it resolves', async () => {
    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    performSignOut.mockImplementation(() => {
      publishAuthenticationState(rootMessenger, {
        isSignedIn: false,
      });
    });
    getBearerToken.mockImplementationOnce(async () => {
      publishAuthenticationState(rootMessenger, {
        isSignedIn: true,
        srpSessionData: { primary: { refreshed: true } },
      });
      publishAuthenticationState(rootMessenger, {
        isSignedIn: false,
      });

      return createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'stale-force' }),
        },
      });
    });

    await controller.forceRefresh();
    await flushPromises();

    expect(controller.state).toStrictEqual(
      getDefaultMoneyAccountSubscriptionControllerState(),
    );
  });

  it('rejects a forced refresh failure after the forced sign-in is already observed', async () => {
    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    performSignOut.mockImplementation(() => {
      publishAuthenticationState(rootMessenger, {
        isSignedIn: false,
      });
    });
    getBearerToken.mockImplementationOnce(async () => {
      publishAuthenticationState(rootMessenger, {
        isSignedIn: true,
        srpSessionData: { primary: { refreshed: true } },
      });

      throw new Error('forced refresh failed');
    });

    await expect(controller.forceRefresh()).rejects.toThrow(
      'forced refresh failed',
    );
  });

  it('hydrates on a later normal sign-in after performSignOut fails during force refresh', async () => {
    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    performSignOut.mockImplementationOnce(() => {
      throw new Error('performSignOut failed');
    });

    await expect(controller.forceRefresh()).rejects.toThrow(
      'performSignOut failed',
    );

    publishAuthenticationState(rootMessenger, {
      isSignedIn: false,
    });
    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'recovered' }),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: { recovered: true } },
    });
    await flushPromises();

    expect(controller.state.plan).toBe('recovered');
  });

  it('hydrates on a later normal sign-in after getBearerToken fails during force refresh', async () => {
    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    performSignOut.mockImplementationOnce(() => {
      publishAuthenticationState(rootMessenger, {
        isSignedIn: false,
      });
    });
    getBearerToken.mockRejectedValueOnce(new Error('getBearerToken failed'));

    await expect(controller.forceRefresh()).rejects.toThrow(
      'getBearerToken failed',
    );

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'recovered' }),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: { recovered: true } },
    });
    await flushPromises();

    expect(controller.state.plan).toBe('recovered');
  });

  it('ignores non-object subscription lifecycle payloads', async () => {
    const { getBearerToken, rootMessenger } = createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    rootMessenger.publish(
      'SubscriptionController:stateChanged',
      'invalid-state' as never,
      [] as never,
    );
    await flushPromises();

    expect(getBearerToken).not.toHaveBeenCalled();
  });

  it('does not force refresh on the first unrelated subscription event after bootstrap', async () => {
    const { getBearerToken, performSignOut, rootMessenger } = createController({
      subscriptionState: {
        subscriptions: [],
        trialedProducts: [],
      },
    });

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    performSignOut.mockImplementation(() => undefined);

    publishSubscriptionPayload(rootMessenger, {
      subscriptions: [],
      trialedProducts: [],
    });
    await flushPromises();

    expect(performSignOut).not.toHaveBeenCalled();
    expect(getBearerToken).not.toHaveBeenCalled();
  });

  it('forces refresh on the first meaningful subscription change after bootstrap', async () => {
    const { getBearerToken, performSignOut, rootMessenger } = createController({
      subscriptionState: {
        subscriptions: [],
        trialedProducts: [],
      },
    });

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    performSignOut.mockImplementation(() => undefined);
    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'changed' }),
        },
      }),
    );

    publishSubscriptionState(rootMessenger);
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(1);
    expect(getBearerToken).toHaveBeenCalledTimes(1);
  });

  it('forces refresh on a later meaningful subscription change after bootstrap', async () => {
    const { getBearerToken, performSignOut, rootMessenger } = createController({
      subscriptionState: createSubscriptionState(),
    });

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    performSignOut.mockImplementation(() => undefined);
    publishSubscriptionState(rootMessenger);
    await flushPromises();

    expect(performSignOut).not.toHaveBeenCalled();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'later-change' }),
        },
      }),
    );
    publishSubscriptionState(rootMessenger, 'canceled');
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(1);
    expect(getBearerToken).toHaveBeenCalledTimes(1);
  });

  it('ignores subscription lifecycle payloads without a subscriptions array', async () => {
    const { getBearerToken, rootMessenger } = createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    rootMessenger.publish(
      'SubscriptionController:stateChanged',
      { subscriptions: 'invalid' } as never,
      [] as never,
    );
    await flushPromises();

    expect(getBearerToken).not.toHaveBeenCalled();
  });

  it('treats irrelevant subscription lifecycle payloads as unchanged when baseline is already empty', async () => {
    const { getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    performSignOut.mockImplementation(() => undefined);

    rootMessenger.publish(
      'SubscriptionController:stateChanged',
      {
        subscriptions: [null],
      } as never,
      [] as never,
    );
    await flushPromises();

    expect(performSignOut).not.toHaveBeenCalled();
    expect(getBearerToken).not.toHaveBeenCalled();
  });

  it('normalizes Money Account subscription snapshots with missing optional fields', async () => {
    const { getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    performSignOut.mockImplementation(() => undefined);
    getBearerToken.mockResolvedValueOnce(createBearerToken({}));

    rootMessenger.publish(
      'SubscriptionController:stateChanged',
      {
        subscriptions: [
          {
            products: [null, { name: MONEY_ACCOUNT_PLUS }],
          },
        ],
      } as never,
      [] as never,
    );
    await flushPromises();

    expect(getBearerToken).toHaveBeenCalledTimes(1);
  });

  it('logs authentication refresh failures triggered by auth state changes', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
      return undefined;
    });
    const { getBearerToken, rootMessenger } = createController();

    getBearerToken.mockRejectedValueOnce(new Error('auth failed'));
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });

  it('logs bootstrap refresh failures consistently', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
      return undefined;
    });

    createController({
      authenticationState: {
        isSignedIn: true,
        srpSessionData: { primary: {} },
      },
      getBearerTokenImplementation: async () => {
        throw new Error('bootstrap failed');
      },
    });

    await flushPromises();

    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });

  it('forces a throttled refresh when Money Account Plus subscription state changes', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    performSignOut.mockImplementation(() => undefined);
    getBearerToken.mockResolvedValue(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'subscription' }),
        },
      }),
    );

    publishSubscriptionState(rootMessenger);
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(1);
    expect(getBearerToken).toHaveBeenCalledTimes(1);
    expect(controller.state.plan).toBe('subscription');

    publishSubscriptionState(rootMessenger);
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(1);
    expect(getBearerToken).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(10_001);
    publishSubscriptionState(rootMessenger);
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(1);
    expect(getBearerToken).toHaveBeenCalledTimes(1);
  });

  it('refreshes JWT when a distinct subscription snapshot arrives while force refresh is throttled', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'initial' }),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockClear();
    performSignOut.mockImplementation(() => undefined);
    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'forced' }),
        },
      }),
    );

    await controller.forceRefresh();
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(1);
    expect(controller.state.plan).toBe('forced');

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'subscribed' }),
        },
      }),
    );

    publishSubscriptionState(rootMessenger);
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(2);
    expect(getBearerToken).toHaveBeenCalledTimes(2);
    expect(controller.state.plan).toBe('subscribed');

    publishSubscriptionState(rootMessenger);
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(2);
    expect(getBearerToken).toHaveBeenCalledTimes(2);
  });

  it('refreshes JWT again when a subscription change arrives during an in-flight force refresh', async () => {
    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'initial' }),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    const deferredToken = createDeferred<string>();
    getBearerToken.mockClear();
    performSignOut.mockImplementation(() => undefined);
    getBearerToken.mockReturnValueOnce(deferredToken.promise);
    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'canceled' }),
        },
      }),
    );

    const firstRefresh = controller.forceRefresh();
    await Promise.resolve();

    expect(performSignOut).toHaveBeenCalledTimes(1);

    publishSubscriptionState(rootMessenger, 'canceled');

    deferredToken.resolve(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'in-flight' }),
        },
      }),
    );

    await firstRefresh;
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(2);
    expect(getBearerToken).toHaveBeenCalledTimes(2);
    expect(controller.state.plan).toBe('canceled');

    publishSubscriptionState(rootMessenger, 'canceled');
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(2);
    expect(getBearerToken).toHaveBeenCalledTimes(2);
  });

  it('does not throttle a new signed-in session after an external sign-out', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const { controller, getBearerToken, performSignOut, rootMessenger } =
      createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    performSignOut.mockImplementation(() => undefined);
    getBearerToken.mockResolvedValue(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'session-a' }),
        },
      }),
    );
    await controller.forceRefresh();
    await flushPromises();

    publishAuthenticationState(rootMessenger, {
      isSignedIn: false,
    });
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: { newSession: true } },
    });
    await flushPromises();

    await controller.forceRefresh();
    await flushPromises();

    expect(performSignOut).toHaveBeenCalledTimes(2);
    expect(getBearerToken).toHaveBeenCalledTimes(4);
  });

  it('logs subscription refresh failures triggered by subscription state changes', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
      return undefined;
    });
    const { getBearerToken, rootMessenger } = createController();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim(),
        },
      }),
    );
    publishAuthenticationState(rootMessenger, {
      isSignedIn: true,
      srpSessionData: { primary: {} },
    });
    await flushPromises();

    getBearerToken.mockResolvedValueOnce(
      createBearerToken({
        [claimKey]: {
          moneyAccountPlus: createMoneyAccountClaim({ plan: 'steady' }),
        },
      }),
    );
    publishSubscriptionState(rootMessenger);
    await flushPromises();

    expect(errorSpy).toHaveBeenCalledTimes(0);

    jest.advanceTimersByTime(10_001);
    getBearerToken.mockRejectedValueOnce(new Error('subscription failed'));
    publishSubscriptionState(rootMessenger, 'canceled');
    await flushPromises();

    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });
});
