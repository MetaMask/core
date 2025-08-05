import { Messenger } from '@metamask/base-controller';

import {
  controllerName,
  Env,
  SubscriptionControllerErrorMessage,
} from './constants';
import { SubscriptionServiceError } from './errors';
import {
  getDefaultSubscriptionControllerState,
  SubscriptionController,
} from './SubscriptionController';
import type {
  AllowedActions,
  AllowedEvents,
  SubscriptionControllerMessenger,
  SubscriptionControllerOptions,
  SubscriptionControllerState,
  Subscription,
} from './types';

// Mock data
const MOCK_SUBSCRIPTION: Subscription = {
  id: 'sub_123456789',
  createdDate: '2024-01-01T00:00:00Z',
  status: 'active',
  paymentStatus: 'completed',
  paymentMethod: 'card',
  paymentType: 'monthly',
  paymentAmount: 9.99,
  paymentCurrency: 'USD',
  paymentDate: '2024-01-01T00:00:00Z',
  paymentId: 'pay_123456789',
};

const MOCK_AUTH_TOKEN_REF = {
  lastRefreshTriggered: '2024-01-01T00:00:00Z',
  refreshStatus: 'completed' as const,
};

const MOCK_PENDING_PAYMENT_TRANSACTIONS = {
  txn_123456789: {
    type: 'subscription_approval' as const,
    status: 'pending' as const,
    chainId: '1',
    hash: '0x123456789abcdef',
  },
};

const MOCK_ACCESS_TOKEN = 'mock-access-token';

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
    allowedActions: ['AuthenticationController:getBearerToken'],
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
function mockSubscriptionMessenger(overrideMessengers?: {
  baseMessenger: Messenger<AllowedActions, AllowedEvents>;
  messenger: SubscriptionControllerMessenger;
}) {
  const { baseMessenger, messenger } =
    overrideMessengers ?? createCustomSubscriptionMessenger();

  const mockGetBearerToken = jest.fn().mockResolvedValue(MOCK_ACCESS_TOKEN);

  jest.spyOn(messenger, 'call').mockImplementation((...args) => {
    const [actionType] = args as [string, ...unknown[]];

    if (actionType === 'AuthenticationController:getBearerToken') {
      return mockGetBearerToken();
    }
    throw new Error(`MOCK_FAIL - unsupported messenger call: ${actionType}`);
  });

  return {
    baseMessenger,
    messenger,
    mockGetBearerToken,
  };
}

/**
 * Creates a mock subscription messenger for testing.
 *
 * @returns The mock messenger and related mocks.
 */
function createMockSubscriptionMessenger(): {
  messenger: SubscriptionControllerMessenger;
  baseMessenger: Messenger<AllowedActions, AllowedEvents>;
  mockGetBearerToken: jest.Mock;
} {
  return mockSubscriptionMessenger();
}

/**
 * Creates a mock subscription service for testing.
 *
 * @returns The mock service and related mocks.
 */
function createMockSubscriptionService() {
  const mockGetSubscription = jest.fn();
  const mockCancelSubscription = jest.fn();

  const mockService = {
    getSubscription: mockGetSubscription,
    cancelSubscription: mockCancelSubscription,
  };

  return {
    mockService,
    mockGetSubscription,
    mockCancelSubscription,
  };
}

/**
 * Helper function to create controller with options.
 */
type WithControllerCallback<ReturnValue> = ({
  controller,
  initialState,
  messenger,
  mockService,
}: {
  controller: SubscriptionController;
  initialState: SubscriptionControllerState;
  messenger: SubscriptionControllerMessenger;
  mockService: ReturnType<typeof createMockSubscriptionService>['mockService'];
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
  const { messenger } = createMockSubscriptionMessenger();
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
    mockService,
  });
}

describe('SubscriptionController', () => {
  describe('constructor', () => {
    it('should be able to instantiate with default options', () => {
      const { messenger } = createMockSubscriptionMessenger();
      const controller = new SubscriptionController({
        messenger,
      });

      expect(controller).toBeDefined();
      expect(controller.state).toStrictEqual(
        getDefaultSubscriptionControllerState(),
      );
    });

    it('should create default subscription service and use messenger for auth token', async () => {
      const { messenger, mockGetBearerToken } = createMockSubscriptionMessenger();
      
      // Create controller without custom subscription service to test default creation
      const controller = new SubscriptionController({
        messenger,
        config: {
          env: Env.PRD,
        },
      });

      expect(controller).toBeDefined();
      
      // Mock fetch to test the default service
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(MOCK_SUBSCRIPTION),
      });
      global.fetch = mockFetch;

      try {
        await controller.getSubscription();
        
        // Verify that the messenger's call method was used to get the bearer token
        expect(mockGetBearerToken).toHaveBeenCalled();
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('subscription-service.api.cx.metamask.io'),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
              Authorization: `Bearer ${MOCK_ACCESS_TOKEN}`,
            }),
          })
        );
      } finally {
        // Clean up
        delete (global as any).fetch;
      }
    });

    it('should be able to instantiate with custom config', () => {
      const { messenger } = createMockSubscriptionMessenger();
      const controller = new SubscriptionController({
        messenger,
        config: {
          env: Env.DEV,
        },
      });

      expect(controller).toBeDefined();
      expect(controller.state).toStrictEqual(
        getDefaultSubscriptionControllerState(),
      );
    });

    it('should be able to instantiate with initial state', () => {
      const { messenger } = createMockSubscriptionMessenger();
      const initialState: Partial<SubscriptionControllerState> = {
        subscription: MOCK_SUBSCRIPTION,
        authTokenRef: MOCK_AUTH_TOKEN_REF,
      };

      const controller = new SubscriptionController({
        messenger,
        state: initialState,
      });

      expect(controller).toBeDefined();
      expect(controller.state.subscription).toStrictEqual(MOCK_SUBSCRIPTION);
      expect(controller.state.authTokenRef).toStrictEqual(MOCK_AUTH_TOKEN_REF);
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

    it('should create default subscription service when not provided', () => {
      const { messenger } = createMockSubscriptionMessenger();

      const controller = new SubscriptionController({
        messenger,
        config: {
          env: Env.PRD,
        },
      });

      expect(controller).toBeDefined();
      // The controller should have created a SubscriptionService internally
      expect(controller.state).toStrictEqual(
        getDefaultSubscriptionControllerState(),
      );
    });
  });

  describe('getSubscription', () => {
    it('should fetch and store subscription successfully', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getSubscription.mockResolvedValue(MOCK_SUBSCRIPTION);

        const result = await controller.getSubscription();

        expect(result).toStrictEqual(MOCK_SUBSCRIPTION);
        expect(controller.state.subscription).toStrictEqual(MOCK_SUBSCRIPTION);
        expect(mockService.getSubscription).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle null subscription response', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getSubscription.mockResolvedValue(null);

        const result = await controller.getSubscription();

        expect(result).toBeNull();
        expect(controller.state.subscription).toBeUndefined();
        expect(mockService.getSubscription).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle subscription service errors', async () => {
      await withController(async ({ controller, mockService }) => {
        const errorMessage = 'Failed to fetch subscription';
        mockService.getSubscription.mockRejectedValue(
          new SubscriptionServiceError(errorMessage),
        );

        await expect(controller.getSubscription()).rejects.toThrow(
          SubscriptionServiceError,
        );

        expect(controller.state.subscription).toBeUndefined();
        expect(mockService.getSubscription).toHaveBeenCalledTimes(1);
      });
    });

    it('should update state when subscription is fetched', async () => {
      const initialSubscription = { ...MOCK_SUBSCRIPTION, id: 'sub_old' };
      const newSubscription = { ...MOCK_SUBSCRIPTION, id: 'sub_new' };

      await withController(
        {
          state: {
            subscription: initialSubscription,
          },
        },
        async ({ controller, mockService }) => {
          expect(controller.state.subscription).toStrictEqual(
            initialSubscription,
          );

          // Fetch new subscription
          mockService.getSubscription.mockResolvedValue(newSubscription);
          const result = await controller.getSubscription();

          expect(result).toStrictEqual(newSubscription);
          expect(controller.state.subscription).toStrictEqual(newSubscription);
          expect(controller.state.subscription?.id).toBe('sub_new');
        },
      );
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully when user is subscribed', async () => {
      await withController(
        {
          state: {
            subscription: MOCK_SUBSCRIPTION,
          },
        },
        async ({ controller, mockService }) => {
          mockService.cancelSubscription.mockResolvedValue(undefined);

          expect(
            await controller.cancelSubscription('sub_123456789'),
          ).toBeUndefined();

          expect(mockService.cancelSubscription).toHaveBeenCalledWith({
            subscriptionId: 'sub_123456789',
          });
          expect(mockService.cancelSubscription).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should throw error when user is not subscribed', async () => {
      await withController(
        {
          state: {
            subscription: undefined,
          },
        },
        async ({ controller }) => {
          await expect(
            controller.cancelSubscription('sub_123456789'),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.UserNotSubscribed,
          );
        },
      );
    });

    it('should throw error when user is not subscribed with different subscription ID', async () => {
      await withController(
        {
          state: {
            subscription: undefined,
          },
        },
        async ({ controller }) => {
          await expect(
            controller.cancelSubscription('different_sub_id'),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.UserNotSubscribed,
          );
        },
      );
    });

    it('should use the subscription ID from state when canceling', async () => {
      const subscriptionWithDifferentId = {
        ...MOCK_SUBSCRIPTION,
        id: 'different_sub_id',
      };
      await withController(
        {
          state: {
            subscription: subscriptionWithDifferentId,
          },
        },
        async ({ controller, mockService }) => {
          mockService.cancelSubscription.mockResolvedValue(undefined);

          expect(
            await controller.cancelSubscription('different_sub_id'),
          ).toBeUndefined();

          expect(mockService.cancelSubscription).toHaveBeenCalledWith({
            subscriptionId: 'different_sub_id',
          });
          expect(mockService.cancelSubscription).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should validate subscription exists before attempting to cancel', async () => {
      await withController(
        {
          state: {
            subscription: null as unknown as Subscription, // Test with null subscription
          },
        },
        async ({ controller }) => {
          await expect(
            controller.cancelSubscription('sub_123456789'),
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
            subscription: undefined,
          },
        },
        async ({ controller, mockService }) => {
          await expect(
            controller.cancelSubscription('sub_123456789'),
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
            subscription: MOCK_SUBSCRIPTION,
          },
        },
        async ({ controller, mockService }) => {
          const errorMessage = 'Failed to cancel subscription';
          mockService.cancelSubscription.mockRejectedValue(
            new SubscriptionServiceError(errorMessage),
          );

          await expect(
            controller.cancelSubscription('sub_123456789'),
          ).rejects.toThrow(SubscriptionServiceError);

          expect(mockService.cancelSubscription).toHaveBeenCalledWith({
            subscriptionId: 'sub_123456789',
          });
          expect(mockService.cancelSubscription).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should handle network errors during cancellation', async () => {
      await withController(
        {
          state: {
            subscription: MOCK_SUBSCRIPTION,
          },
        },
        async ({ controller, mockService }) => {
          const networkError = new Error('Network error');
          mockService.cancelSubscription.mockRejectedValue(networkError);

          await expect(
            controller.cancelSubscription('sub_123456789'),
          ).rejects.toThrow(networkError);

          expect(mockService.cancelSubscription).toHaveBeenCalledWith({
            subscriptionId: 'sub_123456789',
          });
          expect(mockService.cancelSubscription).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('state management', () => {
    it('should properly initialize with default state', () => {
      const { messenger } = createMockSubscriptionMessenger();
      const controller = new SubscriptionController({
        messenger,
      });

      expect(controller.state).toStrictEqual(
        getDefaultSubscriptionControllerState(),
      );
    });

    it('should merge initial state with default state', () => {
      const { messenger } = createMockSubscriptionMessenger();
      const initialState: Partial<SubscriptionControllerState> = {
        subscription: MOCK_SUBSCRIPTION,
        authTokenRef: MOCK_AUTH_TOKEN_REF,
        pendingPaymentTransactions: MOCK_PENDING_PAYMENT_TRANSACTIONS,
      };

      const controller = new SubscriptionController({
        messenger,
        state: initialState,
      });

      expect(controller.state.subscription).toStrictEqual(MOCK_SUBSCRIPTION);
      expect(controller.state.authTokenRef).toStrictEqual(MOCK_AUTH_TOKEN_REF);
      expect(controller.state.pendingPaymentTransactions).toStrictEqual(
        MOCK_PENDING_PAYMENT_TRANSACTIONS,
      );
    });

    it('should update state correctly through getSubscription', async () => {
      const { messenger } = createMockSubscriptionMessenger();
      const { mockService } = createMockSubscriptionService();
      const controller = new SubscriptionController({
        messenger,
        subscriptionService: mockService,
      });

      const newSubscription = { ...MOCK_SUBSCRIPTION, id: 'new_sub_id' };
      mockService.getSubscription.mockResolvedValue(newSubscription);

      await controller.getSubscription();

      expect(controller.state.subscription).toStrictEqual(newSubscription);
      expect(controller.state.subscription?.id).toBe('new_sub_id');
    });

    it('should handle partial state updates through initial state', () => {
      const { messenger } = createMockSubscriptionMessenger();
      const controller = new SubscriptionController({
        messenger,
        state: {
          subscription: MOCK_SUBSCRIPTION,
          authTokenRef: {
            lastRefreshTriggered: '2024-02-01T00:00:00Z',
            refreshStatus: 'pending',
          },
        },
      });

      expect(controller.state.subscription).toStrictEqual(MOCK_SUBSCRIPTION);
      expect(controller.state.authTokenRef?.lastRefreshTriggered).toBe(
        '2024-02-01T00:00:00Z',
      );
      expect(controller.state.authTokenRef?.refreshStatus).toBe('pending');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete subscription lifecycle with updated logic', async () => {
      await withController(async ({ controller, mockService }) => {
        // 1. Initially no subscription
        expect(controller.state.subscription).toBeUndefined();

        // 2. Try to cancel subscription (should fail - user not subscribed)
        await expect(
          controller.cancelSubscription('sub_123456789'),
        ).rejects.toThrow(SubscriptionControllerErrorMessage.UserNotSubscribed);

        // 3. Fetch subscription
        mockService.getSubscription.mockResolvedValue(MOCK_SUBSCRIPTION);
        const subscription = await controller.getSubscription();

        expect(subscription).toStrictEqual(MOCK_SUBSCRIPTION);
        expect(controller.state.subscription).toStrictEqual(MOCK_SUBSCRIPTION);

        // 4. Now cancel should work (user is subscribed)
        mockService.cancelSubscription.mockResolvedValue(undefined);
        expect(
          await controller.cancelSubscription('sub_123456789'),
        ).toBeUndefined();

        expect(mockService.cancelSubscription).toHaveBeenCalledWith({
          subscriptionId: 'sub_123456789',
        });
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty subscription ID in cancellation', async () => {
      await withController(
        {
          state: {
            subscription: MOCK_SUBSCRIPTION,
          },
        },
        async ({ controller, mockService }) => {
          mockService.cancelSubscription.mockResolvedValue(undefined);

          expect(await controller.cancelSubscription('')).toBeUndefined();

          expect(mockService.cancelSubscription).toHaveBeenCalledWith({
            subscriptionId: '',
          });
        },
      );
    });

    it('should handle very long subscription ID', async () => {
      await withController(
        {
          state: {
            subscription: MOCK_SUBSCRIPTION,
          },
        },
        async ({ controller, mockService }) => {
          const longSubscriptionId = 'a'.repeat(1000);
          mockService.cancelSubscription.mockResolvedValue(undefined);

          expect(
            await controller.cancelSubscription(longSubscriptionId),
          ).toBeUndefined();

          expect(mockService.cancelSubscription).toHaveBeenCalledWith({
            subscriptionId: longSubscriptionId,
          });
        },
      );
    });

    it('should handle subscription with all optional fields undefined', async () => {
      await withController(async ({ controller, mockService }) => {
        const minimalSubscription: Subscription = {
          id: 'minimal_sub',
          createdDate: '2024-01-01T00:00:00Z',
          status: 'active',
          paymentStatus: 'pending',
          paymentMethod: 'card',
          paymentType: 'monthly',
          paymentAmount: 0,
          paymentCurrency: 'USD',
          paymentDate: '2024-01-01T00:00:00Z',
          paymentId: 'pay_minimal',
        };

        mockService.getSubscription.mockResolvedValue(minimalSubscription);

        const result = await controller.getSubscription();

        expect(result).toStrictEqual(minimalSubscription);
        expect(controller.state.subscription).toStrictEqual(
          minimalSubscription,
        );
      });
    });
  });
});
