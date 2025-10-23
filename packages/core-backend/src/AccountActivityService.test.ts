import type { InternalAccount } from '@metamask/keyring-internal-api';
import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import {
  AccountActivityService,
  type AccountActivityServiceMessenger,
  type SubscriptionOptions,
} from './AccountActivityService';
import type { ServerNotificationMessage } from './BackendWebSocketService';
import { WebSocketState } from './BackendWebSocketService';
import type { Transaction, BalanceUpdate } from './types';
import type { AccountActivityMessage } from './types';
import { flushPromises } from '../../../tests/helpers';

type AllAccountActivityServiceActions =
  MessengerActions<AccountActivityServiceMessenger>;

type AllAccountActivityServiceEvents =
  MessengerEvents<AccountActivityServiceMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllAccountActivityServiceActions,
  AllAccountActivityServiceEvents
>;

// Helper function for completing async operations
const completeAsyncOperations = async (timeoutMs = 0) => {
  await flushPromises();
  // Allow nested async operations to complete
  if (timeoutMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  }
  await flushPromises();
};

// Mock function to create test accounts
const createMockInternalAccount = (options: {
  address: string;
}): InternalAccount => ({
  address: options.address.toLowerCase() as Hex,
  id: `test-account-${options.address.slice(-6)}`,
  metadata: {
    name: 'Test Account',
    importTime: Date.now(),
    keyring: {
      type: 'HD Key Tree',
    },
  },
  options: {},
  methods: [],
  type: 'eip155:eoa',
  scopes: ['eip155:1'], // Required scopes property
});

/**
 * Creates and returns a root messenger for testing
 *
 * @returns A messenger instance
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

/**
 * Creates a real messenger with registered mock actions for testing
 * Each call creates a completely independent messenger to ensure test isolation
 *
 * @returns Object containing the messenger and mock action functions
 */
const getMessenger = (): {
  rootMessenger: RootMessenger;
  messenger: AccountActivityServiceMessenger;
  mocks: {
    getSelectedAccount: jest.Mock;
    connect: jest.Mock;
    subscribe: jest.Mock;
    channelHasSubscription: jest.Mock;
    getSubscriptionsByChannel: jest.Mock;
    findSubscriptionsByChannelPrefix: jest.Mock;
    forceReconnection: jest.Mock;
    addChannelCallback: jest.Mock;
    removeChannelCallback: jest.Mock;
  };
} => {
  // Use any types for the root messenger to avoid complex type constraints in tests
  // Create a unique root messenger for each test
  const rootMessenger = getRootMessenger();
  const messenger: AccountActivityServiceMessenger = new Messenger<
    'AccountActivityService',
    AllAccountActivityServiceActions,
    AllAccountActivityServiceEvents,
    RootMessenger
  >({
    namespace: 'AccountActivityService',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: [
      'AccountsController:getSelectedAccount',
      'BackendWebSocketService:connect',
      'BackendWebSocketService:forceReconnection',
      'BackendWebSocketService:subscribe',
      'BackendWebSocketService:getConnectionInfo',
      'BackendWebSocketService:channelHasSubscription',
      'BackendWebSocketService:getSubscriptionsByChannel',
      'BackendWebSocketService:findSubscriptionsByChannelPrefix',
      'BackendWebSocketService:addChannelCallback',
      'BackendWebSocketService:removeChannelCallback',
    ],
    events: [
      'AccountsController:selectedAccountChange',
      'BackendWebSocketService:connectionStateChanged',
    ],
    messenger,
  });

  // Create mock action handlers
  const mockGetSelectedAccount = jest.fn();
  const mockConnect = jest.fn();
  const mockForceReconnection = jest.fn();
  const mockSubscribe = jest.fn();
  const mockChannelHasSubscription = jest.fn();
  const mockGetSubscriptionsByChannel = jest.fn();
  const mockFindSubscriptionsByChannelPrefix = jest.fn().mockReturnValue([]);
  const mockAddChannelCallback = jest.fn();
  const mockRemoveChannelCallback = jest.fn();

  // Register all action handlers
  rootMessenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    mockGetSelectedAccount,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:connect',
    mockConnect,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:forceReconnection',
    mockForceReconnection,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:subscribe',
    mockSubscribe,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:channelHasSubscription',
    mockChannelHasSubscription,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:getSubscriptionsByChannel',
    mockGetSubscriptionsByChannel,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:findSubscriptionsByChannelPrefix',
    mockFindSubscriptionsByChannelPrefix,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:addChannelCallback',
    mockAddChannelCallback,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:removeChannelCallback',
    mockRemoveChannelCallback,
  );

  return {
    rootMessenger,
    messenger,
    mocks: {
      getSelectedAccount: mockGetSelectedAccount,
      connect: mockConnect,
      forceReconnection: mockForceReconnection,
      subscribe: mockSubscribe,
      channelHasSubscription: mockChannelHasSubscription,
      getSubscriptionsByChannel: mockGetSubscriptionsByChannel,
      findSubscriptionsByChannelPrefix: mockFindSubscriptionsByChannelPrefix,
      addChannelCallback: mockAddChannelCallback,
      removeChannelCallback: mockRemoveChannelCallback,
    },
  };
};

/**
 * Creates an independent AccountActivityService with its own messenger for tests that need isolation
 * This is the primary way to create service instances in tests to ensure proper isolation
 *
 * @param options - Optional configuration for service creation
 * @param options.subscriptionNamespace - Custom subscription namespace
 * @returns Object containing the service, messenger, root messenger, and mock functions
 */
const createIndependentService = (options?: {
  subscriptionNamespace?: string;
}) => {
  const { subscriptionNamespace } = options ?? {};

  const messengerSetup = getMessenger();

  const service = new AccountActivityService({
    messenger: messengerSetup.messenger,
    subscriptionNamespace,
  });

  return {
    service,
    messenger: messengerSetup.messenger,
    rootMessenger: messengerSetup.rootMessenger,
    mocks: messengerSetup.mocks,
    // Convenience cleanup method
    destroy: () => {
      service.destroy();
    },
  };
};

/**
 * Creates a service setup for testing that includes common test account setup
 *
 * @param accountAddress - Address for the test account
 * @returns Object containing the service, messenger, mocks, and mock account
 */
const createServiceWithTestAccount = (
  accountAddress: string = '0x1234567890123456789012345678901234567890',
) => {
  const serviceSetup = createIndependentService();

  // Create mock selected account
  const mockSelectedAccount: InternalAccount = {
    id: 'test-account-1',
    address: accountAddress as Hex,
    metadata: {
      name: 'Test Account',
      importTime: Date.now(),
      keyring: { type: 'HD Key Tree' },
    },
    options: {},
    methods: [],
    scopes: ['eip155:1'],
    type: 'eip155:eoa',
  };

  // Setup account-related mock implementations
  serviceSetup.mocks.getSelectedAccount.mockReturnValue(mockSelectedAccount);

  return {
    ...serviceSetup,
    mockSelectedAccount,
  };
};

/**
 * Test configuration options for withService
 */
type WithServiceOptions = {
  subscriptionNamespace?: string;
  accountAddress?: string;
};

/**
 * The callback that `withService` calls.
 */
type WithServiceCallback<ReturnValue> = (payload: {
  service: AccountActivityService;
  messenger: AccountActivityServiceMessenger;
  rootMessenger: RootMessenger;
  mocks: {
    getSelectedAccount: jest.Mock;
    connect: jest.Mock;
    forceReconnection: jest.Mock;
    subscribe: jest.Mock;
    channelHasSubscription: jest.Mock;
    getSubscriptionsByChannel: jest.Mock;
    findSubscriptionsByChannelPrefix: jest.Mock;
    addChannelCallback: jest.Mock;
    removeChannelCallback: jest.Mock;
  };
  mockSelectedAccount?: InternalAccount;
  destroy: () => void;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * Helper function to extract the system notification callback from messenger calls
 *
 * @param mocks - The mocks object from withService
 * @param mocks.addChannelCallback - Mock function for adding channel callbacks
 * @returns The system notification callback function
 */
const getSystemNotificationCallback = (mocks: {
  addChannelCallback: jest.Mock;
}): ((notification: ServerNotificationMessage) => void) => {
  const systemCallbackCall = mocks.addChannelCallback.mock.calls.find(
    (call: unknown[]) =>
      call[0] &&
      typeof call[0] === 'object' &&
      'channelName' in call[0] &&
      call[0].channelName === 'system-notifications.v1.account-activity.v1',
  );

  if (!systemCallbackCall) {
    throw new Error('systemCallbackCall is undefined');
  }

  const callbackOptions = systemCallbackCall[0] as {
    callback: (notification: ServerNotificationMessage) => void;
  };
  return callbackOptions.callback;
};

/**
 * Wrap tests for the AccountActivityService by ensuring that the service is
 * created ahead of time and then safely destroyed afterward as needed.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the service constructor. All constructor
 * arguments are optional and will be filled in with defaults as needed
 * (including `messenger`). The function is called with the new
 * service, root messenger, and service messenger.
 * @returns The same return value as the given function.
 */
async function withService<ReturnValue>(
  ...args:
    | [WithServiceCallback<ReturnValue>]
    | [WithServiceOptions, WithServiceCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ subscriptionNamespace, accountAddress }, testFunction] =
    args.length === 2
      ? args
      : [
          {
            subscriptionNamespace: undefined,
            accountAddress: undefined,
          },
          args[0],
        ];

  const setup = accountAddress
    ? createServiceWithTestAccount(accountAddress)
    : createIndependentService({ subscriptionNamespace });

  try {
    return await testFunction({
      service: setup.service,
      messenger: setup.messenger,
      rootMessenger: setup.rootMessenger,
      mocks: setup.mocks,
      mockSelectedAccount:
        'mockSelectedAccount' in setup
          ? (setup.mockSelectedAccount as InternalAccount)
          : undefined,
      destroy: setup.destroy,
    });
  } finally {
    setup.destroy();
  }
}

describe('AccountActivityService', () => {
  // =============================================================================
  // CONSTRUCTOR TESTS
  // =============================================================================
  describe('constructor', () => {
    it('should create AccountActivityService with comprehensive initialization and verify service properties', async () => {
      await withService(async ({ service, messenger, mocks }) => {
        expect(service).toBeInstanceOf(AccountActivityService);
        expect(service.name).toBe('AccountActivityService');

        // Status changed event is only published when WebSocket connects
        const statusChangedEventListener = jest.fn();
        messenger.subscribe(
          'AccountActivityService:statusChanged',
          statusChangedEventListener,
        );
        expect(statusChangedEventListener).not.toHaveBeenCalled();

        // Verify system notification callback was registered
        expect(mocks.addChannelCallback).toHaveBeenCalledWith({
          channelName: 'system-notifications.v1.account-activity.v1',
          callback: expect.any(Function),
        });
      });

      // Test custom namespace separately
      await withService(
        { subscriptionNamespace: 'custom-activity.v2' },
        async ({ service, mocks }) => {
          expect(service).toBeInstanceOf(AccountActivityService);
          expect(service.name).toBe('AccountActivityService');

          // Verify custom namespace was used in system notification callback
          expect(mocks.addChannelCallback).toHaveBeenCalledWith({
            channelName: 'system-notifications.v1.custom-activity.v2',
            callback: expect.any(Function),
          });
        },
      );
    });
  });

  // =============================================================================
  // SUBSCRIBE ACCOUNTS TESTS
  // =============================================================================
  describe('subscribe', () => {
    const mockSubscription: SubscriptionOptions = {
      address: 'eip155:1:0x1234567890123456789012345678901234567890',
    };

    it('should handle account activity messages by processing transactions and balance updates and publishing events', async () => {
      await withService(
        { accountAddress: '0x1234567890123456789012345678901234567890' },
        async ({ service, mocks, messenger, mockSelectedAccount }) => {
          let capturedCallback: (
            notification: ServerNotificationMessage,
          ) => void = jest.fn();

          // Mock the subscribe call to capture the callback
          mocks.subscribe.mockImplementation((options) => {
            // Capture the callback from the subscription options
            capturedCallback = options.callback;
            return Promise.resolve({
              subscriptionId: 'sub-123',
              unsubscribe: () => Promise.resolve(),
            });
          });
          mocks.getSelectedAccount.mockReturnValue(mockSelectedAccount);

          await service.subscribe(mockSubscription);

          // Simulate receiving account activity message
          const activityMessage: AccountActivityMessage = {
            address: '0x1234567890123456789012345678901234567890',
            tx: {
              id: '0xabc123',
              chain: 'eip155:1',
              status: 'confirmed',
              timestamp: Date.now(),
              from: '0x1234567890123456789012345678901234567890',
              to: '0x9876543210987654321098765432109876543210',
            },
            updates: [
              {
                asset: {
                  fungible: true,
                  type: 'eip155:1/slip44:60',
                  unit: 'ETH',
                  decimals: 18,
                },
                postBalance: {
                  amount: '1000000000000000000', // 1 ETH
                },
                transfers: [
                  {
                    from: '0x1234567890123456789012345678901234567890',
                    to: '0x9876543210987654321098765432109876543210',
                    amount: '500000000000000000', // 0.5 ETH
                  },
                ],
              },
            ],
          };

          const notificationMessage = {
            event: 'notification',
            subscriptionId: 'sub-123',
            channel:
              'account-activity.v1.eip155:1:0x1234567890123456789012345678901234567890',
            data: activityMessage,
            timestamp: 1760344704595,
          };

          // Subscribe to events to verify they are published
          const receivedTransactionEvents: Transaction[] = [];
          const receivedBalanceEvents: {
            address: string;
            chain: string;
            updates: BalanceUpdate[];
          }[] = [];

          messenger.subscribe(
            'AccountActivityService:transactionUpdated',
            (data) => {
              receivedTransactionEvents.push(data);
            },
          );

          messenger.subscribe(
            'AccountActivityService:balanceUpdated',
            (data) => {
              receivedBalanceEvents.push(data);
            },
          );

          // Call the captured callback
          capturedCallback(notificationMessage);

          // Should receive transaction and balance events
          expect(receivedTransactionEvents).toHaveLength(1);
          expect(receivedTransactionEvents[0]).toStrictEqual(
            activityMessage.tx,
          );

          expect(receivedBalanceEvents).toHaveLength(1);
          expect(receivedBalanceEvents[0]).toStrictEqual({
            address: '0x1234567890123456789012345678901234567890',
            chain: 'eip155:1',
            updates: activityMessage.updates,
          });
        },
      );
    });

    it('should handle subscription failure by calling forceReconnection', async () => {
      await withService(async ({ service, mocks }) => {
        // Mock subscribe to fail
        mocks.subscribe.mockRejectedValue(new Error('Subscription failed'));

        // Should handle subscription failure gracefully - should not throw
        const result = await service.subscribe({ address: '0x123abc' });
        expect(result).toBeUndefined();

        // Verify the subscription was attempted
        expect(mocks.subscribe).toHaveBeenCalledTimes(1);

        // Verify forceReconnection was called (lines 289-290)
        expect(mocks.forceReconnection).toHaveBeenCalledTimes(1);

        // Connect is only called once at the start
        expect(mocks.connect).toHaveBeenCalledTimes(1);
      });
    });
  });

  // =============================================================================
  // UNSUBSCRIBE ACCOUNTS TESTS
  // =============================================================================
  describe('unsubscribe', () => {
    const mockSubscription: SubscriptionOptions = {
      address: 'eip155:1:0x1234567890123456789012345678901234567890',
    };

    it('should handle unsubscribe when not subscribed by returning early without errors', async () => {
      await withService(async ({ service, mocks }) => {
        // Mock the messenger call to return empty array (no active subscription)
        mocks.getSubscriptionsByChannel.mockReturnValue([]);

        // This should trigger the early return on line 302
        await service.unsubscribe(mockSubscription);

        // Verify the messenger call was made but early return happened
        expect(mocks.getSubscriptionsByChannel).toHaveBeenCalledWith(
          expect.any(String),
        );
      });
    });

    it('should handle unsubscribe errors by forcing WebSocket reconnection instead of throwing', async () => {
      await withService(
        { accountAddress: '0x1234567890123456789012345678901234567890' },
        async ({ service, mocks, mockSelectedAccount }) => {
          const error = new Error('Unsubscribe failed');
          const mockUnsubscribeError = jest.fn().mockRejectedValue(error);

          // Mock getSubscriptionsByChannel to return subscription with failing unsubscribe function
          mocks.getSubscriptionsByChannel.mockReturnValue([
            {
              subscriptionId: 'sub-123',
              channels: [
                'account-activity.v1.eip155:1:0x1234567890123456789012345678901234567890',
              ],
              unsubscribe: mockUnsubscribeError,
            },
          ]);
          mocks.getSelectedAccount.mockReturnValue(mockSelectedAccount);

          // unsubscribe catches errors and forces reconnection instead of throwing
          await service.unsubscribe(mockSubscription);

          // Should have attempted to force reconnection
          expect(mocks.forceReconnection).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  // =============================================================================
  // EVENT HANDLERS TESTS
  // =============================================================================
  describe('event handlers', () => {
    describe('handleSystemNotification', () => {
      it('should handle invalid system notifications by throwing error for missing required fields', async () => {
        await withService(async ({ mocks }) => {
          const systemCallback = getSystemNotificationCallback(mocks);

          // Simulate invalid system notification
          const invalidNotification = {
            event: 'system-notification',
            channel: 'system',
            data: { invalid: true }, // Missing required fields
            timestamp: Date.now(),
          };

          // The callback should throw an error for invalid data
          expect(() => systemCallback(invalidNotification)).toThrow(
            'Invalid system notification data: missing chainIds or status',
          );
        });
      });

      it('should track chains as up and down based on system notifications', async () => {
        await withService(async ({ messenger, mocks }) => {
          const statusChangedEventListener = jest.fn();
          messenger.subscribe(
            'AccountActivityService:statusChanged',
            statusChangedEventListener,
          );
          const systemCallback = getSystemNotificationCallback(mocks);

          // Simulate chains coming up
          const timestamp1 = 1760344704595;
          systemCallback({
            event: 'system-notification',
            channel: 'system-notifications.v1.account-activity.v1',
            data: {
              chainIds: ['eip155:1', 'eip155:137'],
              status: 'up',
            },
            timestamp: timestamp1,
          });

          expect(statusChangedEventListener).toHaveBeenCalledWith({
            chainIds: ['eip155:1', 'eip155:137'],
            status: 'up',
            timestamp: timestamp1,
          });

          // Simulate one chain going down
          const timestamp2 = 1760344704696;
          systemCallback({
            event: 'system-notification',
            channel: 'system-notifications.v1.account-activity.v1',
            data: {
              chainIds: ['eip155:137'],
              status: 'down',
            },
            timestamp: timestamp2,
          });

          expect(statusChangedEventListener).toHaveBeenCalledWith({
            chainIds: ['eip155:137'],
            status: 'down',
            timestamp: timestamp2,
          });
        });
      });
    });

    describe('handleWebSocketStateChange', () => {
      it('should handle WebSocket ERROR state by publishing tracked chains as down', async () => {
        await withService(async ({ messenger, rootMessenger, mocks }) => {
          const statusChangedEventListener = jest.fn();
          messenger.subscribe(
            'AccountActivityService:statusChanged',
            statusChangedEventListener,
          );

          mocks.getSelectedAccount.mockReturnValue(null);

          // First, simulate receiving a system notification with chains up
          const systemCallback = getSystemNotificationCallback(mocks);
          systemCallback({
            event: 'system-notification',
            channel: 'system-notifications.v1.account-activity.v1',
            data: {
              chainIds: ['eip155:1', 'eip155:137', 'eip155:56'],
              status: 'up',
            },
            timestamp: 1760344704595,
          });

          // Publish WebSocket ERROR state event - should flush tracked chains as down
          rootMessenger.publish(
            'BackendWebSocketService:connectionStateChanged',
            {
              state: WebSocketState.ERROR,
              url: 'ws://test',
              reconnectAttempts: 2,
              timeout: 10000,
              reconnectDelay: 500,
              maxReconnectDelay: 5000,
              requestTimeout: 30000,
            },
          );
          await completeAsyncOperations(100);

          // Verify that the ERROR state triggered the status change for tracked chains
          expect(statusChangedEventListener).toHaveBeenCalledWith({
            chainIds: ['eip155:1', 'eip155:137', 'eip155:56'],
            status: 'down',
            timestamp: expect.any(Number),
          });
        });
      });

      it('should not publish status change on disconnect when no chains are tracked', async () => {
        await withService(async ({ messenger, rootMessenger, mocks }) => {
          const statusChangedEventListener = jest.fn();
          messenger.subscribe(
            'AccountActivityService:statusChanged',
            statusChangedEventListener,
          );

          mocks.getSelectedAccount.mockReturnValue(null);

          // Publish WebSocket ERROR state event without any tracked chains
          rootMessenger.publish(
            'BackendWebSocketService:connectionStateChanged',
            {
              state: WebSocketState.ERROR,
              url: 'ws://test',
              reconnectAttempts: 2,
              timeout: 10000,
              reconnectDelay: 500,
              maxReconnectDelay: 5000,
              requestTimeout: 30000,
            },
          );
          await completeAsyncOperations(100);

          // Verify that no status change was published since no chains were tracked
          expect(statusChangedEventListener).not.toHaveBeenCalled();
        });
      });
    });

    describe('handleSelectedAccountChange', () => {
      it('should handle valid account scope conversion by processing account change events without errors', async () => {
        await withService(async ({ service, rootMessenger }) => {
          // Publish valid account change event
          const validAccount = createMockInternalAccount({
            address: '0x123abc',
          });
          rootMessenger.publish(
            'AccountsController:selectedAccountChange',
            validAccount,
          );

          // Verify service remains functional after processing valid account
          expect(service).toBeInstanceOf(AccountActivityService);
          expect(service.name).toBe('AccountActivityService');
        });
      });

      it('should handle Solana account scope conversion by subscribing to Solana-specific channels', async () => {
        await withService(async ({ mocks, rootMessenger }) => {
          const solanaAccount = createMockInternalAccount({
            address: 'SolanaAddress123abc',
          });
          solanaAccount.scopes = ['solana:mainnet-beta'];

          mocks.subscribe.mockResolvedValue({
            subscriptionId: 'solana-sub-123',
            unsubscribe: jest.fn(),
          });

          // Publish account change event - will be picked up by controller subscription
          rootMessenger.publish(
            'AccountsController:selectedAccountChange',
            solanaAccount,
          );
          // Wait for async handler to complete
          await completeAsyncOperations();

          expect(mocks.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({
              channels: expect.arrayContaining([
                expect.stringContaining('solana:0:solanaaddress123abc'),
              ]),
            }),
          );
        });
      });

      it('should handle unknown scope fallback by subscribing to channels with fallback naming convention', async () => {
        await withService(async ({ mocks, rootMessenger }) => {
          const unknownAccount = createMockInternalAccount({
            address: 'UnknownChainAddress456def',
          });
          unknownAccount.scopes = ['bitcoin:mainnet', 'unknown:chain'];

          mocks.subscribe.mockResolvedValue({
            subscriptionId: 'unknown-sub-456',
            unsubscribe: jest.fn(),
          });

          // Publish account change event - will be picked up by controller subscription
          rootMessenger.publish(
            'AccountsController:selectedAccountChange',
            unknownAccount,
          );
          // Wait for async handler to complete
          await completeAsyncOperations();

          expect(mocks.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({
              channels: expect.arrayContaining([
                expect.stringContaining('unknownchainaddress456def'),
              ]),
            }),
          );
        });
      });

      it('should handle WebSocket connection when no selected account exists by attempting to get selected account', async () => {
        await withService(async ({ rootMessenger, mocks }) => {
          mocks.getSelectedAccount.mockReturnValue(null);

          // Publish WebSocket connection event - will be picked up by controller subscription
          rootMessenger.publish(
            'BackendWebSocketService:connectionStateChanged',
            {
              state: WebSocketState.CONNECTED,
              url: 'ws://test',
              reconnectAttempts: 0,
              timeout: 10000,
              reconnectDelay: 500,
              maxReconnectDelay: 5000,
              requestTimeout: 30000,
            },
          );
          // Wait for async handler to complete
          await completeAsyncOperations();

          // Should attempt to get selected account even when none exists
          expect(mocks.getSelectedAccount).toHaveBeenCalledTimes(1);
          expect(mocks.getSelectedAccount).toHaveReturnedWith(null);
        });
      });

      it('should skip resubscription when already subscribed to new account by not calling subscribe again', async () => {
        await withService(
          { accountAddress: '0x123abc' },
          async ({ mocks, rootMessenger }) => {
            // Set up mocks
            mocks.getSelectedAccount.mockReturnValue(
              createMockInternalAccount({ address: '0x123abc' }),
            );
            mocks.channelHasSubscription.mockReturnValue(true); // Already subscribed
            mocks.subscribe.mockResolvedValue({
              unsubscribe: jest.fn(),
            });

            // Create a new account
            const newAccount = createMockInternalAccount({
              address: '0x123abc',
            });

            // Publish account change event on root messenger
            rootMessenger.publish(
              'AccountsController:selectedAccountChange',
              newAccount,
            );
            await completeAsyncOperations();

            // Verify that subscribe was not called since already subscribed
            expect(mocks.subscribe).not.toHaveBeenCalled();
          },
        );
      });

      it('should handle errors during account change processing by gracefully handling unsubscribe failures', async () => {
        await withService(
          { accountAddress: '0x123abc' },
          async ({ service, mocks, rootMessenger }) => {
            // Set up mocks to cause an error in the unsubscribe step
            mocks.getSelectedAccount.mockReturnValue(
              createMockInternalAccount({ address: '0x123abc' }),
            );
            mocks.channelHasSubscription.mockReturnValue(false);
            mocks.findSubscriptionsByChannelPrefix.mockReturnValue([
              {
                unsubscribe: jest
                  .fn()
                  .mockRejectedValue(new Error('Unsubscribe failed')),
              },
            ]);
            mocks.subscribe.mockResolvedValue({
              unsubscribe: jest.fn(),
            });

            // Create a new account
            const newAccount = createMockInternalAccount({
              address: '0x123abc',
            });

            // Publish account change event on root messenger
            rootMessenger.publish(
              'AccountsController:selectedAccountChange',
              newAccount,
            );
            await completeAsyncOperations();

            // Verify service handled the error gracefully and remains functional
            expect(service).toBeInstanceOf(AccountActivityService);
            expect(service.name).toBe('AccountActivityService');

            // Verify unsubscribe was attempted despite failure
            expect(mocks.findSubscriptionsByChannelPrefix).toHaveBeenCalled();
          },
        );
      });

      it('should handle error for account without address in selectedAccountChange by processing gracefully without throwing', async () => {
        await withService(async ({ rootMessenger }) => {
          // Test that account without address is handled gracefully when published via messenger
          const accountWithoutAddress = createMockInternalAccount({
            address: '',
          });
          expect(() => {
            rootMessenger.publish(
              'AccountsController:selectedAccountChange',
              accountWithoutAddress,
            );
          }).not.toThrow();
        });
      });

      it('should resubscribe to selected account when WebSocket connects', async () => {
        await withService(
          { accountAddress: '0x123abc' },
          async ({ mocks, rootMessenger }) => {
            // Set up mocks
            const testAccount = createMockInternalAccount({
              address: '0x123abc',
            });
            mocks.getSelectedAccount.mockReturnValue(testAccount);

            // Publish WebSocket connection event
            rootMessenger.publish(
              'BackendWebSocketService:connectionStateChanged',
              {
                state: WebSocketState.CONNECTED,
                url: 'ws://test',
                reconnectAttempts: 0,
                timeout: 10000,
                reconnectDelay: 500,
                maxReconnectDelay: 5000,
                requestTimeout: 30000,
              },
            );
            await completeAsyncOperations();

            // Verify it resubscribed to the selected account
            expect(mocks.subscribe).toHaveBeenCalledWith({
              channelType: 'account-activity.v1',
              channels: ['account-activity.v1.eip155:0:0x123abc'],
              callback: expect.any(Function),
            });
          },
        );
      });
    });
  });
});
