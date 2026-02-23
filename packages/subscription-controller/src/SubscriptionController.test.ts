import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import {
  controllerName,
  SubscriptionControllerErrorMessage,
} from './constants';
import { SubscriptionServiceError } from './errors';
import {
  getDefaultSubscriptionControllerState,
  SubscriptionController,
} from './SubscriptionController';
import type {
  AllowedEvents,
  SubscriptionControllerMessenger,
  SubscriptionControllerOptions,
  SubscriptionControllerState,
} from './SubscriptionController';
import type {
  Subscription,
  PricingResponse,
  ProductPricing,
  PricingPaymentMethod,
  StartCryptoSubscriptionRequest,
  StartCryptoSubscriptionResponse,
  UpdatePaymentMethodOpts,
  Product,
  SubscriptionEligibility,
  CachedLastSelectedPaymentMethod,
  SubmitSponsorshipIntentsMethodParams,
  ProductType,
  RecurringInterval,
  ISubscriptionService,
} from './types';
import {
  CANCEL_TYPES,
  MODAL_TYPE,
  PAYMENT_TYPES,
  PRODUCT_TYPES,
  RECURRING_INTERVALS,
  SUBSCRIPTION_STATUSES,
  SubscriptionUserEvent,
} from './types';
import { jestAdvanceTime } from '../../../tests/helpers';
import { generateMockTxMeta } from '../tests/utils';

type AllActions = MessengerActions<SubscriptionControllerMessenger>;

type AllEvents = MessengerEvents<SubscriptionControllerMessenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

// Mock data
const MOCK_SUBSCRIPTION: Subscription = {
  id: 'sub_123456789',
  products: [
    {
      name: PRODUCT_TYPES.SHIELD,
      currency: 'usd',
      unitAmount: 900,
      unitDecimals: 2,
    },
  ],
  currentPeriodStart: '2024-01-01T00:00:00Z',
  currentPeriodEnd: '2024-02-01T00:00:00Z',
  status: SUBSCRIPTION_STATUSES.active,
  interval: RECURRING_INTERVALS.month,
  paymentMethod: {
    type: PAYMENT_TYPES.byCard,
    card: {
      brand: 'visa',
      displayBrand: 'visa',
      last4: '1234',
    },
  },
  isEligibleForSupport: true,
  cancelType: CANCEL_TYPES.ALLOWED_AT_PERIOD_END,
};

const MOCK_PRODUCT_PRICE: ProductPricing = {
  name: PRODUCT_TYPES.SHIELD,
  prices: [
    {
      interval: RECURRING_INTERVALS.month,
      currency: 'usd',
      unitAmount: 900,
      unitDecimals: 2,
      trialPeriodDays: 0,
      minBillingCycles: 12,
      minBillingCyclesForBalance: 1,
    },
    {
      interval: 'year',
      unitAmount: 8000,
      unitDecimals: 2,
      currency: 'usd',
      trialPeriodDays: 14,
      minBillingCycles: 1,
      minBillingCyclesForBalance: 1,
    },
  ],
};

const MOCK_PRICING_PAYMENT_METHOD: PricingPaymentMethod = {
  type: PAYMENT_TYPES.byCrypto,
  chains: [
    {
      chainId: '0x1',
      paymentAddress: '0xspender',
      isSponsorshipSupported: true,
      tokens: [
        {
          address: '0xtoken',
          symbol: 'USDT',
          decimals: 18,
          conversionRate: { usd: '1.0' },
        },
      ],
    },
  ],
};

const MOCK_PRICE_INFO_RESPONSE: PricingResponse = {
  products: [MOCK_PRODUCT_PRICE],
  paymentMethods: [MOCK_PRICING_PAYMENT_METHOD],
};

const MOCK_GET_SUBSCRIPTIONS_RESPONSE = {
  customerId: 'cus_1',
  subscriptions: [MOCK_SUBSCRIPTION],
  trialedProducts: [],
};

const MOCK_COHORTS = [
  {
    cohort: 'post_tx',
    eligibilityRate: 0.8,
    priority: 1,
    eligible: true,
  },
  {
    cohort: 'wallet_home',
    eligibilityRate: 0.2,
    priority: 2,
    eligible: true,
  },
];

/**
 * Creates a custom subscription messenger, in case tests need different permissions
 *
 * @param props - overrides
 * @param props.overrideEvents - override events
 * @returns base messenger, and messenger. You can pass this into the mocks below to mock messenger calls
 */
function createCustomSubscriptionMessenger(props?: {
  overrideEvents?: AllowedEvents['type'][];
}): {
  rootMessenger: RootMessenger;
  messenger: SubscriptionControllerMessenger;
} {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const messenger = new Messenger<
    typeof controllerName,
    AllActions,
    AllEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: [
      'AuthenticationController:getBearerToken',
      'AuthenticationController:performSignOut',
    ],
    events: props?.overrideEvents ?? ['AuthenticationController:stateChange'],
  });

  return {
    rootMessenger,
    messenger,
  };
}

/**
 * Jest Mock Utility to generate a mock Subscription Messenger
 *
 * @param overrideMessengers - override messengers if need to modify the underlying permissions
 * @param overrideMessengers.rootMessenger - base messenger to override
 * @param overrideMessengers.messenger - messenger to override
 * @returns series of mocks to actions that can be called
 */
function createMockSubscriptionMessenger(overrideMessengers?: {
  rootMessenger: RootMessenger;
  messenger: SubscriptionControllerMessenger;
}): {
  rootMessenger: RootMessenger;
  messenger: SubscriptionControllerMessenger;
  mockPerformSignOut: jest.Mock;
} {
  const { rootMessenger, messenger } =
    overrideMessengers ?? createCustomSubscriptionMessenger();

  const mockPerformSignOut = jest.fn();
  rootMessenger.registerActionHandler(
    'AuthenticationController:performSignOut',
    mockPerformSignOut,
  );

  return {
    rootMessenger,
    messenger,
    mockPerformSignOut,
  };
}

/**
 * Creates a mock subscription service for testing.
 *
 * @returns The mock service and related mocks.
 */
function createMockSubscriptionService(): {
  mockService: jest.Mocked<ISubscriptionService>;
  mockGetSubscriptions: jest.Mock;
  mockCancelSubscription: jest.Mock;
  mockUnCancelSubscription: jest.Mock;
  mockStartSubscriptionWithCard: jest.Mock;
  mockGetPricing: jest.Mock;
  mockStartSubscriptionWithCrypto: jest.Mock;
  mockUpdatePaymentMethodCard: jest.Mock;
  mockUpdatePaymentMethodCrypto: jest.Mock;
  mockSubmitSponsorshipIntents: jest.Mock;
  mockAssignUserToCohort: jest.Mock;
} {
  const mockGetSubscriptions = jest.fn().mockImplementation();
  const mockCancelSubscription = jest.fn();
  const mockUnCancelSubscription = jest.fn();
  const mockStartSubscriptionWithCard = jest.fn();
  const mockGetPricing = jest.fn();
  const mockStartSubscriptionWithCrypto = jest.fn();
  const mockUpdatePaymentMethodCard = jest.fn();
  const mockUpdatePaymentMethodCrypto = jest.fn();
  const mockGetBillingPortalUrl = jest.fn();
  const mockGetSubscriptionsEligibilities = jest.fn();
  const mockSubmitUserEvent = jest.fn();
  const mockSubmitSponsorshipIntents = jest.fn();
  const mockAssignUserToCohort = jest.fn();
  const mockLinkRewards = jest.fn();

  const mockService = {
    getSubscriptions: mockGetSubscriptions,
    cancelSubscription: mockCancelSubscription,
    unCancelSubscription: mockUnCancelSubscription,
    startSubscriptionWithCard: mockStartSubscriptionWithCard,
    getPricing: mockGetPricing,
    startSubscriptionWithCrypto: mockStartSubscriptionWithCrypto,
    updatePaymentMethodCard: mockUpdatePaymentMethodCard,
    updatePaymentMethodCrypto: mockUpdatePaymentMethodCrypto,
    getBillingPortalUrl: mockGetBillingPortalUrl,
    getSubscriptionsEligibilities: mockGetSubscriptionsEligibilities,
    submitUserEvent: mockSubmitUserEvent,
    submitSponsorshipIntents: mockSubmitSponsorshipIntents,
    assignUserToCohort: mockAssignUserToCohort,
    linkRewards: mockLinkRewards,
  };

  return {
    mockService,
    mockGetSubscriptions,
    mockCancelSubscription,
    mockUnCancelSubscription,
    mockStartSubscriptionWithCard,
    mockGetPricing,
    mockStartSubscriptionWithCrypto,
    mockUpdatePaymentMethodCard,
    mockUpdatePaymentMethodCrypto,
    mockSubmitSponsorshipIntents,
    mockAssignUserToCohort,
  };
}

/**
 * Helper function to create controller with options.
 */
type WithControllerCallback<ReturnValue> = (params: {
  controller: SubscriptionController;
  initialState: SubscriptionControllerState;
  messenger: SubscriptionControllerMessenger;
  rootMessenger: RootMessenger;
  mockService: ReturnType<typeof createMockSubscriptionService>['mockService'];
  mockPerformSignOut: jest.Mock;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = Partial<SubscriptionControllerOptions>;

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Builds a controller based on the given options and calls the given function with that controller.
 *
 * @param args - Either a function, or an options bag + a function.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
): Promise<ReturnValue> {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const { messenger, mockPerformSignOut, rootMessenger } =
    createMockSubscriptionMessenger();
  const { mockService } = createMockSubscriptionService();

  const controller = new SubscriptionController({
    messenger,
    subscriptionService: mockService,
    ...rest,
  });

  return await fn({
    controller,
    initialState: controller.state,
    messenger,
    rootMessenger,
    mockService,
    mockPerformSignOut,
  });
}

describe('SubscriptionController', () => {
  describe('constructor', () => {
    it('should be able to instantiate with default options', async () => {
      await withController(async ({ controller }) => {
        expect(controller.state).toStrictEqual(
          getDefaultSubscriptionControllerState(),
        );
      });
    });

    it('should be able to instantiate with initial state', () => {
      const { mockService } = createMockSubscriptionService();
      const { messenger } = createMockSubscriptionMessenger();
      const initialState: Partial<SubscriptionControllerState> = {
        subscriptions: [MOCK_SUBSCRIPTION],
      };

      const controller = new SubscriptionController({
        messenger,
        state: initialState,
        subscriptionService: mockService,
        pollingInterval: 10_000,
      });

      expect(controller).toBeDefined();
      expect(controller.state.subscriptions).toStrictEqual([MOCK_SUBSCRIPTION]);
    });

    it('should be able to instantiate with custom subscription service', () => {
      const { messenger } = createMockSubscriptionMessenger();
      const { mockService } = createMockSubscriptionService();

      const controller = new SubscriptionController({
        messenger,
        subscriptionService: mockService,
      });

      expect(controller).toBeDefined();
      expect(controller.state).toStrictEqual(
        getDefaultSubscriptionControllerState(),
      );
    });
  });

  describe('getSubscriptions', () => {
    it('should fetch and store subscription successfully', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getSubscriptions.mockResolvedValue(
          MOCK_GET_SUBSCRIPTIONS_RESPONSE,
        );

        const result = await controller.getSubscriptions();

        expect(result).toStrictEqual([MOCK_SUBSCRIPTION]);
        expect(controller.state.subscriptions).toStrictEqual([
          MOCK_SUBSCRIPTION,
        ]);
        expect(mockService.getSubscriptions).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle null subscription response', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getSubscriptions.mockResolvedValue({
          customerId: 'cus_1',
          subscriptions: [],
          trialedProducts: [],
        });

        const result = await controller.getSubscriptions();

        expect(result).toHaveLength(0);
        expect(controller.state.subscriptions).toStrictEqual([]);
        expect(mockService.getSubscriptions).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle subscription service errors', async () => {
      await withController(async ({ controller, mockService }) => {
        const errorMessage = 'Failed to fetch subscription';
        mockService.getSubscriptions.mockRejectedValue(
          new SubscriptionServiceError(errorMessage),
        );

        await expect(controller.getSubscriptions()).rejects.toThrow(
          SubscriptionServiceError,
        );

        expect(controller.state.subscriptions).toStrictEqual([]);
        expect(mockService.getSubscriptions).toHaveBeenCalledTimes(1);
      });
    });

    it('should surface triggerAccessTokenRefresh errors', async () => {
      await withController(
        async ({ controller, mockService, mockPerformSignOut }) => {
          mockService.getSubscriptions.mockResolvedValue(
            MOCK_GET_SUBSCRIPTIONS_RESPONSE,
          );
          mockPerformSignOut.mockImplementation(() => {
            throw new Error('Wallet is locked');
          });

          await expect(controller.getSubscriptions()).rejects.toThrow(
            'Wallet is locked',
          );
        },
      );
    });

    it('should update state when subscription is fetched', async () => {
      const initialSubscription = { ...MOCK_SUBSCRIPTION, id: 'sub_old' };
      const newSubscription = { ...MOCK_SUBSCRIPTION, id: 'sub_new' };

      await withController(
        {
          state: {
            subscriptions: [initialSubscription],
          },
        },
        async ({ controller, mockService }) => {
          expect(controller.state.subscriptions).toStrictEqual([
            initialSubscription,
          ]);

          // Fetch new subscription
          mockService.getSubscriptions.mockResolvedValue({
            customerId: 'cus_1',
            subscriptions: [newSubscription],
            trialedProducts: [],
          });
          const result = await controller.getSubscriptions();

          expect(result).toStrictEqual([newSubscription]);
          expect(controller.state.subscriptions).toStrictEqual([
            newSubscription,
          ]);
          expect(controller.state.subscriptions[0]?.id).toBe('sub_new');
        },
      );
    });

    it('should not update state when multiple subscriptions are the same but in different order', async () => {
      const mockSubscription1 = { ...MOCK_SUBSCRIPTION, id: 'sub_1' };
      const mockSubscription2 = { ...MOCK_SUBSCRIPTION, id: 'sub_2' };
      const mockSubscription3 = { ...MOCK_SUBSCRIPTION, id: 'sub_3' };

      await withController(
        {
          state: {
            customerId: 'cus_1',
            subscriptions: [
              mockSubscription1,
              mockSubscription2,
              mockSubscription3,
            ],
          },
        },
        async ({ controller, mockService }) => {
          // Return the same subscriptions but in different order
          mockService.getSubscriptions.mockResolvedValue({
            customerId: 'cus_1',
            subscriptions: [
              mockSubscription3,
              mockSubscription1,
              mockSubscription2,
            ], // Different order
            trialedProducts: [],
          });

          const initialState = [...controller.state.subscriptions];
          await controller.getSubscriptions();

          // Should not update state since subscriptions are the same (just different order)
          expect(controller.state.subscriptions).toStrictEqual(initialState);
        },
      );
    });

    it('should not update state when subscriptions are the same but the products are in different order', async () => {
      const mockProduct1: Product = {
        // @ts-expect-error - mock data
        name: 'Product 1',
        currency: 'usd',
        unitAmount: 900,
        unitDecimals: 2,
      };
      const mockProduct2: Product = {
        // @ts-expect-error - mock data
        name: 'Product 2',
        currency: 'usd',
        unitAmount: 900,
        unitDecimals: 2,
      };
      const mockSubscription = {
        ...MOCK_SUBSCRIPTION,
        products: [mockProduct1, mockProduct2],
      };

      await withController(
        {
          state: {
            subscriptions: [mockSubscription],
            trialedProducts: [PRODUCT_TYPES.SHIELD],
          },
        },
        async ({ controller, mockService }) => {
          mockService.getSubscriptions.mockResolvedValue({
            ...MOCK_SUBSCRIPTION,
            subscriptions: [
              { ...MOCK_SUBSCRIPTION, products: [mockProduct2, mockProduct1] },
            ],
            trialedProducts: [PRODUCT_TYPES.SHIELD],
          });
          await controller.getSubscriptions();
          expect(controller.state.subscriptions).toStrictEqual([
            mockSubscription,
          ]);
        },
      );
    });

    it('should update state when subscriptions are the same but the trialed products are different', async () => {
      const mockProduct1: Product = {
        // @ts-expect-error - mock data
        name: 'Product 1',
        currency: 'usd',
        unitAmount: 900,
        unitDecimals: 2,
      };
      const mockProduct2: Product = {
        // @ts-expect-error - mock data
        name: 'Product 2',
        currency: 'usd',
        unitAmount: 900,
        unitDecimals: 2,
      };
      const mockSubscription = {
        ...MOCK_SUBSCRIPTION,
        products: [mockProduct1, mockProduct2],
      };

      await withController(
        {
          state: {
            subscriptions: [mockSubscription],
          },
        },
        async ({ controller, mockService }) => {
          mockService.getSubscriptions.mockResolvedValue({
            ...MOCK_SUBSCRIPTION,
            subscriptions: [
              { ...MOCK_SUBSCRIPTION, products: [mockProduct1, mockProduct2] },
            ],
            trialedProducts: [PRODUCT_TYPES.SHIELD],
          });
          await controller.getSubscriptions();
          expect(controller.state.subscriptions).toStrictEqual([
            mockSubscription,
          ]);
          expect(controller.state.trialedProducts).toStrictEqual([
            PRODUCT_TYPES.SHIELD,
          ]);
        },
      );
    });

    it('should update state when lastSubscription changes from undefined to defined', async () => {
      await withController(
        {
          state: {
            lastSubscription: undefined,
          },
        },
        async ({ controller, mockService }) => {
          mockService.getSubscriptions.mockResolvedValue({
            customerId: 'cus_1',
            subscriptions: [],
            trialedProducts: [],
            lastSubscription: MOCK_SUBSCRIPTION,
          });

          await controller.getSubscriptions();

          expect(controller.state.lastSubscription).toStrictEqual(
            MOCK_SUBSCRIPTION,
          );
        },
      );
    });

    it('should update state when rewardAccountId changes from undefined to defined', async () => {
      await withController(
        {
          state: {
            rewardAccountId: undefined,
          },
        },
        async ({ controller, mockService }) => {
          mockService.getSubscriptions.mockResolvedValue({
            customerId: 'cus_1',
            subscriptions: [],
            trialedProducts: [],
            rewardAccountId:
              'eip155:1:0x1234567890123456789012345678901234567890',
          });

          await controller.getSubscriptions();

          expect(controller.state.rewardAccountId).toBe(
            'eip155:1:0x1234567890123456789012345678901234567890',
          );
        },
      );
    });

    it('should not update state when rewardAccountId is the same', async () => {
      const mockRewardAccountId =
        'eip155:1:0x1234567890123456789012345678901234567890';

      await withController(
        {
          state: {
            customerId: 'cus_1',
            subscriptions: [],
            trialedProducts: [],
            rewardAccountId: mockRewardAccountId,
          },
        },
        async ({ controller, mockService, rootMessenger }) => {
          mockService.getSubscriptions.mockResolvedValue({
            customerId: 'cus_1',
            subscriptions: [],
            trialedProducts: [],
            rewardAccountId: mockRewardAccountId,
          });

          const stateChangeListener = jest.fn();
          rootMessenger.subscribe(
            'SubscriptionController:stateChange',
            stateChangeListener,
          );

          await controller.getSubscriptions();

          // State should not have changed since rewardAccountId is the same
          expect(stateChangeListener).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('getSubscriptionByProduct', () => {
    it('should get subscription by product successfully', async () => {
      await withController(
        {
          state: {
            subscriptions: [MOCK_SUBSCRIPTION],
          },
        },
        async ({ controller }) => {
          expect(
            controller.getSubscriptionByProduct(PRODUCT_TYPES.SHIELD),
          ).toStrictEqual(MOCK_SUBSCRIPTION);
        },
      );
    });

    it('should return undefined if no subscription is found', async () => {
      await withController(async ({ controller }) => {
        expect(
          controller.getSubscriptionByProduct(PRODUCT_TYPES.SHIELD),
        ).toBeUndefined();
      });
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      const mockSubscription2 = { ...MOCK_SUBSCRIPTION, id: 'sub_2' };
      await withController(
        {
          state: {
            subscriptions: [MOCK_SUBSCRIPTION, mockSubscription2],
          },
        },
        async ({ controller, mockService }) => {
          mockService.cancelSubscription.mockResolvedValue({
            ...MOCK_SUBSCRIPTION,
            status: SUBSCRIPTION_STATUSES.canceled,
          });
          expect(
            await controller.cancelSubscription({
              subscriptionId: MOCK_SUBSCRIPTION.id,
            }),
          ).toBeUndefined();
          expect(controller.state.subscriptions).toStrictEqual([
            { ...MOCK_SUBSCRIPTION, status: SUBSCRIPTION_STATUSES.canceled },
            mockSubscription2,
          ]);
          expect(mockService.cancelSubscription).toHaveBeenCalledWith({
            subscriptionId: MOCK_SUBSCRIPTION.id,
          });
          expect(mockService.cancelSubscription).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should throw error when user is not subscribed', async () => {
      await withController(
        {
          state: {
            subscriptions: [],
          },
        },
        async ({ controller }) => {
          await expect(
            controller.cancelSubscription({
              subscriptionId: 'sub_123456789',
            }),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.UserNotSubscribed,
          );
        },
      );
    });

    it('should not call subscription service when user is not subscribed', async () => {
      await withController(
        {
          state: {
            subscriptions: [],
          },
        },
        async ({ controller, mockService }) => {
          await expect(
            controller.cancelSubscription({
              subscriptionId: 'sub_123456789',
            }),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.UserNotSubscribed,
          );

          // Verify the subscription service was not called
          expect(mockService.cancelSubscription).not.toHaveBeenCalled();
        },
      );
    });

    it('should handle subscription service errors during cancellation', async () => {
      await withController(
        {
          state: {
            subscriptions: [MOCK_SUBSCRIPTION],
          },
        },
        async ({ controller, mockService }) => {
          const errorMessage = 'Failed to cancel subscription';
          mockService.cancelSubscription.mockRejectedValue(
            new SubscriptionServiceError(errorMessage),
          );

          await expect(
            controller.cancelSubscription({
              subscriptionId: 'sub_123456789',
            }),
          ).rejects.toThrow(SubscriptionServiceError);

          expect(mockService.cancelSubscription).toHaveBeenCalledWith({
            subscriptionId: 'sub_123456789',
          });
          expect(mockService.cancelSubscription).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('unCancelSubscription', () => {
    it('should unCancel subscription successfully', async () => {
      const mockSubscription2 = { ...MOCK_SUBSCRIPTION, id: 'sub_2' };
      await withController(
        {
          state: {
            subscriptions: [MOCK_SUBSCRIPTION, mockSubscription2],
          },
        },
        async ({ controller, mockService }) => {
          mockService.unCancelSubscription.mockResolvedValue({
            ...MOCK_SUBSCRIPTION,
            status: SUBSCRIPTION_STATUSES.active,
          });
          expect(
            await controller.unCancelSubscription({
              subscriptionId: MOCK_SUBSCRIPTION.id,
            }),
          ).toBeUndefined();
          expect(controller.state.subscriptions).toStrictEqual([
            { ...MOCK_SUBSCRIPTION, status: SUBSCRIPTION_STATUSES.active },
            mockSubscription2,
          ]);
          expect(mockService.unCancelSubscription).toHaveBeenCalledWith({
            subscriptionId: MOCK_SUBSCRIPTION.id,
          });
          expect(mockService.unCancelSubscription).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should throw error when user is not subscribed', async () => {
      await withController(
        {
          state: {
            subscriptions: [],
          },
        },
        async ({ controller }) => {
          await expect(
            controller.unCancelSubscription({
              subscriptionId: 'sub_123456789',
            }),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.UserNotSubscribed,
          );
        },
      );
    });

    it('should not call subscription service when user is not subscribed', async () => {
      await withController(
        {
          state: {
            subscriptions: [],
          },
        },
        async ({ controller, mockService }) => {
          await expect(
            controller.unCancelSubscription({
              subscriptionId: 'sub_123456789',
            }),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.UserNotSubscribed,
          );

          // Verify the subscription service was not called
          expect(mockService.unCancelSubscription).not.toHaveBeenCalled();
        },
      );
    });

    it('should handle subscription service errors during cancellation', async () => {
      await withController(
        {
          state: {
            subscriptions: [MOCK_SUBSCRIPTION],
          },
        },
        async ({ controller, mockService }) => {
          const errorMessage = 'Failed to unCancel subscription';
          mockService.unCancelSubscription.mockRejectedValue(
            new SubscriptionServiceError(errorMessage),
          );

          await expect(
            controller.unCancelSubscription({
              subscriptionId: 'sub_123456789',
            }),
          ).rejects.toThrow(SubscriptionServiceError);

          expect(mockService.unCancelSubscription).toHaveBeenCalledWith({
            subscriptionId: 'sub_123456789',
          });
          expect(mockService.unCancelSubscription).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('startShieldSubscriptionWithCard', () => {
    const MOCK_START_SUBSCRIPTION_RESPONSE = {
      checkoutSessionUrl: 'https://checkout.example.com/session/123',
    };

    it('should start shield subscription successfully when user is not subscribed', async () => {
      await withController(
        {
          state: {
            subscriptions: [],
          },
        },
        async ({ controller, mockService }) => {
          mockService.startSubscriptionWithCard.mockResolvedValue(
            MOCK_START_SUBSCRIPTION_RESPONSE,
          );

          const result = await controller.startShieldSubscriptionWithCard({
            products: [PRODUCT_TYPES.SHIELD],
            isTrialRequested: true,
            recurringInterval: RECURRING_INTERVALS.month,
          });

          expect(result).toStrictEqual(MOCK_START_SUBSCRIPTION_RESPONSE);
          expect(mockService.startSubscriptionWithCard).toHaveBeenCalledWith({
            products: [PRODUCT_TYPES.SHIELD],
            isTrialRequested: true,
            recurringInterval: RECURRING_INTERVALS.month,
          });
        },
      );
    });

    it('should throw error when user is already subscribed', async () => {
      await withController(
        {
          state: {
            subscriptions: [MOCK_SUBSCRIPTION],
          },
        },
        async ({ controller, mockService }) => {
          await expect(
            controller.startShieldSubscriptionWithCard({
              products: [PRODUCT_TYPES.SHIELD],
              isTrialRequested: true,
              recurringInterval: RECURRING_INTERVALS.month,
            }),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.UserAlreadySubscribed,
          );

          // Verify the subscription service was not called
          expect(mockService.startSubscriptionWithCard).not.toHaveBeenCalled();
        },
      );
    });

    it('should handle subscription service errors during start subscription', async () => {
      await withController(
        {
          state: {
            subscriptions: [],
          },
        },
        async ({ controller, mockService }) => {
          const errorMessage = 'Failed to start subscription';
          mockService.startSubscriptionWithCard.mockRejectedValue(
            new SubscriptionServiceError(errorMessage),
          );

          await expect(
            controller.startShieldSubscriptionWithCard({
              products: [PRODUCT_TYPES.SHIELD],
              isTrialRequested: true,
              recurringInterval: RECURRING_INTERVALS.month,
            }),
          ).rejects.toThrow(SubscriptionServiceError);

          expect(mockService.startSubscriptionWithCard).toHaveBeenCalledWith({
            products: [PRODUCT_TYPES.SHIELD],
            isTrialRequested: true,
            recurringInterval: RECURRING_INTERVALS.month,
          });
        },
      );
    });
  });

  describe('startCryptoSubscription', () => {
    it('should start crypto subscription successfully when user is not subscribed', async () => {
      await withController(
        {
          state: {
            subscriptions: [],
          },
        },
        async ({ controller, mockService }) => {
          const request: StartCryptoSubscriptionRequest = {
            products: [PRODUCT_TYPES.SHIELD],
            isTrialRequested: false,
            recurringInterval: RECURRING_INTERVALS.month,
            billingCycles: 3,
            chainId: '0x1',
            payerAddress: '0x0000000000000000000000000000000000000001',
            tokenSymbol: 'USDC',
            rawTransaction: '0xdeadbeef',
          };

          const response: StartCryptoSubscriptionResponse = {
            subscriptionId: 'sub_crypto_123',
            status: SUBSCRIPTION_STATUSES.active,
          };

          mockService.startSubscriptionWithCrypto.mockResolvedValue(response);

          const result = await controller.startSubscriptionWithCrypto(request);

          expect(result).toStrictEqual(response);
          expect(mockService.startSubscriptionWithCrypto).toHaveBeenCalledWith(
            request,
          );
        },
      );
    });
  });

  describe('startPolling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should call getSubscriptions with the correct interval', async () => {
      await withController(async ({ controller }) => {
        const getSubscriptionsSpy = jest.spyOn(controller, 'getSubscriptions');
        controller.startPolling({});
        await jestAdvanceTime({ duration: 0 });
        expect(getSubscriptionsSpy).toHaveBeenCalledTimes(1);
      });
    });

    it('should call `triggerAccessTokenRefresh` when the state changes', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getSubscriptions.mockResolvedValue(
          MOCK_GET_SUBSCRIPTIONS_RESPONSE,
        );
        const triggerAccessTokenRefreshSpy = jest.spyOn(
          controller,
          'triggerAccessTokenRefresh',
        );
        controller.startPolling({});
        await jestAdvanceTime({ duration: 0 });
        expect(triggerAccessTokenRefreshSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete subscription lifecycle with updated logic', async () => {
      await withController(async ({ controller, mockService }) => {
        // 1. Initially no subscription
        expect(controller.state.subscriptions).toStrictEqual([]);

        // 2. Try to cancel subscription (should fail - user not subscribed)
        await expect(
          controller.cancelSubscription({
            subscriptionId: 'sub_123456789',
          }),
        ).rejects.toThrow(SubscriptionControllerErrorMessage.UserNotSubscribed);

        // 3. Fetch subscription
        mockService.getSubscriptions.mockResolvedValue({
          customerId: 'cus_1',
          subscriptions: [MOCK_SUBSCRIPTION],
          trialedProducts: [],
        });
        const subscriptions = await controller.getSubscriptions();

        expect(subscriptions).toStrictEqual([MOCK_SUBSCRIPTION]);
        expect(controller.state.subscriptions).toStrictEqual([
          MOCK_SUBSCRIPTION,
        ]);

        // 4. Now cancel should work (user is subscribed)
        mockService.cancelSubscription.mockResolvedValue(MOCK_SUBSCRIPTION);
        expect(
          await controller.cancelSubscription({
            subscriptionId: 'sub_123456789',
          }),
        ).toBeUndefined();

        expect(mockService.cancelSubscription).toHaveBeenCalledWith({
          subscriptionId: 'sub_123456789',
        });
      });
    });
  });

  describe('getPricing', () => {
    const mockPricingResponse: PricingResponse = {
      products: [],
      paymentMethods: [],
    };

    it('should return pricing response', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getPricing.mockResolvedValue(mockPricingResponse);

        const result = await controller.getPricing();

        expect(result).toStrictEqual(mockPricingResponse);
      });
    });
  });

  describe('getCryptoApproveTransactionParams', () => {
    it('returns transaction params for crypto approve transaction', async () => {
      await withController(
        {
          state: {
            pricing: MOCK_PRICE_INFO_RESPONSE,
          },
        },
        async ({ controller }) => {
          const result = controller.getCryptoApproveTransactionParams({
            chainId: '0x1',
            paymentTokenAddress: '0xtoken',
            productType: PRODUCT_TYPES.SHIELD,
            interval: RECURRING_INTERVALS.month,
          });

          expect(result).toStrictEqual({
            approveAmount: '108000000000000000000',
            paymentAddress: '0xspender',
            paymentTokenAddress: '0xtoken',
            chainId: '0x1',
          });
        },
      );
    });

    it('throws when pricing not found', async () => {
      await withController(async ({ controller }) => {
        expect(() =>
          controller.getCryptoApproveTransactionParams({
            chainId: '0x1',
            paymentTokenAddress: '0xtoken',
            productType: PRODUCT_TYPES.SHIELD,
            interval: RECURRING_INTERVALS.month,
          }),
        ).toThrow('Subscription pricing not found');
      });
    });

    it('throws when product price not found', async () => {
      await withController(
        {
          state: {
            pricing: {
              products: [],
              paymentMethods: [],
            },
          },
        },
        async ({ controller }) => {
          expect(() =>
            controller.getCryptoApproveTransactionParams({
              chainId: '0x1',
              paymentTokenAddress: '0xtoken',
              productType: PRODUCT_TYPES.SHIELD,
              interval: RECURRING_INTERVALS.month,
            }),
          ).toThrow('Product price not found');
        },
      );
    });

    it('throws when price not found for interval', async () => {
      await withController(
        {
          state: {
            pricing: {
              products: [
                {
                  name: PRODUCT_TYPES.SHIELD,
                  prices: [
                    {
                      interval: RECURRING_INTERVALS.year,
                      currency: 'usd',
                      unitAmount: 10,
                      unitDecimals: 18,
                      trialPeriodDays: 0,
                      minBillingCycles: 1,
                      minBillingCyclesForBalance: 1,
                    },
                  ],
                },
              ],
              paymentMethods: [],
            },
          },
        },
        async ({ controller }) => {
          expect(() =>
            controller.getCryptoApproveTransactionParams({
              chainId: '0x1',
              paymentTokenAddress: '0xtoken',
              productType: PRODUCT_TYPES.SHIELD,
              interval: RECURRING_INTERVALS.month,
            }),
          ).toThrow('Price not found');
        },
      );
    });

    it('throws when chains payment info not found', async () => {
      await withController(
        {
          state: {
            pricing: {
              ...MOCK_PRICE_INFO_RESPONSE,
              paymentMethods: [
                {
                  type: PAYMENT_TYPES.byCard,
                },
              ],
            },
          },
        },
        async ({ controller }) => {
          expect(() =>
            controller.getCryptoApproveTransactionParams({
              chainId: '0x1',
              paymentTokenAddress: '0xtoken',
              productType: PRODUCT_TYPES.SHIELD,
              interval: RECURRING_INTERVALS.month,
            }),
          ).toThrow('Chains payment info not found');
        },
      );
    });

    it('throws when invalid chain id', async () => {
      await withController(
        {
          state: {
            pricing: {
              ...MOCK_PRICE_INFO_RESPONSE,
              paymentMethods: [
                {
                  type: PAYMENT_TYPES.byCrypto,
                  chains: [
                    {
                      chainId: '0x2',
                      paymentAddress: '0xspender',
                      tokens: [],
                    },
                  ],
                },
              ],
            },
          },
        },
        async ({ controller }) => {
          expect(() =>
            controller.getCryptoApproveTransactionParams({
              chainId: '0x1',
              paymentTokenAddress: '0xtoken',
              productType: PRODUCT_TYPES.SHIELD,
              interval: RECURRING_INTERVALS.month,
            }),
          ).toThrow('Invalid chain id');
        },
      );
    });

    it('throws when invalid token address', async () => {
      await withController(
        {
          state: {
            pricing: MOCK_PRICE_INFO_RESPONSE,
          },
        },
        async ({ controller }) => {
          expect(() =>
            controller.getCryptoApproveTransactionParams({
              chainId: '0x1',
              paymentTokenAddress: '0xtoken-invalid',
              productType: PRODUCT_TYPES.SHIELD,
              interval: RECURRING_INTERVALS.month,
            }),
          ).toThrow('Invalid token address');
        },
      );
    });

    it('throws when conversion rate not found', async () => {
      await withController(
        {
          state: {
            pricing: {
              ...MOCK_PRICE_INFO_RESPONSE,
              paymentMethods: [
                {
                  type: PAYMENT_TYPES.byCrypto,
                  chains: [
                    {
                      chainId: '0x1',
                      paymentAddress: '0xspender',
                      tokens: [
                        {
                          address: '0xtoken',
                          decimals: 18,
                          symbol: 'USDT',
                          conversionRate: {} as { usd: string },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        async ({ controller }) => {
          expect(() =>
            controller.getCryptoApproveTransactionParams({
              chainId: '0x1',
              paymentTokenAddress: '0xtoken',
              productType: PRODUCT_TYPES.SHIELD,
              interval: RECURRING_INTERVALS.month,
            }),
          ).toThrow('Conversion rate not found');
        },
      );
    });
  });

  describe('getTokenMinimumBalanceAmount', () => {
    it('returns correct minimum balance amount for token', async () => {
      await withController(async ({ controller }) => {
        const [price] = MOCK_PRODUCT_PRICE.prices;
        const { chains } = MOCK_PRICING_PAYMENT_METHOD;
        if (!chains || chains.length === 0) {
          throw new Error('Mock chains not found');
        }
        const [tokenPaymentInfo] = chains[0].tokens;

        const result = controller.getTokenMinimumBalanceAmount(
          price,
          tokenPaymentInfo,
        );

        expect(result).toBe('9000000000000000000');
      });
    });

    it('throws when conversion rate not found', async () => {
      await withController(async ({ controller }) => {
        const price = MOCK_PRODUCT_PRICE.prices[0];
        const tokenPaymentInfoWithoutRate = {
          address: '0xtoken' as const,
          decimals: 18,
          symbol: 'USDT',
          conversionRate: {} as { usd: string },
        };

        expect(() =>
          controller.getTokenMinimumBalanceAmount(
            price,
            tokenPaymentInfoWithoutRate,
          ),
        ).toThrow('Conversion rate not found');
      });
    });
  });

  describe('triggerAuthTokenRefresh', () => {
    it('should trigger auth token refresh', async () => {
      await withController(async ({ controller, mockPerformSignOut }) => {
        controller.triggerAccessTokenRefresh();

        expect(mockPerformSignOut).toHaveBeenCalledWith();
      });
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`
          {
            "trialedProducts": [],
          }
        `);
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`
          {
            "trialedProducts": [],
          }
        `);
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          {
            "subscriptions": [],
            "trialedProducts": [],
          }
        `);
      });
    });

    it('exposes expected state to UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`
          {
            "subscriptions": [],
            "trialedProducts": [],
          }
        `);
      });
    });
  });

  describe('updatePaymentMethod', () => {
    it('should update card payment method successfully', async () => {
      await withController(async ({ controller, mockService }) => {
        const redirectUrl = 'https://redirect.com';
        mockService.updatePaymentMethodCard.mockResolvedValue({
          redirectUrl,
        });
        mockService.getSubscriptions.mockResolvedValue(
          MOCK_GET_SUBSCRIPTIONS_RESPONSE,
        );

        const result = await controller.updatePaymentMethod({
          subscriptionId: 'sub_123456789',
          paymentType: PAYMENT_TYPES.byCard,
          recurringInterval: RECURRING_INTERVALS.month,
        });

        expect(mockService.updatePaymentMethodCard).toHaveBeenCalledWith({
          subscriptionId: 'sub_123456789',
          recurringInterval: RECURRING_INTERVALS.month,
        });
        expect(result).toStrictEqual({ redirectUrl });
      });
    });

    it('should update crypto payment method successfully', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.updatePaymentMethodCrypto.mockResolvedValue(undefined);
        mockService.getSubscriptions.mockResolvedValue(
          MOCK_GET_SUBSCRIPTIONS_RESPONSE,
        );

        const opts: UpdatePaymentMethodOpts = {
          paymentType: PAYMENT_TYPES.byCrypto,
          subscriptionId: 'sub_123456789',
          chainId: '0x1',
          payerAddress: '0x0000000000000000000000000000000000000001',
          tokenSymbol: 'USDC',
          rawTransaction: '0xdeadbeef',
          recurringInterval: RECURRING_INTERVALS.month,
          billingCycles: 3,
        };

        await controller.updatePaymentMethod(opts);

        const req = {
          ...opts,
          paymentType: undefined,
        };
        expect(mockService.updatePaymentMethodCrypto).toHaveBeenCalledWith(req);

        expect(controller.state.subscriptions).toStrictEqual([
          MOCK_SUBSCRIPTION,
        ]);
      });
    });

    it('throws when invalid payment type', async () => {
      await withController(async ({ controller }) => {
        const opts = {
          subscriptionId: 'sub_123456789',
          paymentType: 'invalid',
          recurringInterval: RECURRING_INTERVALS.month,
        };
        // @ts-expect-error Intentionally testing with invalid payment type.
        await expect(controller.updatePaymentMethod(opts)).rejects.toThrow(
          'Invalid payment type',
        );
      });
    });
  });

  describe('getBillingPortalUrl', () => {
    it('should get the billing portal URL', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getBillingPortalUrl.mockResolvedValue({
          url: 'https://billing-portal.com',
        });

        const result = await controller.getBillingPortalUrl();
        expect(result).toStrictEqual({ url: 'https://billing-portal.com' });
      });
    });
  });

  describe('getSubscriptionsEligibilities', () => {
    const MOCK_SUBSCRIPTION_ELIGIBILITY: SubscriptionEligibility = {
      product: PRODUCT_TYPES.SHIELD,
      canSubscribe: true,
      canViewEntryModal: true,
      modalType: MODAL_TYPE.A,
      cohorts: [],
      assignedCohort: null,
      hasAssignedCohortExpired: false,
    };

    it('should get the subscriptions eligibilities', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getSubscriptionsEligibilities.mockResolvedValue([
          MOCK_SUBSCRIPTION_ELIGIBILITY,
        ]);

        const result = await controller.getSubscriptionsEligibilities();
        expect(result).toStrictEqual([MOCK_SUBSCRIPTION_ELIGIBILITY]);
      });
    });

    it('should get the subscriptions eligibilities with balanceCategory parameter', async () => {
      await withController(async ({ controller, mockService }) => {
        const mockEligibilityWithCohorts: SubscriptionEligibility = {
          ...MOCK_SUBSCRIPTION_ELIGIBILITY,
          cohorts: MOCK_COHORTS,
          assignedCohort: 'post_tx',
        };

        mockService.getSubscriptionsEligibilities.mockResolvedValue([
          mockEligibilityWithCohorts,
        ]);

        const balanceCategory = '1k-9.9k';
        const result = await controller.getSubscriptionsEligibilities({
          balanceCategory,
        });
        expect(result).toStrictEqual([mockEligibilityWithCohorts]);
        expect(mockService.getSubscriptionsEligibilities).toHaveBeenCalledWith({
          balanceCategory,
        });
      });
    });

    it('should handle subscription service errors', async () => {
      await withController(async ({ controller, mockService }) => {
        const errorMessage = 'Failed to get subscriptions eligibilities';
        mockService.getSubscriptionsEligibilities.mockRejectedValue(
          new SubscriptionServiceError(errorMessage),
        );

        await expect(
          controller.getSubscriptionsEligibilities(),
        ).rejects.toThrow(SubscriptionServiceError);
      });
    });
  });

  describe('submitUserEvent', () => {
    it('should submit user event successfully', async () => {
      await withController(async ({ controller, mockService }) => {
        const submitUserEventSpy = jest
          .spyOn(mockService, 'submitUserEvent')
          .mockResolvedValue(undefined);

        const result = await controller.submitUserEvent({
          event: SubscriptionUserEvent.ShieldEntryModalViewed,
        });
        expect(result).toBeUndefined();
        expect(submitUserEventSpy).toHaveBeenCalledWith({
          event: SubscriptionUserEvent.ShieldEntryModalViewed,
        });
        expect(submitUserEventSpy).toHaveBeenCalledTimes(1);
      });
    });

    it('should submit user event with cohort successfully', async () => {
      await withController(async ({ controller, mockService }) => {
        const submitUserEventSpy = jest
          .spyOn(mockService, 'submitUserEvent')
          .mockResolvedValue(undefined);

        const result = await controller.submitUserEvent({
          event: SubscriptionUserEvent.ShieldCohortAssigned,
          cohort: 'post_tx',
        });
        expect(result).toBeUndefined();
        expect(submitUserEventSpy).toHaveBeenCalledWith({
          event: SubscriptionUserEvent.ShieldCohortAssigned,
          cohort: 'post_tx',
        });
        expect(submitUserEventSpy).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle subscription service errors', async () => {
      await withController(async ({ controller, mockService }) => {
        const errorMessage = 'Failed to submit user event';
        mockService.submitUserEvent.mockRejectedValue(
          new SubscriptionServiceError(errorMessage),
        );

        await expect(
          controller.submitUserEvent({
            event: SubscriptionUserEvent.ShieldEntryModalViewed,
          }),
        ).rejects.toThrow(SubscriptionServiceError);
      });
    });
  });

  describe('assignUserToCohort', () => {
    it('should assign user to cohort successfully', async () => {
      await withController(async ({ controller, mockService }) => {
        const assignUserToCohortSpy = jest
          .spyOn(mockService, 'assignUserToCohort')
          .mockResolvedValue(undefined);

        const result = await controller.assignUserToCohort({
          cohort: 'post_tx',
        });
        expect(result).toBeUndefined();
        expect(assignUserToCohortSpy).toHaveBeenCalledWith({
          cohort: 'post_tx',
        });
        expect(assignUserToCohortSpy).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle subscription service errors', async () => {
      await withController(async ({ controller, mockService }) => {
        const errorMessage = 'Failed to assign user to cohort';
        mockService.assignUserToCohort.mockRejectedValue(
          new SubscriptionServiceError(errorMessage),
        );

        await expect(
          controller.assignUserToCohort({ cohort: 'post_tx' }),
        ).rejects.toThrow(SubscriptionServiceError);
      });
    });
  });

  describe('cacheLastSelectedPaymentMethod', () => {
    const MOCK_CACHED_PAYMENT_METHOD: CachedLastSelectedPaymentMethod = {
      type: PAYMENT_TYPES.byCrypto,
      paymentTokenAddress: '0x123',
      paymentTokenSymbol: 'USDT',
      plan: RECURRING_INTERVALS.month,
    };

    it('should cache last selected payment method successfully', async () => {
      await withController(async ({ controller }) => {
        controller.cacheLastSelectedPaymentMethod(PRODUCT_TYPES.SHIELD, {
          type: PAYMENT_TYPES.byCard,
          plan: RECURRING_INTERVALS.month,
        });

        expect(controller.state.lastSelectedPaymentMethod).toStrictEqual({
          [PRODUCT_TYPES.SHIELD]: {
            type: PAYMENT_TYPES.byCard,
            plan: RECURRING_INTERVALS.month,
          },
        });
      });
    });

    it('should update the last selected payment method for the same product', async () => {
      await withController(
        {
          state: {
            lastSelectedPaymentMethod: {
              [PRODUCT_TYPES.SHIELD]: {
                type: PAYMENT_TYPES.byCard,
                plan: RECURRING_INTERVALS.month,
              },
            },
          },
        },
        async ({ controller }) => {
          expect(controller.state.lastSelectedPaymentMethod).toStrictEqual({
            [PRODUCT_TYPES.SHIELD]: {
              type: PAYMENT_TYPES.byCard,
              plan: RECURRING_INTERVALS.month,
            },
          });

          controller.cacheLastSelectedPaymentMethod(
            PRODUCT_TYPES.SHIELD,
            MOCK_CACHED_PAYMENT_METHOD,
          );

          expect(controller.state.lastSelectedPaymentMethod).toStrictEqual({
            [PRODUCT_TYPES.SHIELD]: MOCK_CACHED_PAYMENT_METHOD,
          });
        },
      );
    });

    it('should throw error when payment token address is not provided for crypto payment', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.cacheLastSelectedPaymentMethod(PRODUCT_TYPES.SHIELD, {
            type: PAYMENT_TYPES.byCrypto,
            plan: RECURRING_INTERVALS.month,
          } as CachedLastSelectedPaymentMethod),
        ).toThrow(
          SubscriptionControllerErrorMessage.PaymentTokenAddressAndSymbolRequiredForCrypto,
        );
      });
    });
  });

  describe('clearLastSelectedPaymentMethod', () => {
    it('should clear last selected payment method successfully', async () => {
      await withController(
        {
          state: {
            lastSelectedPaymentMethod: {
              [PRODUCT_TYPES.SHIELD]: {
                type: PAYMENT_TYPES.byCard,
                plan: RECURRING_INTERVALS.month,
              },
            },
          },
        },
        async ({ controller }) => {
          expect(controller.state.lastSelectedPaymentMethod).toStrictEqual({
            [PRODUCT_TYPES.SHIELD]: {
              type: PAYMENT_TYPES.byCard,
              plan: RECURRING_INTERVALS.month,
            },
          });

          controller.clearLastSelectedPaymentMethod(PRODUCT_TYPES.SHIELD);

          expect(controller.state.lastSelectedPaymentMethod).toStrictEqual({});
        },
      );
    });

    it('should do nothing when lastSelectedPaymentMethod is undefined', async () => {
      await withController(async ({ controller }) => {
        expect(controller.state.lastSelectedPaymentMethod).toBeUndefined();

        controller.clearLastSelectedPaymentMethod(PRODUCT_TYPES.SHIELD);

        expect(controller.state.lastSelectedPaymentMethod).toBeUndefined();
      });
    });

    it('should remove the product key while preserving the state object', async () => {
      await withController(
        {
          state: {
            lastSelectedPaymentMethod: {
              [PRODUCT_TYPES.SHIELD]: {
                type: PAYMENT_TYPES.byCrypto,
                paymentTokenAddress: '0x123',
                paymentTokenSymbol: 'USDT',
                plan: RECURRING_INTERVALS.month,
              },
              'test-product-type': {
                type: PAYMENT_TYPES.byCard,
              },
            } as Record<ProductType, CachedLastSelectedPaymentMethod>,
          },
        },
        async ({ controller }) => {
          expect(
            controller.state.lastSelectedPaymentMethod?.[PRODUCT_TYPES.SHIELD],
          ).toBeDefined();

          controller.clearLastSelectedPaymentMethod(PRODUCT_TYPES.SHIELD);

          expect(
            controller.state.lastSelectedPaymentMethod?.[
              'test-product-type' as ProductType
            ],
          ).toBeDefined();
          expect(
            controller.state.lastSelectedPaymentMethod?.[PRODUCT_TYPES.SHIELD],
          ).toBeUndefined();
        },
      );
    });
  });

  describe('clearState', () => {
    it('should reset state to default values', async () => {
      await withController(
        {
          state: {
            subscriptions: [MOCK_SUBSCRIPTION],
            pricing: MOCK_PRICE_INFO_RESPONSE,
            lastSelectedPaymentMethod: {
              [PRODUCT_TYPES.SHIELD]: {
                type: PAYMENT_TYPES.byCrypto,
                paymentTokenAddress: '0xtoken',
                paymentTokenSymbol: 'USDT',
                plan: RECURRING_INTERVALS.month,
              },
            },
          },
        },
        async ({ controller }) => {
          expect(controller.state.subscriptions).toStrictEqual([
            MOCK_SUBSCRIPTION,
          ]);
          expect(controller.state.pricing).toStrictEqual(
            MOCK_PRICE_INFO_RESPONSE,
          );

          controller.clearState();

          expect(controller.state).toStrictEqual(
            getDefaultSubscriptionControllerState(),
          );
          expect(controller.state.subscriptions).toHaveLength(0);
          expect(controller.state.pricing).toBeUndefined();
          expect(controller.state.lastSelectedPaymentMethod).toBeUndefined();
        },
      );
    });
  });

  describe('submitSponsorshipIntents', () => {
    const MOCK_SUBMISSION_INTENTS_REQUEST: SubmitSponsorshipIntentsMethodParams =
      {
        chainId: '0x1',
        address: '0x1234567890123456789012345678901234567890',
        products: [PRODUCT_TYPES.SHIELD],
      };
    const MOCK_CACHED_PAYMENT_METHOD: Record<
      ProductType,
      CachedLastSelectedPaymentMethod
    > = {
      [PRODUCT_TYPES.SHIELD]: {
        type: PAYMENT_TYPES.byCrypto,
        paymentTokenAddress: '0xtoken',
        paymentTokenSymbol: 'USDT',
        plan: RECURRING_INTERVALS.month,
      },
    };

    it('should submit sponsorship intents successfully', async () => {
      await withController(
        {
          state: {
            lastSelectedPaymentMethod: MOCK_CACHED_PAYMENT_METHOD,
            pricing: MOCK_PRICE_INFO_RESPONSE,
          },
        },
        async ({ controller, mockService }) => {
          const submitSponsorshipIntentsSpy = jest
            .spyOn(mockService, 'submitSponsorshipIntents')
            .mockResolvedValue(undefined);

          await controller.submitSponsorshipIntents(
            MOCK_SUBMISSION_INTENTS_REQUEST,
          );
          expect(submitSponsorshipIntentsSpy).toHaveBeenCalledWith({
            ...MOCK_SUBMISSION_INTENTS_REQUEST,
            paymentTokenSymbol: 'USDT',
            billingCycles: 12,
            recurringInterval: RECURRING_INTERVALS.month,
          });
        },
      );
    });

    it('should throw error when products array is empty', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.submitSponsorshipIntents({
            ...MOCK_SUBMISSION_INTENTS_REQUEST,
            products: [],
          }),
        ).rejects.toThrow(
          SubscriptionControllerErrorMessage.SubscriptionProductsEmpty,
        );
      });
    });

    it('should throw error when user is already subscribed', async () => {
      await withController(
        {
          state: {
            subscriptions: [MOCK_SUBSCRIPTION],
          },
        },
        async ({ controller, mockService }) => {
          await expect(
            controller.submitSponsorshipIntents(
              MOCK_SUBMISSION_INTENTS_REQUEST,
            ),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.UserAlreadySubscribed,
          );

          // Verify the subscription service was not called
          expect(mockService.submitSponsorshipIntents).not.toHaveBeenCalled();
        },
      );
    });

    it('should not submit sponsorship intents if the user has trailed the products before', async () => {
      await withController(
        {
          state: {
            lastSelectedPaymentMethod: MOCK_CACHED_PAYMENT_METHOD,
            subscriptions: [
              {
                ...MOCK_SUBSCRIPTION,
                status: SUBSCRIPTION_STATUSES.canceled,
              },
            ],
            pricing: MOCK_PRICE_INFO_RESPONSE,
            trialedProducts: [PRODUCT_TYPES.SHIELD],
          },
        },
        async ({ controller, mockService }) => {
          mockService.submitSponsorshipIntents.mockResolvedValue(undefined);

          const isSponsored = await controller.submitSponsorshipIntents(
            MOCK_SUBMISSION_INTENTS_REQUEST,
          );
          expect(isSponsored).toBe(false);
          expect(mockService.submitSponsorshipIntents).not.toHaveBeenCalled();
        },
      );
    });

    it('should not submit sponsorship intents if the chain does not support sponsorship', async () => {
      await withController(
        {
          state: {
            lastSelectedPaymentMethod: MOCK_CACHED_PAYMENT_METHOD,
            pricing: {
              ...MOCK_PRICE_INFO_RESPONSE,
              paymentMethods: [
                ...MOCK_PRICE_INFO_RESPONSE.paymentMethods.map(
                  (paymentMethod) => ({
                    ...paymentMethod,
                    chains: paymentMethod.chains?.map((chain) => ({
                      ...chain,
                      isSponsorshipSupported: false, // <==== Sponsorship not supported
                    })),
                  }),
                ),
              ],
            },
          },
        },
        async ({ controller, mockService }) => {
          const isSponsored = await controller.submitSponsorshipIntents(
            MOCK_SUBMISSION_INTENTS_REQUEST,
          );
          expect(isSponsored).toBe(false);
          expect(mockService.submitSponsorshipIntents).not.toHaveBeenCalled();
        },
      );
    });

    it('should throw error when no cached payment method is found', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.submitSponsorshipIntents(MOCK_SUBMISSION_INTENTS_REQUEST),
        ).rejects.toThrow(
          SubscriptionControllerErrorMessage.PaymentMethodNotCrypto,
        );
      });
    });

    it('should throw error when payment method is not crypto', async () => {
      await withController(
        {
          state: {
            lastSelectedPaymentMethod: {
              [PRODUCT_TYPES.SHIELD]: {
                type: PAYMENT_TYPES.byCard,
                plan: RECURRING_INTERVALS.month,
              },
            },
          },
        },
        async ({ controller }) => {
          await expect(
            controller.submitSponsorshipIntents(
              MOCK_SUBMISSION_INTENTS_REQUEST,
            ),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.PaymentMethodNotCrypto,
          );
        },
      );
    });

    it('should throw error when product price is not found', async () => {
      await withController(
        {
          state: {
            lastSelectedPaymentMethod: MOCK_CACHED_PAYMENT_METHOD,
            pricing: {
              products: [],
              paymentMethods: [MOCK_PRICING_PAYMENT_METHOD],
            },
          },
        },
        async ({ controller }) => {
          await expect(
            controller.submitSponsorshipIntents(
              MOCK_SUBMISSION_INTENTS_REQUEST,
            ),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.ProductPriceNotFound,
          );
        },
      );
    });

    it('should handle subscription service errors', async () => {
      await withController(
        {
          state: {
            lastSelectedPaymentMethod: {
              [PRODUCT_TYPES.SHIELD]: {
                ...MOCK_CACHED_PAYMENT_METHOD[PRODUCT_TYPES.SHIELD],
                plan: RECURRING_INTERVALS.year,
              },
            },
            pricing: MOCK_PRICE_INFO_RESPONSE,
          },
        },
        async ({ controller, mockService }) => {
          mockService.submitSponsorshipIntents.mockRejectedValue(
            new SubscriptionServiceError(
              'Failed to submit sponsorship intents',
            ),
          );

          await expect(
            controller.submitSponsorshipIntents(
              MOCK_SUBMISSION_INTENTS_REQUEST,
            ),
          ).rejects.toThrow(SubscriptionServiceError);
          expect(mockService.submitSponsorshipIntents).toHaveBeenCalledWith({
            ...MOCK_SUBMISSION_INTENTS_REQUEST,
            paymentTokenSymbol: 'USDT',
            billingCycles: 1,
            recurringInterval: RECURRING_INTERVALS.year,
          });
        },
      );
    });
  });

  describe('submitShieldSubscriptionCryptoApproval', () => {
    it('should handle subscription crypto approval when shield subscription transaction is submitted', async () => {
      await withController(
        {
          state: {
            pricing: MOCK_PRICE_INFO_RESPONSE,
            trialedProducts: [],
            subscriptions: [],
            lastSelectedPaymentMethod: {
              [PRODUCT_TYPES.SHIELD]: {
                type: PAYMENT_TYPES.byCrypto,
                paymentTokenAddress: '0xtoken',
                paymentTokenSymbol: 'USDT',
                plan: RECURRING_INTERVALS.month,
              },
            },
          },
        },
        async ({ controller, mockService }) => {
          mockService.startSubscriptionWithCrypto.mockResolvedValue({
            subscriptionId: 'sub_123',
            status: SUBSCRIPTION_STATUSES.trialing,
          });

          mockService.getSubscriptions
            .mockResolvedValueOnce({
              subscriptions: [],
              trialedProducts: [],
            })
            .mockResolvedValue(MOCK_GET_SUBSCRIPTIONS_RESPONSE);

          // Create a shield subscription approval transaction
          const txMeta = {
            ...generateMockTxMeta(),
            type: TransactionType.shieldSubscriptionApprove,
            chainId: '0x1' as Hex,
            rawTx: '0x123',
            txParams: {
              data: '0x456',
              from: '0x1234567890123456789012345678901234567890',
              to: '0xtoken',
            },
            status: TransactionStatus.submitted,
          };

          await controller.submitShieldSubscriptionCryptoApproval(txMeta);

          expect(mockService.startSubscriptionWithCrypto).toHaveBeenCalledTimes(
            1,
          );
        },
      );
    });

    it('should handle subscription crypto approval when shield subscription transaction is submitted with reward subscription ID', async () => {
      await withController(
        {
          state: {
            pricing: MOCK_PRICE_INFO_RESPONSE,
            trialedProducts: [],
            subscriptions: [],
            lastSelectedPaymentMethod: {
              [PRODUCT_TYPES.SHIELD]: {
                type: PAYMENT_TYPES.byCrypto,
                paymentTokenAddress: '0xtoken',
                paymentTokenSymbol: 'USDT',
                plan: RECURRING_INTERVALS.month,
              },
            },
          },
        },
        async ({ controller, mockService }) => {
          mockService.startSubscriptionWithCrypto.mockResolvedValue({
            subscriptionId: 'sub_123',
            status: SUBSCRIPTION_STATUSES.trialing,
          });

          mockService.getSubscriptions
            .mockResolvedValueOnce({
              subscriptions: [],
              trialedProducts: [],
            })
            .mockResolvedValue(MOCK_GET_SUBSCRIPTIONS_RESPONSE);

          // Create a shield subscription approval transaction
          const txMeta = {
            ...generateMockTxMeta(),
            type: TransactionType.shieldSubscriptionApprove,
            chainId: '0x1' as Hex,
            rawTx: '0x123',
            txParams: {
              data: '0x456',
              from: '0x1234567890123456789012345678901234567890',
              to: '0xtoken',
            },
            status: TransactionStatus.submitted,
          };

          await controller.submitShieldSubscriptionCryptoApproval(
            txMeta,
            false, // isSponsored
            'eip155:1:0x1234567890123456789012345678901234567890',
          );

          expect(mockService.startSubscriptionWithCrypto).toHaveBeenCalledWith({
            products: [PRODUCT_TYPES.SHIELD],
            isTrialRequested: true,
            recurringInterval: RECURRING_INTERVALS.month,
            billingCycles: 12,
            chainId: '0x1',
            payerAddress: '0x1234567890123456789012345678901234567890',
            tokenSymbol: 'USDT',
            rawTransaction: '0x123',
            isSponsored: false,
            useTestClock: undefined,
            rewardAccountId:
              'eip155:1:0x1234567890123456789012345678901234567890',
          });
        },
      );
    });

    it('should not handle subscription crypto approval when pricing is not found', async () => {
      await withController(
        {
          state: {
            pricing: undefined,
            trialedProducts: [],
            subscriptions: [],
          },
        },
        async ({ controller, mockService }) => {
          // Create a non-shield subscription transaction
          const txMeta = {
            ...generateMockTxMeta(),
            type: TransactionType.shieldSubscriptionApprove,
            status: TransactionStatus.submitted,
            hash: '0x123',
            rawTx: '0x123',
          };

          await expect(
            controller.submitShieldSubscriptionCryptoApproval(txMeta),
          ).rejects.toThrow('Subscription pricing not found');

          // Verify that startSubscriptionWithCrypto was not called
          expect(
            mockService.startSubscriptionWithCrypto,
          ).not.toHaveBeenCalled();
        },
      );
    });

    it('should not handle subscription crypto approval for non-shield subscription transactions', async () => {
      await withController(
        {
          state: {
            pricing: MOCK_PRICE_INFO_RESPONSE,
            trialedProducts: [],
            subscriptions: [],
          },
        },
        async ({ controller, mockService }) => {
          // Create a non-shield subscription transaction
          const txMeta = {
            ...generateMockTxMeta(),
            type: TransactionType.contractInteraction,
            status: TransactionStatus.submitted,
            hash: '0x123',
          };

          await controller.submitShieldSubscriptionCryptoApproval(txMeta);

          // Verify that decodeTransactionDataHandler was not called
          expect(
            mockService.startSubscriptionWithCrypto,
          ).not.toHaveBeenCalled();
        },
      );
    });

    it('should throw error when chainId is missing', async () => {
      await withController(
        {
          state: {
            pricing: MOCK_PRICE_INFO_RESPONSE,
            trialedProducts: [],
            subscriptions: [],
          },
        },
        async ({ controller, mockService }) => {
          // Create a transaction without chainId
          const txMeta = {
            ...generateMockTxMeta(),
            type: TransactionType.shieldSubscriptionApprove,
            chainId: undefined as unknown as Hex,
            rawTx: '0x123',
            txParams: {
              data: '0x456',
              from: '0x1234567890123456789012345678901234567890',
              to: '0x789',
            },
            status: TransactionStatus.submitted,
            hash: '0x123',
          };

          await expect(
            controller.submitShieldSubscriptionCryptoApproval(txMeta),
          ).rejects.toThrow('Chain ID or raw transaction not found');

          // Verify that decodeTransactionDataHandler was not called due to early error
          expect(
            mockService.startSubscriptionWithCrypto,
          ).not.toHaveBeenCalled();
        },
      );
    });

    it('should throw error when last selected payment method is not found', async () => {
      await withController(
        {
          state: {
            pricing: MOCK_PRICE_INFO_RESPONSE,
            trialedProducts: [],
            subscriptions: [],
          },
        },
        async ({ controller, mockService }) => {
          // Create a shield subscription approval transaction with token address that doesn't exist
          const txMeta = {
            ...generateMockTxMeta(),
            type: TransactionType.shieldSubscriptionApprove,
            chainId: '0x1' as Hex,
            rawTx: '0x123',
            txParams: {
              data: '0x456',
              from: '0x1234567890123456789012345678901234567890',
              to: '0xnonexistent',
            },
            status: TransactionStatus.submitted,
            hash: '0x123',
          };

          await expect(
            controller.submitShieldSubscriptionCryptoApproval(txMeta),
          ).rejects.toThrow('Last selected payment method not found');

          expect(
            mockService.startSubscriptionWithCrypto,
          ).not.toHaveBeenCalled();
        },
      );
    });

    it('should throw error when product price is not found', async () => {
      await withController(
        {
          state: {
            pricing: MOCK_PRICE_INFO_RESPONSE,
            trialedProducts: [],
            subscriptions: [],
            lastSelectedPaymentMethod: {
              [PRODUCT_TYPES.SHIELD]: {
                type: PAYMENT_TYPES.byCrypto,
                paymentTokenAddress: '0xtoken',
                paymentTokenSymbol: 'USDT',
                plan: 'invalidPlan' as RecurringInterval,
              },
            },
          },
        },
        async ({ controller, mockService }) => {
          // Create a shield subscription approval transaction
          const txMeta = {
            ...generateMockTxMeta(),
            type: TransactionType.shieldSubscriptionApprove,
            chainId: '0x1' as Hex,
            rawTx: '0x123',
            txParams: {
              data: '0x456',
              from: '0x1234567890123456789012345678901234567890',
              to: '0xtoken',
            },
            status: TransactionStatus.submitted,
            hash: '0x123',
          };

          await expect(
            controller.submitShieldSubscriptionCryptoApproval(txMeta),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.ProductPriceNotFound,
          );

          expect(
            mockService.startSubscriptionWithCrypto,
          ).not.toHaveBeenCalled();
        },
      );
    });

    it('should update payment method when user has active subscription', async () => {
      await withController(
        {
          state: {
            pricing: MOCK_PRICE_INFO_RESPONSE,
            trialedProducts: [],
            subscriptions: [MOCK_SUBSCRIPTION],
            lastSelectedPaymentMethod: {
              [PRODUCT_TYPES.SHIELD]: {
                type: PAYMENT_TYPES.byCrypto,
                paymentTokenAddress: '0xtoken',
                paymentTokenSymbol: 'USDT',
                plan: RECURRING_INTERVALS.month,
              },
            },
          },
        },
        async ({ controller, mockService }) => {
          mockService.updatePaymentMethodCrypto.mockResolvedValue(undefined);
          mockService.getSubscriptions.mockResolvedValue(
            MOCK_GET_SUBSCRIPTIONS_RESPONSE,
          );

          const txMeta = {
            ...generateMockTxMeta(),
            type: TransactionType.shieldSubscriptionApprove,
            chainId: '0x1' as Hex,
            rawTx: '0x123',
            txParams: {
              data: '0x456',
              from: '0x1234567890123456789012345678901234567890',
              to: '0xtoken',
            },
            status: TransactionStatus.submitted,
          };

          await controller.submitShieldSubscriptionCryptoApproval(txMeta);

          expect(mockService.updatePaymentMethodCrypto).toHaveBeenCalledTimes(
            1,
          );
          expect(
            mockService.startSubscriptionWithCrypto,
          ).not.toHaveBeenCalled();
        },
      );
    });

    it('should throw error when subscription status is not valid for crypto approval', async () => {
      await withController(
        {
          state: {
            pricing: MOCK_PRICE_INFO_RESPONSE,
            trialedProducts: [],
            subscriptions: [],
            lastSelectedPaymentMethod: {
              [PRODUCT_TYPES.SHIELD]: {
                type: PAYMENT_TYPES.byCrypto,
                paymentTokenAddress: '0xtoken',
                paymentTokenSymbol: 'USDT',
                plan: RECURRING_INTERVALS.month,
              },
            },
          },
        },
        async ({ controller, mockService }) => {
          mockService.getSubscriptions.mockResolvedValue({
            subscriptions: [
              {
                ...MOCK_SUBSCRIPTION,
                status: SUBSCRIPTION_STATUSES.incomplete,
              },
            ],
            trialedProducts: [],
          });

          const txMeta = {
            ...generateMockTxMeta(),
            type: TransactionType.shieldSubscriptionApprove,
            chainId: '0x1' as Hex,
            rawTx: '0x123',
            txParams: {
              data: '0x456',
              from: '0x1234567890123456789012345678901234567890',
              to: '0xtoken',
            },
            status: TransactionStatus.submitted,
          };

          await expect(
            controller.submitShieldSubscriptionCryptoApproval(txMeta),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.SubscriptionNotValidForCryptoApproval,
          );
        },
      );
    });
  });

  describe('linkRewards', () => {
    it('should link rewards successfully', async () => {
      await withController(
        {
          state: {
            subscriptions: [MOCK_SUBSCRIPTION],
          },
        },
        async ({ controller, mockService }) => {
          const linkRewardsSpy = jest
            .spyOn(mockService, 'linkRewards')
            .mockResolvedValue({
              success: true,
            });
          await controller.linkRewards({
            subscriptionId: 'sub_123456789',
            rewardAccountId:
              'eip155:1:0x1234567890123456789012345678901234567890',
          });
          expect(linkRewardsSpy).toHaveBeenCalledWith({
            rewardAccountId:
              'eip155:1:0x1234567890123456789012345678901234567890',
          });
          expect(linkRewardsSpy).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should throw error when user is not subscribed', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.linkRewards({
            subscriptionId: 'sub_123456789',
            rewardAccountId:
              'eip155:1:0x1234567890123456789012345678901234567890',
          }),
        ).rejects.toThrow(SubscriptionControllerErrorMessage.UserNotSubscribed);
      });
    });

    it('should throw error when link rewards fails', async () => {
      await withController(
        {
          state: {
            subscriptions: [MOCK_SUBSCRIPTION],
          },
        },
        async ({ controller, mockService }) => {
          mockService.linkRewards.mockResolvedValue({
            success: false,
          });
          await expect(
            controller.linkRewards({
              subscriptionId: 'sub_123456789',
              rewardAccountId:
                'eip155:1:0x1234567890123456789012345678901234567890',
            }),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.LinkRewardsFailed,
          );
        },
      );
    });
  });
});
