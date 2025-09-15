import { deriveStateFromMetadata, Messenger } from '@metamask/base-controller';

import {
  controllerName,
  SubscriptionControllerErrorMessage,
} from './constants';
import { SubscriptionServiceError } from './errors';
import {
  getDefaultSubscriptionControllerState,
  SubscriptionController,
  type AllowedActions,
  type AllowedEvents,
  type SubscriptionControllerMessenger,
  type SubscriptionControllerOptions,
  type SubscriptionControllerState,
} from './SubscriptionController';
import type {
  Subscription,
  PricingResponse,
  ProductPricing,
  PricingPaymentMethod,
  StartCryptoSubscriptionRequest,
  StartCryptoSubscriptionResponse,
  UpdatePaymentMethodOpts,
} from './types';
import {
  PaymentType,
  ProductType,
  RecurringInterval,
  SubscriptionStatus,
} from './types';

// Mock data
const MOCK_SUBSCRIPTION: Subscription = {
  id: 'sub_123456789',
  products: [
    {
      name: ProductType.SHIELD,
      id: 'prod_shield_basic',
      currency: 'usd',
      amount: 900,
    },
  ],
  currentPeriodStart: '2024-01-01T00:00:00Z',
  currentPeriodEnd: '2024-02-01T00:00:00Z',
  status: SubscriptionStatus.active,
  interval: RecurringInterval.month,
  paymentMethod: {
    type: PaymentType.byCard,
  },
};

const MOCK_PRODUCT_PRICE: ProductPricing = {
  name: ProductType.SHIELD,
  prices: [
    {
      interval: RecurringInterval.month,
      currency: 'usd',
      unitAmount: 900,
      unitDecimals: 2,
      trialPeriodDays: 0,
      minBillingCycles: 1,
    },
  ],
};

const MOCK_PRICING_PAYMENT_METHOD: PricingPaymentMethod = {
  type: PaymentType.byCrypto,
  chains: [
    {
      chainId: '0x1',
      paymentAddress: '0xspender',
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

/**
 * Creates a custom subscription messenger, in case tests need different permissions
 *
 * @param props - overrides
 * @param props.overrideEvents - override events
 * @returns base messenger, and messenger. You can pass this into the mocks below to mock messenger calls
 */
function createCustomSubscriptionMessenger(props?: {
  overrideEvents?: AllowedEvents['type'][];
}) {
  const baseMessenger = new Messenger<AllowedActions, AllowedEvents>();

  const messenger = baseMessenger.getRestricted<
    typeof controllerName,
    AllowedActions['type'],
    AllowedEvents['type']
  >({
    name: controllerName,
    allowedActions: [
      'AuthenticationController:getBearerToken',
      'AuthenticationController:performSignOut',
    ],
    allowedEvents: props?.overrideEvents ?? [
      'AuthenticationController:stateChange',
    ],
  });

  return {
    baseMessenger,
    messenger,
  };
}

/**
 * Jest Mock Utility to generate a mock Subscription Messenger
 *
 * @param overrideMessengers - override messengers if need to modify the underlying permissions
 * @param overrideMessengers.baseMessenger - base messenger to override
 * @param overrideMessengers.messenger - messenger to override
 * @returns series of mocks to actions that can be called
 */
function createMockSubscriptionMessenger(overrideMessengers?: {
  baseMessenger: Messenger<AllowedActions, AllowedEvents>;
  messenger: SubscriptionControllerMessenger;
}) {
  const { baseMessenger, messenger } =
    overrideMessengers ?? createCustomSubscriptionMessenger();

  const mockPerformSignOut = jest.fn();
  baseMessenger.registerActionHandler(
    'AuthenticationController:performSignOut',
    mockPerformSignOut,
  );

  return {
    baseMessenger,
    messenger,
    mockPerformSignOut,
  };
}

/**
 * Creates a mock subscription service for testing.
 *
 * @returns The mock service and related mocks.
 */
function createMockSubscriptionService() {
  const mockGetSubscriptions = jest.fn().mockImplementation();
  const mockCancelSubscription = jest.fn();
  const mockStartSubscriptionWithCard = jest.fn();
  const mockGetPricing = jest.fn();
  const mockStartSubscriptionWithCrypto = jest.fn();
  const mockUpdatePaymentMethodCard = jest.fn();
  const mockUpdatePaymentMethodCrypto = jest.fn();
  const mockGetBillingPortalUrl = jest.fn();

  const mockService = {
    getSubscriptions: mockGetSubscriptions,
    cancelSubscription: mockCancelSubscription,
    startSubscriptionWithCard: mockStartSubscriptionWithCard,
    getPricing: mockGetPricing,
    startSubscriptionWithCrypto: mockStartSubscriptionWithCrypto,
    updatePaymentMethodCard: mockUpdatePaymentMethodCard,
    updatePaymentMethodCrypto: mockUpdatePaymentMethodCrypto,
    getBillingPortalUrl: mockGetBillingPortalUrl,
  };

  return {
    mockService,
    mockGetSubscriptions,
    mockCancelSubscription,
    mockStartSubscriptionWithCard,
    mockGetPricing,
    mockStartSubscriptionWithCrypto,
    mockUpdatePaymentMethodCard,
    mockUpdatePaymentMethodCrypto,
  };
}

/**
 * Helper function to create controller with options.
 */
type WithControllerCallback<ReturnValue> = (params: {
  controller: SubscriptionController;
  initialState: SubscriptionControllerState;
  messenger: SubscriptionControllerMessenger;
  baseMessenger: Messenger<AllowedActions, AllowedEvents>;
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
) {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const { messenger, mockPerformSignOut, baseMessenger } =
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
    baseMessenger,
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

  describe('getSubscription', () => {
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
          mockService.cancelSubscription.mockResolvedValue(undefined);
          expect(
            await controller.cancelSubscription({
              subscriptionId: MOCK_SUBSCRIPTION.id,
            }),
          ).toBeUndefined();
          expect(controller.state.subscriptions).toStrictEqual([
            { ...MOCK_SUBSCRIPTION, status: SubscriptionStatus.canceled },
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
            products: [ProductType.SHIELD],
            isTrialRequested: true,
            recurringInterval: RecurringInterval.month,
          });

          expect(result).toStrictEqual(MOCK_START_SUBSCRIPTION_RESPONSE);
          expect(mockService.startSubscriptionWithCard).toHaveBeenCalledWith({
            products: [ProductType.SHIELD],
            isTrialRequested: true,
            recurringInterval: RecurringInterval.month,
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
              products: [ProductType.SHIELD],
              isTrialRequested: true,
              recurringInterval: RecurringInterval.month,
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
              products: [ProductType.SHIELD],
              isTrialRequested: true,
              recurringInterval: RecurringInterval.month,
            }),
          ).rejects.toThrow(SubscriptionServiceError);

          expect(mockService.startSubscriptionWithCard).toHaveBeenCalledWith({
            products: [ProductType.SHIELD],
            isTrialRequested: true,
            recurringInterval: RecurringInterval.month,
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
            products: [ProductType.SHIELD],
            isTrialRequested: false,
            recurringInterval: RecurringInterval.month,
            billingCycles: 3,
            chainId: '0x1',
            payerAddress: '0x0000000000000000000000000000000000000001',
            tokenSymbol: 'USDC',
            rawTransaction: '0xdeadbeef',
          };

          const response: StartCryptoSubscriptionResponse = {
            subscriptionId: 'sub_crypto_123',
            status: SubscriptionStatus.active,
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
        mockService.cancelSubscription.mockResolvedValue(undefined);
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
      await withController(async ({ controller, mockService }) => {
        // Provide product pricing and crypto payment info with unitDecimals small to avoid integer div to 0
        mockService.getPricing.mockResolvedValue(MOCK_PRICE_INFO_RESPONSE);

        const result = await controller.getCryptoApproveTransactionParams({
          chainId: '0x1',
          paymentTokenAddress: '0xtoken',
          productType: ProductType.SHIELD,
          interval: RecurringInterval.month,
        });

        expect(result).toStrictEqual({
          approveAmount: '9000000000000000000',
          paymentAddress: '0xspender',
          paymentTokenAddress: '0xtoken',
          chainId: '0x1',
        });
      });
    });

    it('throws when product price not found', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getPricing.mockResolvedValue({
          products: [],
          paymentMethods: [],
        });

        await expect(
          controller.getCryptoApproveTransactionParams({
            chainId: '0x1',
            paymentTokenAddress: '0xtoken',
            productType: ProductType.SHIELD,
            interval: RecurringInterval.month,
          }),
        ).rejects.toThrow('Product price not found');
      });
    });

    it('throws when price not found for interval', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getPricing.mockResolvedValue({
          products: [
            {
              name: ProductType.SHIELD,
              prices: [
                {
                  interval: RecurringInterval.year,
                  currency: 'usd',
                  unitAmount: 10,
                  unitDecimals: 18,
                  trialPeriodDays: 0,
                  minBillingCycles: 1,
                },
              ],
            },
          ],
          paymentMethods: [],
        });

        await expect(
          controller.getCryptoApproveTransactionParams({
            chainId: '0x1',
            paymentTokenAddress: '0xtoken',
            productType: ProductType.SHIELD,
            interval: RecurringInterval.month,
          }),
        ).rejects.toThrow('Price not found');
      });
    });

    it('throws when chains payment info not found', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getPricing.mockResolvedValue({
          ...MOCK_PRICE_INFO_RESPONSE,
          paymentMethods: [
            {
              type: PaymentType.byCard,
            },
          ],
        });

        await expect(
          controller.getCryptoApproveTransactionParams({
            chainId: '0x1',
            paymentTokenAddress: '0xtoken',
            productType: ProductType.SHIELD,
            interval: RecurringInterval.month,
          }),
        ).rejects.toThrow('Chains payment info not found');
      });
    });

    it('throws when invalid chain id', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getPricing.mockResolvedValue({
          ...MOCK_PRICE_INFO_RESPONSE,
          paymentMethods: [
            {
              type: PaymentType.byCrypto,
              chains: [
                {
                  chainId: '0x2',
                  paymentAddress: '0xspender',
                  tokens: [],
                },
              ],
            },
          ],
        });

        await expect(
          controller.getCryptoApproveTransactionParams({
            chainId: '0x1',
            paymentTokenAddress: '0xtoken',
            productType: ProductType.SHIELD,
            interval: RecurringInterval.month,
          }),
        ).rejects.toThrow('Invalid chain id');
      });
    });

    it('throws when invalid token address', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getPricing.mockResolvedValue(MOCK_PRICE_INFO_RESPONSE);

        await expect(
          controller.getCryptoApproveTransactionParams({
            chainId: '0x1',
            paymentTokenAddress: '0xtoken-invalid',
            productType: ProductType.SHIELD,
            interval: RecurringInterval.month,
          }),
        ).rejects.toThrow('Invalid token address');
      });
    });

    it('throws when conversion rate not found', async () => {
      await withController(async ({ controller, mockService }) => {
        // Valid product and chain/token, but token lacks conversion rate for currency
        mockService.getPricing.mockResolvedValue({
          ...MOCK_PRICE_INFO_RESPONSE,
          paymentMethods: [
            {
              type: PaymentType.byCrypto,
              chains: [
                {
                  chainId: '0x1',
                  paymentAddress: '0xspender',
                  tokens: [
                    {
                      address: '0xtoken',
                      decimals: 18,
                      conversionRate: {},
                    },
                  ],
                },
              ],
            },
          ],
        });

        await expect(
          controller.getCryptoApproveTransactionParams({
            chainId: '0x1',
            paymentTokenAddress: '0xtoken',
            productType: ProductType.SHIELD,
            interval: RecurringInterval.month,
          }),
        ).rejects.toThrow('Conversion rate not found');
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
            'anonymous',
          ),
        ).toMatchInlineSnapshot(`Object {}`);
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
        Object {
          "subscriptions": Array [],
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
        Object {
          "subscriptions": Array [],
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
        Object {
          "subscriptions": Array [],
        }
      `);
      });
    });
  });

  describe('updatePaymentMethod', () => {
    it('should update card payment method successfully', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.updatePaymentMethodCard.mockResolvedValue({});
        mockService.getSubscriptions.mockResolvedValue(
          MOCK_GET_SUBSCRIPTIONS_RESPONSE,
        );

        await controller.updatePaymentMethod({
          subscriptionId: 'sub_123456789',
          paymentType: PaymentType.byCard,
          recurringInterval: RecurringInterval.month,
        });

        expect(mockService.updatePaymentMethodCard).toHaveBeenCalledWith({
          subscriptionId: 'sub_123456789',
          recurringInterval: RecurringInterval.month,
        });

        expect(controller.state.subscriptions).toStrictEqual([
          MOCK_SUBSCRIPTION,
        ]);
      });
    });

    it('should update crypto payment method successfully', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.updatePaymentMethodCrypto.mockResolvedValue({});
        mockService.getSubscriptions.mockResolvedValue(
          MOCK_GET_SUBSCRIPTIONS_RESPONSE,
        );

        const opts: UpdatePaymentMethodOpts = {
          paymentType: PaymentType.byCrypto,
          subscriptionId: 'sub_123456789',
          chainId: '0x1',
          payerAddress: '0x0000000000000000000000000000000000000001',
          tokenSymbol: 'USDC',
          rawTransaction: '0xdeadbeef',
          recurringInterval: RecurringInterval.month,
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
          recurringInterval: RecurringInterval.month,
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
});
