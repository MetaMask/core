import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import type { Hex, Json } from '@metamask/utils';

import { flushPromises } from '../../../../tests/helpers.js';
import type { Transaction, BalanceUpdate } from '../types.js';
import type { AccountActivityMessage } from '../types.js';
import { AccountActivityService } from './AccountActivityService.js';
import type { AccountActivityServiceMessenger } from './AccountActivityService.js';
import type { ServerNotificationMessage } from './BackendWebSocketService.js';
import { WebSocketState } from './BackendWebSocketService.js';

type AllAccountActivityServiceActions =
  MessengerActions<AccountActivityServiceMessenger>;

type AllAccountActivityServiceEvents =
  MessengerEvents<AccountActivityServiceMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllAccountActivityServiceActions,
  AllAccountActivityServiceEvents
>;

type TestMocks = {
  getAccountsFromSelectedAccountGroup: jest.Mock<InternalAccount[]>;
  connect: jest.Mock;
  subscribe: jest.Mock;
  channelHasSubscription: jest.Mock;
  getSubscriptionsByChannel: jest.Mock;
  findSubscriptionsByChannelPrefix: jest.Mock;
  forceReconnection: jest.Mock;
  addChannelCallback: jest.Mock;
  removeChannelCallback: jest.Mock;
  getConnectionInfo: jest.Mock;
  getFeatureFlagState: jest.Mock;
};

// Helper function for completing async operations
const completeAsyncOperations = async (timeoutMs = 0): Promise<void> => {
  await flushPromises();
  // Allow nested async operations to complete
  if (timeoutMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  }
  await flushPromises();
};

// Mock function to create test accounts
const createMockInternalAccount = (overrides: {
  address: string;
  scopes?: InternalAccount['scopes'];
  options?: InternalAccount['options'];
}): InternalAccount => ({
  address: overrides.address.toLowerCase() as Hex,
  id: `test-account-${overrides.address.slice(-6)}`,
  metadata: {
    name: 'Test Account',
    importTime: Date.now(),
    keyring: {
      type: 'HD Key Tree',
    },
  },
  options: overrides.options ?? {},
  methods: [],
  type: 'eip155:eoa',
  scopes: overrides.scopes ?? ['eip155:1'], // Required scopes property
});

/**
 * Builds a RemoteFeatureFlagController state with the Solana migration flag
 * at the given stage (or with no migration flags when undefined)
 *
 * @param stage - The migration stage for the Solana flag
 * @returns A RemoteFeatureFlagController state object
 */
const featureFlagState = (
  stage: number | undefined,
): {
  remoteFeatureFlags: Record<string, Json>;
  cacheTimestamp: number;
} => ({
  remoteFeatureFlags:
    stage === undefined ? {} : { networkAssetsSnapsMigrationSolana: { stage } },
  cacheTimestamp: 0,
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
  mocks: TestMocks;
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
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
      'BackendWebSocketService:connect',
      'BackendWebSocketService:forceReconnection',
      'BackendWebSocketService:subscribe',
      'BackendWebSocketService:getConnectionInfo',
      'BackendWebSocketService:channelHasSubscription',
      'BackendWebSocketService:getSubscriptionsByChannel',
      'BackendWebSocketService:findSubscriptionsByChannelPrefix',
      'BackendWebSocketService:addChannelCallback',
      'BackendWebSocketService:removeChannelCallback',
      'RemoteFeatureFlagController:getState',
    ],
    events: [
      'AccountTreeController:selectedAccountGroupChange',
      'BackendWebSocketService:connectionStateChanged',
      // eslint-disable-next-line no-restricted-syntax
      'RemoteFeatureFlagController:stateChange',
    ],
    messenger,
  });

  // Create mock action handlers
  const mockGetAccountsFromSelectedAccountGroup = jest.fn();
  const mockConnect = jest.fn();
  const mockForceReconnection = jest.fn();
  const mockSubscribe = jest.fn();
  const mockChannelHasSubscription = jest.fn();
  const mockGetSubscriptionsByChannel = jest.fn();
  const mockFindSubscriptionsByChannelPrefix = jest.fn().mockReturnValue([]);
  const mockAddChannelCallback = jest.fn();
  const mockRemoveChannelCallback = jest.fn();
  const mockGetConnectionInfo = jest.fn().mockReturnValue({
    state: WebSocketState.CONNECTED,
  });
  // Solana enabled by default so tests exercise the multichain path
  const mockGetFeatureFlagState = jest.fn().mockReturnValue({
    remoteFeatureFlags: {
      networkAssetsSnapsMigrationSolana: { stage: 1 },
    },
    cacheTimestamp: 0,
  });

  // Register all action handlers
  rootMessenger.registerActionHandler(
    'AccountTreeController:getAccountsFromSelectedAccountGroup',
    mockGetAccountsFromSelectedAccountGroup,
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
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:getConnectionInfo',
    mockGetConnectionInfo,
  );
  rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    mockGetFeatureFlagState,
  );

  return {
    rootMessenger,
    messenger,
    mocks: {
      getAccountsFromSelectedAccountGroup:
        mockGetAccountsFromSelectedAccountGroup,
      connect: mockConnect,
      forceReconnection: mockForceReconnection,
      subscribe: mockSubscribe,
      channelHasSubscription: mockChannelHasSubscription,
      getSubscriptionsByChannel: mockGetSubscriptionsByChannel,
      findSubscriptionsByChannelPrefix: mockFindSubscriptionsByChannelPrefix,
      addChannelCallback: mockAddChannelCallback,
      removeChannelCallback: mockRemoveChannelCallback,
      getConnectionInfo: mockGetConnectionInfo,
      getFeatureFlagState: mockGetFeatureFlagState,
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
}): {
  service: AccountActivityService;
  messenger: AccountActivityServiceMessenger;
  rootMessenger: RootMessenger;
  mocks: TestMocks;
  destroy: () => void;
} => {
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
    destroy: (): void => {
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
): {
  service: AccountActivityService;
  messenger: AccountActivityServiceMessenger;
  rootMessenger: RootMessenger;
  mocks: TestMocks;
  destroy: () => void;
  mockSelectedAccounts: InternalAccount[];
} => {
  const serviceSetup = createIndependentService();

  // Create mock selected account
  const mockSelectedAccounts: InternalAccount[] = [
    {
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
    },
  ];

  // Setup account-related mock implementations
  serviceSetup.mocks.getAccountsFromSelectedAccountGroup.mockReturnValue(
    mockSelectedAccounts,
  );

  return {
    ...serviceSetup,
    mockSelectedAccounts,
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
  mocks: TestMocks;
  mockSelectedAccounts: InternalAccount[];
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
      mockSelectedAccounts:
        'mockSelectedAccounts' in setup
          ? (setup.mockSelectedAccounts as InternalAccount[])
          : [],
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

          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([]);

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

          // Publish WebSocket DISCONNECTED state event - should flush tracked chains as down
          rootMessenger.publish(
            'BackendWebSocketService:connectionStateChanged',
            {
              state: WebSocketState.DISCONNECTED,
              url: 'ws://test',
              reconnectAttempts: 2,
              timeout: 10000,
              reconnectDelay: 500,
              maxReconnectDelay: 5000,
              requestTimeout: 30000,
            },
          );
          await completeAsyncOperations(100);

          // Verify that the DISCONNECTED state triggered the status change for tracked chains
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

          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([]);

          // Publish WebSocket DISCONNECTED state event without any tracked chains
          rootMessenger.publish(
            'BackendWebSocketService:connectionStateChanged',
            {
              state: WebSocketState.DISCONNECTED,
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
          rootMessenger.publish(
            'AccountTreeController:selectedAccountGroupChange',
            '',
            '',
          );

          // Verify service remains functional after processing valid account
          expect(service).toBeInstanceOf(AccountActivityService);
          expect(service.name).toBe('AccountActivityService');
        });
      });

      it('does not subscribe accounts whose scopes are not supported', async () => {
        await withService(async ({ mocks, rootMessenger }) => {
          const unknownAccount = createMockInternalAccount({
            address: 'UnknownChainAddress456def',
          });
          unknownAccount.scopes = ['bitcoin:mainnet', 'unknown:chain'];

          // Publish account change event - will be picked up by controller subscription
          rootMessenger.publish(
            'AccountTreeController:selectedAccountGroupChange',
            '',
            '',
          );
          // Wait for async handler to complete
          await completeAsyncOperations();

          expect(mocks.subscribe).not.toHaveBeenCalled();
        });
      });

      it('subscribes to chains beyond EVM and Solana when their migration flag is active', async () => {
        await withService(async ({ mocks, rootMessenger }) => {
          mocks.getFeatureFlagState.mockReturnValue({
            remoteFeatureFlags: {
              networkAssetsSnapsMigrationTron: { stage: 1 },
            },
            cacheTimestamp: 0,
          });
          mocks.subscribe.mockResolvedValue({
            subscriptionId: 'tron-sub-123',
            unsubscribe: jest.fn(),
          });
          const evmAccount = createMockInternalAccount({
            address: '0xEvmAddress123abc',
            scopes: ['eip155:1'],
            options: {
              entropy: {
                type: 'mnemonic',
                id: '0xentropy1',
                groupIndex: 0,
                derivationPath: "m/44'/60'/0'/0/0",
              },
            },
          });
          const tronAccount = createMockInternalAccount({
            address: 'TronAddress123abc',
            scopes: ['tron:1234'],
            options: {
              entropy: {
                type: 'mnemonic',
                id: '0xentropy1',
                groupIndex: 0,
                derivationPath: "m/44'/195'/0'/0/0",
              },
            },
          });
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
            evmAccount,
            tronAccount,
          ]);

          rootMessenger.publish(
            'AccountTreeController:selectedAccountGroupChange',
            '',
            '',
          );
          await completeAsyncOperations();

          expect(mocks.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({
              channels: [
                'account-activity.v1.eip155:0:0xevmaddress123abc',
                'account-activity.v1.tron:0:tronaddress123abc',
              ],
            }),
          );
        });
      });

      it('forces reconnection when an error is thrown during subscription', async () => {
        await withService(async ({ mocks, rootMessenger }) => {
          mocks.subscribe.mockRejectedValue(new Error('Subscription failed'));
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
            createMockInternalAccount({
              address: '0xEvmAddress123abc',
            }),
          ]);

          rootMessenger.publish(
            'AccountTreeController:selectedAccountGroupChange',
            '',
            '',
          );
          await completeAsyncOperations();

          expect(mocks.forceReconnection).toHaveBeenCalled();
        });
      });

      it('subscribes to all accounts from the same entropy and group index', async () => {
        await withService(async ({ mocks, rootMessenger }) => {
          // Create two accounts with the same entropy and group index
          const account1 = createMockInternalAccount({
            address: '0xaccount1',
            options: {
              entropy: {
                type: 'mnemonic',
                id: '0xentropy1',
                groupIndex: 0,
                derivationPath: "m/44'/60'/0'/0/0",
              },
            },
          });
          const account2 = createMockInternalAccount({
            address: '0xaccount2',
            options: {
              entropy: {
                type: 'mnemonic',
                id: '0xentropy1',
                groupIndex: 0,
                derivationPath: "m/44'/60'/0'/0/1",
              },
            },
          });
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
            account1,
            account2,
          ]);
          mocks.subscribe.mockResolvedValue({
            subscriptionId: 'sub-789',
            unsubscribe: jest.fn(),
          });

          // Publish account change event for account1
          rootMessenger.publish(
            'AccountTreeController:selectedAccountGroupChange',
            '',
            '',
          );
          // Wait for async handler to complete
          await completeAsyncOperations();

          // Verify that subscribe was called for both accounts with the same entropy and group index
          expect(mocks.subscribe).toHaveBeenCalledTimes(1);
          expect(mocks.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({
              channels: [
                'account-activity.v1.eip155:0:0xaccount1',
                'account-activity.v1.eip155:0:0xaccount2',
              ],
            }),
          );
        });
      });

      it('handles the selected account activity messages by processing transactions and balance updates and publishing events', async () => {
        await withService(
          { accountAddress: '0x1234567890123456789012345678901234567890' },
          async ({ rootMessenger, mocks, messenger, mockSelectedAccounts }) => {
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
            mocks.getAccountsFromSelectedAccountGroup.mockReturnValue(
              mockSelectedAccounts,
            );

            rootMessenger.publish(
              'AccountTreeController:selectedAccountGroupChange',
              '',
              '',
            );
            // Wait for async handler to complete
            await completeAsyncOperations();

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

      it('does not subscribe to Solana channels when the Solana migration flag is not set', async () => {
        await withService(async ({ mocks, rootMessenger }) => {
          mocks.getFeatureFlagState.mockReturnValue({
            remoteFeatureFlags: {},
            cacheTimestamp: 0,
          });
          const solanaAccount = createMockInternalAccount({
            address: 'SolanaAddress123abc',
            scopes: ['solana:mainnet-beta'],
            options: {
              entropy: {
                type: 'mnemonic',
                id: '0xentropy1',
                groupIndex: 0,
                derivationPath: "m/44'/501'/0'/0'",
              },
            },
          });
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
            solanaAccount,
          ]);

          rootMessenger.publish(
            'AccountTreeController:selectedAccountGroupChange',
            '',
            '',
          );
          await completeAsyncOperations();

          expect(mocks.subscribe).not.toHaveBeenCalled();
        });
      });

      it('does not subscribe to Solana channels when the Solana migration flag stage is 0', async () => {
        await withService(async ({ mocks, rootMessenger }) => {
          mocks.getFeatureFlagState.mockReturnValue({
            remoteFeatureFlags: {
              networkAssetsSnapsMigrationSolana: { stage: 0 },
            },
            cacheTimestamp: 0,
          });
          const solanaAccount = createMockInternalAccount({
            address: 'SolanaAddress123abc',
            scopes: ['solana:mainnet-beta'],
          });
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
            solanaAccount,
          ]);

          rootMessenger.publish(
            'AccountTreeController:selectedAccountGroupChange',
            '',
            '',
          );
          await completeAsyncOperations();

          expect(mocks.subscribe).not.toHaveBeenCalled();
        });
      });

      it('should handle WebSocket connection when no selected account exists by attempting to get selected account', async () => {
        await withService(async ({ rootMessenger, mocks }) => {
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([]);

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
          expect(
            mocks.getAccountsFromSelectedAccountGroup,
          ).toHaveBeenCalledTimes(1);
        });
      });

      it('should skip resubscription when already subscribed to new account by not calling subscribe again', async () => {
        await withService(
          { accountAddress: '0x123abc' },
          async ({ mocks, rootMessenger }) => {
            // Set up mocks
            mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
              createMockInternalAccount({ address: '0x123abc' }),
            ]);
            mocks.channelHasSubscription.mockReturnValue(true); // Already subscribed
            mocks.subscribe.mockResolvedValue({
              unsubscribe: jest.fn(),
            });

            // Publish account change event on root messenger
            rootMessenger.publish(
              'AccountTreeController:selectedAccountGroupChange',
              '',
              '',
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
            mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
              createMockInternalAccount({ address: '0x123abc' }),
            ]);
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

            // Publish account change event on root messenger
            rootMessenger.publish(
              'AccountTreeController:selectedAccountGroupChange',
              '',
              '',
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

      it('should resubscribe to selected account when WebSocket connects', async () => {
        await withService(
          { accountAddress: '0x123abc' },
          async ({ mocks, rootMessenger }) => {
            // Set up mocks
            const testAccount = createMockInternalAccount({
              address: '0x123abc',
            });
            mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
              testAccount,
            ]);

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

    describe('handleFeatureFlagsStateChange', () => {
      it('resubscribes with the new chains when the enabled chains change', async () => {
        await withService(async ({ mocks, rootMessenger }) => {
          const solanaAccount = createMockInternalAccount({
            address: 'SolanaAddress123abc',
          });
          solanaAccount.scopes = ['solana:mainnet-beta'];
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
            solanaAccount,
          ]);
          mocks.getFeatureFlagState.mockReturnValue(featureFlagState(0));
          mocks.subscribe.mockResolvedValue({
            subscriptionId: 'sub-123',
            unsubscribe: jest.fn(),
          });

          // Connect with the Solana flag off: no subscription
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
          expect(mocks.subscribe).not.toHaveBeenCalled();

          // Flag flips to stage 1: service resubscribes with the Solana channel
          mocks.getFeatureFlagState.mockReturnValue(featureFlagState(1));
          rootMessenger.publish(
            'RemoteFeatureFlagController:stateChange',
            featureFlagState(1),
            [],
          );
          await completeAsyncOperations();

          expect(mocks.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({
              channels: ['account-activity.v1.solana:0:solanaaddress123abc'],
            }),
          );
        });
      });

      it('does not resubscribe when a change in unrelated feature flags leaves the enabled chains unchanged', async () => {
        await withService(async ({ mocks, rootMessenger }) => {
          const evmAccount = createMockInternalAccount({
            address: '0xevmaccount',
          });
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
            evmAccount,
          ]);
          mocks.subscribe.mockResolvedValue({
            subscriptionId: 'sub-123',
            unsubscribe: jest.fn(),
          });

          // Prime the selector cache with an initial publish
          rootMessenger.publish(
            'RemoteFeatureFlagController:stateChange',
            featureFlagState(1),
            [],
          );
          await completeAsyncOperations();
          mocks.subscribe.mockClear();
          mocks.findSubscriptionsByChannelPrefix.mockClear();

          // An unrelated flag changes while the migration flags are the same
          const newState = featureFlagState(1);
          newState.remoteFeatureFlags.someUnrelatedFlag = true;
          rootMessenger.publish(
            'RemoteFeatureFlagController:stateChange',
            newState,
            [],
          );
          await completeAsyncOperations();

          expect(mocks.subscribe).not.toHaveBeenCalled();
          expect(mocks.findSubscriptionsByChannelPrefix).not.toHaveBeenCalled();
        });
      });

      it('does not resubscribe on flag change when the websocket is not connected', async () => {
        await withService(async ({ mocks, rootMessenger }) => {
          mocks.getConnectionInfo.mockReturnValue({
            state: WebSocketState.DISCONNECTED,
          });

          rootMessenger.publish(
            'RemoteFeatureFlagController:stateChange',
            featureFlagState(1),
            [],
          );
          await completeAsyncOperations();

          expect(mocks.subscribe).not.toHaveBeenCalled();
          expect(mocks.findSubscriptionsByChannelPrefix).not.toHaveBeenCalled();
        });
      });

      it('handles errors during flag change handling gracefully', async () => {
        await withService(async ({ mocks, rootMessenger }) => {
          mocks.getConnectionInfo.mockImplementation(() => {
            throw new Error('Connection info unavailable');
          });

          expect(() =>
            rootMessenger.publish(
              'RemoteFeatureFlagController:stateChange',
              featureFlagState(1),
              [],
            ),
          ).not.toThrow();
          await completeAsyncOperations();

          expect(mocks.subscribe).not.toHaveBeenCalled();
        });
      });
    });
  });
});
