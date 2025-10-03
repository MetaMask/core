/* eslint-disable jest/no-conditional-in-test */
import { Messenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Hex } from '@metamask/utils';
import nock, { cleanAll, disableNetConnect, isDone } from 'nock';

import type {
  AccountActivityServiceAllowedEvents,
  AccountActivityServiceAllowedActions,
} from './AccountActivityService';
import {
  AccountActivityService,
  type AccountActivityServiceMessenger,
  type AccountSubscription,
  ACCOUNT_ACTIVITY_SERVICE_ALLOWED_ACTIONS,
  ACCOUNT_ACTIVITY_SERVICE_ALLOWED_EVENTS,
} from './AccountActivityService';
import type { ServerNotificationMessage } from './BackendWebSocketService';
import { WebSocketState } from './BackendWebSocketService';
import type { Transaction, BalanceUpdate } from './types';
import type { AccountActivityMessage } from './types';
import { flushPromises } from '../../../tests/helpers';

// Helper function for completing async operations with timer advancement
const completeAsyncOperations = async (advanceMs = 10) => {
  await flushPromises();
  if (advanceMs > 0 && jest.isMockFunction(setTimeout)) {
    jest.advanceTimersByTime(advanceMs);
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
 * Creates a real messenger with registered mock actions for testing
 * Each call creates a completely independent messenger to ensure test isolation
 *
 * @param setupDefaultMocks - Whether to set up default mock implementations (default: true)
 * @returns Object containing the messenger and mock action functions
 */
const createMockMessenger = (setupDefaultMocks: boolean = true) => {
  // Use any types for the root messenger to avoid complex type constraints in tests
  // Create a unique root messenger for each test
  const rootMessenger = new Messenger<
    AccountActivityServiceAllowedActions,
    AccountActivityServiceAllowedEvents
  >();
  const messenger: AccountActivityServiceMessenger =
    rootMessenger.getRestricted({
      name: 'AccountActivityService',
      allowedActions: [...ACCOUNT_ACTIVITY_SERVICE_ALLOWED_ACTIONS],
      allowedEvents: [...ACCOUNT_ACTIVITY_SERVICE_ALLOWED_EVENTS],
    });

  // Create mock action handlers
  const mockGetAccountByAddress = jest.fn();
  const mockGetSelectedAccount = jest.fn();
  const mockConnect = jest.fn();
  const mockDisconnect = jest.fn();
  const mockSubscribe = jest.fn();
  const mockChannelHasSubscription = jest.fn();
  const mockGetSubscriptionsByChannel = jest.fn();
  const mockFindSubscriptionsByChannelPrefix = jest.fn();
  const mockAddChannelCallback = jest.fn();
  const mockRemoveChannelCallback = jest.fn();
  const mockSendRequest = jest.fn();

  // Set up default mock implementations if requested
  if (setupDefaultMocks) {
    const mockUnsubscribe = jest.fn().mockResolvedValue(undefined);

    // Setup default mock implementations with realistic responses
    mockSubscribe.mockResolvedValue({
      subscriptionId: 'mock-sub-id',
      unsubscribe: mockUnsubscribe,
    });
    mockChannelHasSubscription.mockReturnValue(false);
    mockGetSubscriptionsByChannel.mockReturnValue([
      {
        subscriptionId: 'mock-sub-id',
        unsubscribe: mockUnsubscribe,
      },
    ]);
    mockFindSubscriptionsByChannelPrefix.mockReturnValue([
      {
        subscriptionId: 'mock-sub-id',
        unsubscribe: mockUnsubscribe,
      },
    ]);
    mockRemoveChannelCallback.mockReturnValue(true);
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
    mockAddChannelCallback.mockReturnValue(undefined);
    mockSendRequest.mockResolvedValue(undefined);
  }

  // Register all action handlers
  rootMessenger.registerActionHandler(
    'AccountsController:getAccountByAddress',
    mockGetAccountByAddress,
  );
  rootMessenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    mockGetSelectedAccount,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:connect',
    mockConnect,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:disconnect',
    mockDisconnect,
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
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:sendRequest',
    mockSendRequest,
  );

  return {
    rootMessenger,
    messenger,
    mocks: {
      getAccountByAddress: mockGetAccountByAddress,
      getSelectedAccount: mockGetSelectedAccount,
      connect: mockConnect,
      disconnect: mockDisconnect,
      subscribe: mockSubscribe,
      channelHasSubscription: mockChannelHasSubscription,
      getSubscriptionsByChannel: mockGetSubscriptionsByChannel,
      findSubscriptionsByChannelPrefix: mockFindSubscriptionsByChannelPrefix,
      addChannelCallback: mockAddChannelCallback,
      removeChannelCallback: mockRemoveChannelCallback,
      sendRequest: mockSendRequest,
    },
  };
};

/**
 * Creates an independent AccountActivityService with its own messenger for tests that need isolation
 * This is the primary way to create service instances in tests to ensure proper isolation
 *
 * @param options - Optional configuration for service creation
 * @param options.subscriptionNamespace - Custom subscription namespace
 * @param options.setupDefaultMocks - Whether to set up default mock implementations (default: true)
 * @returns Object containing the service, messenger, root messenger, and mock functions
 */
const createIndependentService = (options?: {
  subscriptionNamespace?: string;
  setupDefaultMocks?: boolean;
}) => {
  const { subscriptionNamespace, setupDefaultMocks = true } = options ?? {};

  const messengerSetup = createMockMessenger(setupDefaultMocks);

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
 * @param setupDefaultMocks - Whether to set up default mock implementations (default: true)
 * @returns Object containing the service, messenger, mocks, and mock account
 */
const createServiceWithTestAccount = (
  accountAddress: string = '0x1234567890123456789012345678901234567890',
  setupDefaultMocks: boolean = true,
) => {
  const serviceSetup = createIndependentService({ setupDefaultMocks });

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
  serviceSetup.mocks.getAccountByAddress.mockReturnValue(mockSelectedAccount);

  return {
    ...serviceSetup,
    mockSelectedAccount,
  };
};

/**
 * Test configuration options for withService
 */
type WithServiceOptions = {
  setupDefaultMocks?: boolean;
  subscriptionNamespace?: string;
  accountAddress?: string;
};

/**
 * The callback that `withService` calls.
 */
type WithServiceCallback<ReturnValue> = (payload: {
  service: AccountActivityService;
  messenger: AccountActivityServiceMessenger;
  rootMessenger: Messenger<
    AccountActivityServiceAllowedActions,
    AccountActivityServiceAllowedEvents
  >;
  mocks: {
    getAccountByAddress: jest.Mock;
    getSelectedAccount: jest.Mock;
    connect: jest.Mock;
    disconnect: jest.Mock;
    subscribe: jest.Mock;
    channelHasSubscription: jest.Mock;
    getSubscriptionsByChannel: jest.Mock;
    findSubscriptionsByChannelPrefix: jest.Mock;
    addChannelCallback: jest.Mock;
    removeChannelCallback: jest.Mock;
    sendRequest: jest.Mock;
  };
  mockSelectedAccount?: InternalAccount;
  destroy: () => void;
}) => Promise<ReturnValue> | ReturnValue;

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
  const [
    { setupDefaultMocks = true, subscriptionNamespace, accountAddress },
    testFunction,
  ] =
    args.length === 2
      ? args
      : [
          {
            setupDefaultMocks: true,
            subscriptionNamespace: undefined,
            accountAddress: undefined,
          },
          args[0],
        ];

  const setup = accountAddress
    ? createServiceWithTestAccount(accountAddress, setupDefaultMocks)
    : createIndependentService({ setupDefaultMocks, subscriptionNamespace });

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
  beforeEach(() => {
    // Set up nock
    cleanAll();
    disableNetConnect(); // Disable real network connections
  });

  afterEach(() => {
    jest.restoreAllMocks();
    cleanAll();
    // Don't re-enable net connect - this was breaking nock!
  });

  // =============================================================================
  // CONSTRUCTOR TESTS
  // =============================================================================
  describe('constructor', () => {
    it('should create AccountActivityService with comprehensive initialization and verify service properties', async () => {
      await withService(async ({ service, messenger }) => {
        expect(service).toBeInstanceOf(AccountActivityService);
        expect(service.name).toBe('AccountActivityService');
        expect(service).toBeDefined();

        // Status changed event is only published when WebSocket connects
        const publishSpy = jest.spyOn(messenger, 'publish');
        expect(publishSpy).not.toHaveBeenCalled();
      });

      // Test custom namespace separately
      await withService(
        { subscriptionNamespace: 'custom-activity.v2' },
        async ({ service }) => {
          expect(service).toBeInstanceOf(AccountActivityService);
          expect(service).toBeDefined();
        },
      );
    });
  });

  // =============================================================================
  // SUBSCRIBE ACCOUNTS TESTS
  // =============================================================================
  describe('subscribeAccounts', () => {
    const mockSubscription: AccountSubscription = {
      address: 'eip155:1:0x1234567890123456789012345678901234567890',
    };

    it('should handle account activity messages by processing transactions and balance updates and publishing events', async () => {
      await withService(
        { accountAddress: '0x1234567890123456789012345678901234567890' },
        async ({ service, mocks, messenger, mockSelectedAccount }) => {
          const mockUnsubscribe = jest.fn().mockResolvedValue(undefined);
          let capturedCallback: (
            notification: ServerNotificationMessage,
          ) => void = jest.fn();

          // Mock the subscribe call to capture the callback
          mocks.connect.mockResolvedValue(undefined);
          mocks.disconnect.mockResolvedValue(undefined);
          mocks.subscribe.mockImplementation((options) => {
            // Capture the callback from the subscription options
            capturedCallback = options.callback;
            return Promise.resolve({
              subscriptionId: 'sub-123',
              unsubscribe: mockUnsubscribe,
            });
          });
          mocks.channelHasSubscription.mockReturnValue(false);
          mocks.addChannelCallback.mockReturnValue(undefined);
          mocks.getSelectedAccount.mockReturnValue(mockSelectedAccount);

          await service.subscribeAccounts(mockSubscription);

          // Simulate receiving account activity message
          const activityMessage: AccountActivityMessage = {
            address: '0x1234567890123456789012345678901234567890',
            tx: {
              hash: '0xabc123',
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

    it('should handle WebSocket reconnection failures by gracefully handling subscription errors', async () => {
      await withService(async ({ service, mocks }) => {
        // Mock disconnect to fail
        mocks.disconnect.mockRejectedValue(new Error('Disconnect failed'));
        mocks.connect.mockResolvedValue(undefined);
        mocks.channelHasSubscription.mockReturnValue(false);
        mocks.addChannelCallback.mockReturnValue(undefined);

        // Trigger scenario that causes force reconnection by making subscribe fail
        mocks.subscribe.mockRejectedValue(new Error('Subscription failed'));

        // Should handle reconnection failure gracefully
        const result = service.subscribeAccounts({ address: '0x123abc' });
        expect(await result).toBeUndefined();
      });
    });
  });

  // =============================================================================
  // UNSUBSCRIBE ACCOUNTS TESTS
  // =============================================================================
  describe('unsubscribeAccounts', () => {
    const mockSubscription: AccountSubscription = {
      address: 'eip155:1:0x1234567890123456789012345678901234567890',
    };

    it('should handle unsubscribe when not subscribed by returning early without errors', async () => {
      await withService(async ({ service, mocks }) => {
        // Mock the messenger call to return empty array (no active subscription)
        mocks.getSubscriptionsByChannel.mockReturnValue([]);

        // This should trigger the early return on line 302
        await service.unsubscribeAccounts(mockSubscription);

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
          mocks.disconnect.mockResolvedValue(undefined);
          mocks.connect.mockResolvedValue(undefined);
          mocks.addChannelCallback.mockReturnValue(undefined);
          mocks.getSelectedAccount.mockReturnValue(mockSelectedAccount);

          // unsubscribeAccounts catches errors and forces reconnection instead of throwing
          await service.unsubscribeAccounts(mockSubscription);

          // Should have attempted to force reconnection
          expect(mocks.disconnect).toHaveBeenCalled();
          expect(mocks.connect).toHaveBeenCalled();
        },
      );
    });
  });

  // =============================================================================
  // GET SUPPORTED CHAINS TESTS
  // =============================================================================
  describe('getSupportedChains', () => {
    it('should handle API returning non-200 status by falling back to hardcoded supported chains', async () => {
      await withService(async ({ service }) => {
        // Mock 500 error response
        nock('https://accounts.api.cx.metamask.io')
          .get('/v2/supportedNetworks')
          .reply(500, 'Internal Server Error');

        // Test the getSupportedChains method directly - should fallback to hardcoded chains
        const supportedChains = await service.getSupportedChains();

        // Should fallback to hardcoded chains
        expect(supportedChains).toStrictEqual(
          expect.arrayContaining(['eip155:1', 'eip155:137', 'eip155:56']),
        );
      });
    });

    it('should cache supported chains for service lifecycle by returning cached results on subsequent calls', async () => {
      await withService(async ({ service }) => {
        // First call - should fetch from API
        nock('https://accounts.api.cx.metamask.io')
          .get('/v2/supportedNetworks')
          .reply(200, {
            fullSupport: ['eip155:1', 'eip155:137'],
            partialSupport: { balances: [] },
          });

        const firstResult = await service.getSupportedChains();

        expect(firstResult).toStrictEqual(['eip155:1', 'eip155:137']);
        expect(isDone()).toBe(true);

        // Second call immediately after - should use cache (no new API call)
        const secondResult = await service.getSupportedChains();

        // Should return same result from cache
        expect(secondResult).toStrictEqual(['eip155:1', 'eip155:137']);
        expect(isDone()).toBe(true); // Still done from first call
      });
    });
  });

  // =============================================================================
  // EVENT HANDLERS TESTS
  // =============================================================================
  describe('event handlers', () => {
    describe('handleSystemNotification', () => {
      it('should handle invalid system notifications by throwing error for missing required fields', async () => {
        await withService(async ({ mocks }) => {
          // Find the system callback from messenger calls
          const systemCallbackCall = mocks.addChannelCallback.mock.calls.find(
            (call: unknown[]) =>
              call[0] &&
              typeof call[0] === 'object' &&
              'channelName' in call[0] &&
              call[0].channelName ===
                'system-notifications.v1.account-activity.v1',
          );

          if (!systemCallbackCall) {
            throw new Error('systemCallbackCall is undefined');
          }

          const callbackOptions = systemCallbackCall[0] as {
            callback: (notification: ServerNotificationMessage) => void;
          };
          const systemCallback = callbackOptions.callback;

          // Simulate invalid system notification
          const invalidNotification = {
            event: 'system-notification',
            channel: 'system',
            data: { invalid: true }, // Missing required fields
          };

          // The callback should throw an error for invalid data
          expect(() => systemCallback(invalidNotification)).toThrow(
            'Invalid system notification data: missing chainIds or status',
          );
        });
      });
    });

    describe('handleWebSocketStateChange', () => {
      it('should handle WebSocket ERROR state by publishing status change event with down status', async () => {
        await withService(async ({ messenger, rootMessenger, mocks }) => {
          const publishSpy = jest.spyOn(messenger, 'publish');

          mocks.addChannelCallback.mockReturnValue(undefined);
          mocks.getSelectedAccount.mockReturnValue(null); // Ensure no selected account

          // Clear any publish calls from service initialization
          publishSpy.mockClear();

          // Mock API response for supported networks
          nock('https://accounts.api.cx.metamask.io')
            .get('/v2/supportedNetworks')
            .reply(200, {
              fullSupport: ['eip155:1', 'eip155:137', 'eip155:56'],
              partialSupport: { balances: ['eip155:42220'] },
            });

          // Publish WebSocket ERROR state event - will be picked up by controller subscription
          await rootMessenger.publish(
            'BackendWebSocketService:connectionStateChanged',
            {
              state: WebSocketState.ERROR,
              url: 'ws://test',
              reconnectAttempts: 2,
            },
          );
          await new Promise((resolve) => setTimeout(resolve, 100)); // Give time for async processing

          // Verify that the ERROR state triggered the status change
          expect(publishSpy).toHaveBeenCalledWith(
            'AccountActivityService:statusChanged',
            {
              chainIds: ['eip155:1', 'eip155:137', 'eip155:56'],
              status: 'down',
            },
          );
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
          await completeAsyncOperations();

          // Test passes if no errors are thrown
          expect(service).toBeDefined();
        });
      });

      it('should handle Solana account scope conversion by subscribing to Solana-specific channels', async () => {
        await withService(async ({ mocks, rootMessenger }) => {
          const solanaAccount = createMockInternalAccount({
            address: 'SolanaAddress123abc',
          });
          solanaAccount.scopes = ['solana:mainnet-beta'];

          mocks.connect.mockResolvedValue(undefined);
          mocks.channelHasSubscription.mockReturnValue(false);
          mocks.addChannelCallback.mockReturnValue(undefined);
          mocks.findSubscriptionsByChannelPrefix.mockReturnValue([]);
          mocks.subscribe.mockResolvedValue({
            subscriptionId: 'solana-sub-123',
            unsubscribe: jest.fn(),
          });

          // Publish account change event - will be picked up by controller subscription
          await rootMessenger.publish(
            'AccountsController:selectedAccountChange',
            solanaAccount,
          );
          await new Promise((resolve) => setTimeout(resolve, 100)); // Give time for async processing

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

          mocks.connect.mockResolvedValue(undefined);
          mocks.channelHasSubscription.mockReturnValue(false);
          mocks.addChannelCallback.mockReturnValue(undefined);
          mocks.findSubscriptionsByChannelPrefix.mockReturnValue([]);
          mocks.subscribe.mockResolvedValue({
            subscriptionId: 'unknown-sub-456',
            unsubscribe: jest.fn(),
          });

          // Publish account change event - will be picked up by controller subscription
          await rootMessenger.publish(
            'AccountsController:selectedAccountChange',
            unknownAccount,
          );
          await new Promise((resolve) => setTimeout(resolve, 100)); // Give time for async processing

          expect(mocks.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({
              channels: expect.arrayContaining([
                expect.stringContaining('unknownchainaddress456def'),
              ]),
            }),
          );
        });
      });

      it('should handle already subscribed accounts and invalid addresses by skipping subscription when already subscribed', async () => {
        await withService(
          { accountAddress: '0x123abc' },
          async ({ service, mocks }) => {
            const testAccount = createMockInternalAccount({
              address: '0x123abc',
            });

            // Test already subscribed scenario
            mocks.connect.mockResolvedValue(undefined);
            mocks.channelHasSubscription.mockReturnValue(true); // Already subscribed
            mocks.addChannelCallback.mockReturnValue(undefined);
            mocks.getSelectedAccount.mockReturnValue(testAccount);

            await service.subscribeAccounts({
              address: testAccount.address,
            });
            expect(mocks.subscribe).not.toHaveBeenCalledWith(
              expect.any(Object),
            );
          },
        );

        // Test account with empty address separately
        await withService(async ({ rootMessenger, mocks }) => {
          // Set up default mocks
          mocks.addChannelCallback.mockReturnValue(undefined);
          mocks.connect.mockResolvedValue(undefined);

          // Publish account change event with valid account
          const validAccount = createMockInternalAccount({
            address: '0x123abc',
          });
          rootMessenger.publish(
            'AccountsController:selectedAccountChange',
            validAccount,
          );
          await completeAsyncOperations();
        });
      });

      it('should handle WebSocket connection when no selected account exists by attempting to get selected account', async () => {
        await withService(async ({ rootMessenger, mocks }) => {
          mocks.connect.mockResolvedValue(undefined);
          mocks.addChannelCallback.mockReturnValue(undefined);
          mocks.getSelectedAccount.mockReturnValue(null);

          // Publish WebSocket connection event - will be picked up by controller subscription
          await rootMessenger.publish(
            'BackendWebSocketService:connectionStateChanged',
            {
              state: WebSocketState.CONNECTED,
              url: 'ws://test',
              reconnectAttempts: 0,
            },
          );
          await new Promise((resolve) => setTimeout(resolve, 100)); // Give time for async processing

          // Should attempt to get selected account even when none exists
          expect(mocks.getSelectedAccount).toHaveBeenCalled();
        });
      });

      it('should handle system notification publish failures gracefully by throwing error when publish fails', async () => {
        await withService(async ({ mocks, messenger }) => {
          // Find the system callback from messenger calls
          const systemCallbackCall = mocks.addChannelCallback.mock.calls.find(
            (call: unknown[]) =>
              call[0] &&
              typeof call[0] === 'object' &&
              'channelName' in call[0] &&
              call[0].channelName ===
                'system-notifications.v1.account-activity.v1',
          );

          if (!systemCallbackCall) {
            throw new Error('systemCallbackCall is undefined');
          }

          const callbackOptions = systemCallbackCall[0] as {
            callback: (notification: ServerNotificationMessage) => void;
          };
          const systemCallback = callbackOptions.callback;

          // Mock publish to throw error
          jest.spyOn(messenger, 'publish').mockImplementation(() => {
            throw new Error('Publish failed');
          });

          const systemNotification = {
            event: 'system-notification',
            channel: 'system-notifications.v1.account-activity.v1',
            data: { chainIds: ['0x1', '0x2'], status: 'connected' },
          };

          // Should throw error when publish fails
          expect(() => systemCallback(systemNotification)).toThrow(
            'Publish failed',
          );

          // Should have attempted to publish the notification
          expect(messenger.publish).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              chainIds: ['0x1', '0x2'],
              status: 'connected',
            }),
          );
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
            await rootMessenger.publish(
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
            await rootMessenger.publish(
              'AccountsController:selectedAccountChange',
              newAccount,
            );
            await completeAsyncOperations();

            // The method should handle the error gracefully and not throw
            expect(service).toBeDefined();
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

          await completeAsyncOperations();
        });
      });

      it('should handle resubscription failures during WebSocket connection via messenger by attempting resubscription', async () => {
        await withService(
          { accountAddress: '0x123abc' },
          async ({ service, mocks, rootMessenger }) => {
            // Set up mocks
            const testAccount = createMockInternalAccount({
              address: '0x123abc',
            });
            mocks.getSelectedAccount.mockReturnValue(testAccount);
            mocks.addChannelCallback.mockReturnValue(undefined);

            // Make subscribeAccounts fail during resubscription
            const subscribeAccountsSpy = jest
              .spyOn(service, 'subscribeAccounts')
              .mockRejectedValue(new Error('Resubscription failed'));

            // Publish WebSocket connection event - should trigger resubscription failure
            await rootMessenger.publish(
              'BackendWebSocketService:connectionStateChanged',
              {
                state: WebSocketState.CONNECTED,
                url: 'ws://test',
                reconnectAttempts: 0,
              },
            );
            await completeAsyncOperations();

            // Should have attempted to resubscribe
            expect(subscribeAccountsSpy).toHaveBeenCalled();
          },
        );
      });
    });
  });
});
