import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import { flushPromises } from '../../../../tests/helpers';
import type { Transaction, BalanceUpdate } from '../types';
import type { AccountActivityMessage } from '../types';
import { AccountActivityService } from './AccountActivityService';
import type {
  AccountActivityServiceMessenger,
  SubscriptionOptions,
} from './AccountActivityService';
import type { ServerNotificationMessage } from './BackendWebSocketService';
import { WebSocketState } from './BackendWebSocketService';

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
const completeAsyncOperations = async (timeoutMs = 0): Promise<void> => {
  await flushPromises();
  // Allow nested async operations to complete
  if (timeoutMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  }
  await flushPromises();
};

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

type Mocks = {
  connect: jest.Mock;
  subscribe: jest.Mock;
  channelHasSubscription: jest.Mock;
  getSubscriptionsByChannel: jest.Mock;
  findSubscriptionsByChannelPrefix: jest.Mock;
  forceReconnection: jest.Mock;
  addChannelCallback: jest.Mock;
  removeChannelCallback: jest.Mock;
  getAccountsFromSelectedAccountGroup: jest.Mock;
};

/**
 * Build a minimal InternalAccount for tests.
 *
 * @param overrides - Partial account fields to override.
 * @returns A mock InternalAccount.
 */
function createMockInternalAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: 'mock-account-id',
    address: '0x1234567890123456789012345678901234567890',
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: ['eip155:0'],
    metadata: {
      name: 'Test Account',
      keyring: { type: 'HD Key Tree' },
      importTime: Date.now(),
      lastSelected: Date.now(),
    },
    ...overrides,
  } as InternalAccount;
}

/**
 * Creates a real messenger with registered mock actions for testing.
 * Each call creates a completely independent messenger to ensure test isolation.
 *
 * @returns Object containing the messenger and mock action functions
 */
const getMessenger = (): {
  rootMessenger: RootMessenger;
  messenger: AccountActivityServiceMessenger;
  mocks: Mocks;
} => {
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
    ],
    events: [
      'AccountTreeController:selectedAccountGroupChange',
      'BackendWebSocketService:connectionStateChanged',
    ],
    messenger,
  });

  const mocks: Mocks = {
    connect: jest.fn(),
    forceReconnection: jest.fn(),
    subscribe: jest.fn(),
    channelHasSubscription: jest.fn().mockReturnValue(false),
    getSubscriptionsByChannel: jest.fn().mockReturnValue([]),
    findSubscriptionsByChannelPrefix: jest.fn().mockReturnValue([]),
    addChannelCallback: jest.fn(),
    removeChannelCallback: jest.fn(),
    getAccountsFromSelectedAccountGroup: jest.fn().mockReturnValue([]),
  };

  rootMessenger.registerActionHandler(
    'AccountTreeController:getAccountsFromSelectedAccountGroup',
    mocks.getAccountsFromSelectedAccountGroup,
  );

  rootMessenger.registerActionHandler(
    'BackendWebSocketService:connect',
    mocks.connect,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:forceReconnection',
    mocks.forceReconnection,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:subscribe',
    mocks.subscribe,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:channelHasSubscription',
    mocks.channelHasSubscription,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:getSubscriptionsByChannel',
    mocks.getSubscriptionsByChannel,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:findSubscriptionsByChannelPrefix',
    mocks.findSubscriptionsByChannelPrefix,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:addChannelCallback',
    mocks.addChannelCallback,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:removeChannelCallback',
    mocks.removeChannelCallback,
  );

  return { rootMessenger, messenger, mocks };
};

/**
 * Test configuration options for withService
 */
type WithServiceOptions = {
  subscriptionNamespace?: string;
};

/**
 * The callback that `withService` calls.
 */
type WithServiceCallback<ReturnValue> = (payload: {
  service: AccountActivityService;
  messenger: AccountActivityServiceMessenger;
  rootMessenger: RootMessenger;
  mocks: Mocks;
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
 * bag contains arguments for the service constructor. The function is called
 * with the new service, root messenger, and service messenger.
 * @returns The same return value as the given function.
 */
async function withService<ReturnValue>(
  ...args:
    | [WithServiceCallback<ReturnValue>]
    | [WithServiceOptions, WithServiceCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ subscriptionNamespace }, testFunction] =
    args.length === 2 ? args : [{ subscriptionNamespace: undefined }, args[0]];

  const { messenger, rootMessenger, mocks } = getMessenger();

  const service = new AccountActivityService({
    messenger,
    subscriptionNamespace,
  });

  try {
    return await testFunction({ service, messenger, rootMessenger, mocks });
  } finally {
    service.destroy();
  }
}

describe('AccountActivityService', () => {
  // =============================================================================
  // CONSTRUCTOR TESTS
  // =============================================================================
  describe('constructor', () => {
    it('creates AccountActivityService and registers the system notification callback', async () => {
      await withService(async ({ service, messenger, mocks }) => {
        expect(service).toBeInstanceOf(AccountActivityService);
        expect(service.name).toBe('AccountActivityService');

        // Status changed event is only published when WebSocket disconnects
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

    it('does not subscribe to any account activity on construction', async () => {
      await withService(async ({ mocks }) => {
        expect(mocks.subscribe).not.toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // SUBSCRIBE TESTS
  // =============================================================================
  describe('subscribe', () => {
    const mockSubscription: SubscriptionOptions = {
      address: 'eip155:0:0x1234567890123456789012345678901234567890',
    };

    it('subscribes to a single channel for the address', async () => {
      await withService(async ({ service, mocks }) => {
        mocks.subscribe.mockResolvedValue({
          subscriptionId: 'sub-123',
          unsubscribe: jest.fn(),
        });

        await service.subscribe(mockSubscription);

        expect(mocks.connect).toHaveBeenCalledTimes(1);
        expect(mocks.subscribe).toHaveBeenCalledWith({
          channelType: 'account-activity.v1',
          channels: [
            'account-activity.v1.eip155:0:0x1234567890123456789012345678901234567890',
          ],
          callback: expect.any(Function),
        });
      });
    });

    it('does not call subscribe when the address is already subscribed', async () => {
      await withService(async ({ service, mocks }) => {
        mocks.channelHasSubscription.mockReturnValue(true);

        await service.subscribe(mockSubscription);

        expect(mocks.subscribe).not.toHaveBeenCalled();
      });
    });

    it('handles account activity messages by publishing transaction and balance events', async () => {
      await withService(async ({ service, mocks, messenger }) => {
        let capturedCallback: (
          notification: ServerNotificationMessage,
        ) => void = jest.fn();

        mocks.subscribe.mockImplementation((options) => {
          capturedCallback = options.callback;
          return Promise.resolve({
            subscriptionId: 'sub-123',
            unsubscribe: () => Promise.resolve(),
          });
        });

        await service.subscribe(mockSubscription);

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
                amount: '1000000000000000000',
              },
              transfers: [
                {
                  from: '0x1234567890123456789012345678901234567890',
                  to: '0x9876543210987654321098765432109876543210',
                  amount: '500000000000000000',
                },
              ],
            },
          ],
        };

        const notificationMessage = {
          event: 'notification',
          subscriptionId: 'sub-123',
          channel:
            'account-activity.v1.eip155:0:0x1234567890123456789012345678901234567890',
          data: activityMessage,
          timestamp: 1760344704595,
        };

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

        messenger.subscribe('AccountActivityService:balanceUpdated', (data) => {
          receivedBalanceEvents.push(data);
        });

        capturedCallback(notificationMessage);

        expect(receivedTransactionEvents).toHaveLength(1);
        expect(receivedTransactionEvents[0]).toStrictEqual(activityMessage.tx);

        expect(receivedBalanceEvents).toHaveLength(1);
        expect(receivedBalanceEvents[0]).toStrictEqual({
          address: '0x1234567890123456789012345678901234567890',
          chain: 'eip155:1',
          updates: activityMessage.updates,
        });
      });
    });

    it('handles subscription failure by calling forceReconnection', async () => {
      await withService(async ({ service, mocks }) => {
        mocks.subscribe.mockRejectedValue(new Error('Subscription failed'));

        const result = await service.subscribe({ address: '0x123abc' });
        expect(result).toBeUndefined();

        expect(mocks.subscribe).toHaveBeenCalledTimes(1);
        expect(mocks.forceReconnection).toHaveBeenCalledTimes(1);
        expect(mocks.connect).toHaveBeenCalledTimes(1);
      });
    });
  });

  // =============================================================================
  // SUBSCRIBE MANY TESTS
  // =============================================================================
  describe('subscribeMany', () => {
    it('returns early without connecting when addresses are empty', async () => {
      await withService(async ({ service, mocks }) => {
        await service.subscribeMany({ addresses: [] });

        expect(mocks.connect).not.toHaveBeenCalled();
        expect(mocks.subscribe).not.toHaveBeenCalled();
      });
    });

    it('subscribes to a single channel per address', async () => {
      await withService(async ({ service, mocks }) => {
        mocks.subscribe.mockResolvedValue({
          subscriptionId: 'sub-123',
          unsubscribe: jest.fn(),
        });

        await service.subscribeMany({
          addresses: [
            'eip155:0:0x1234567890123456789012345678901234567890',
            'solana:0:ABC123',
          ],
        });

        expect(mocks.connect).toHaveBeenCalledTimes(1);
        expect(mocks.subscribe).toHaveBeenCalledWith({
          channelType: 'account-activity.v1',
          channels: [
            'account-activity.v1.eip155:0:0x1234567890123456789012345678901234567890',
            'account-activity.v1.solana:0:ABC123',
          ],
          callback: expect.any(Function),
        });
      });
    });

    it('is idempotent and skips addresses that already have a subscription', async () => {
      await withService(async ({ service, mocks }) => {
        // First address already subscribed, second not
        mocks.channelHasSubscription.mockImplementation((channel: string) =>
          channel.includes('0x1234567890123456789012345678901234567890'),
        );
        mocks.subscribe.mockResolvedValue({
          subscriptionId: 'sub-123',
          unsubscribe: jest.fn(),
        });

        await service.subscribeMany({
          addresses: [
            'eip155:0:0x1234567890123456789012345678901234567890',
            'solana:0:ABC123',
          ],
        });

        expect(mocks.subscribe).toHaveBeenCalledWith(
          expect.objectContaining({
            channels: ['account-activity.v1.solana:0:ABC123'],
          }),
        );
      });
    });

    it('does not call subscribe when all addresses are already subscribed', async () => {
      await withService(async ({ service, mocks }) => {
        mocks.channelHasSubscription.mockReturnValue(true);

        await service.subscribeMany({
          addresses: [
            'eip155:0:0x1234567890123456789012345678901234567890',
          ],
        });

        expect(mocks.subscribe).not.toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // UNSUBSCRIBE TESTS
  // =============================================================================
  describe('unsubscribe', () => {
    const mockSubscription: SubscriptionOptions = {
      address: 'eip155:1:0x1234567890123456789012345678901234567890',
    };

    it('returns without errors when there are no active subscriptions', async () => {
      await withService(async ({ service, mocks }) => {
        mocks.getSubscriptionsByChannel.mockReturnValue([]);

        await service.unsubscribe(mockSubscription);

        expect(mocks.getSubscriptionsByChannel).toHaveBeenCalledWith(
          expect.any(String),
        );
      });
    });

    it('unsubscribes each matching subscription for the address', async () => {
      await withService(async ({ service, mocks }) => {
        const unsubscribeA = jest.fn().mockResolvedValue(undefined);
        const unsubscribeB = jest.fn().mockResolvedValue(undefined);
        mocks.getSubscriptionsByChannel.mockReturnValue([
          { unsubscribe: unsubscribeA },
          { unsubscribe: unsubscribeB },
        ]);

        await service.unsubscribe(mockSubscription);

        expect(unsubscribeA).toHaveBeenCalledTimes(1);
        expect(unsubscribeB).toHaveBeenCalledTimes(1);
      });
    });

    it('forces WebSocket reconnection when unsubscribe fails', async () => {
      await withService(async ({ service, mocks }) => {
        const error = new Error('Unsubscribe failed');
        const mockUnsubscribeError = jest.fn().mockRejectedValue(error);

        mocks.getSubscriptionsByChannel.mockReturnValue([
          {
            subscriptionId: 'sub-123',
            channels: [
              'account-activity.v1.eip155:1:0x1234567890123456789012345678901234567890',
            ],
            unsubscribe: mockUnsubscribeError,
          },
        ]);

        await service.unsubscribe(mockSubscription);

        expect(mocks.forceReconnection).toHaveBeenCalledTimes(1);
      });
    });
  });

  // =============================================================================
  // UNSUBSCRIBE MANY TESTS
  // =============================================================================
  describe('unsubscribeMany', () => {
    it('unsubscribes each matching subscription for every address', async () => {
      await withService(async ({ service, mocks }) => {
        const unsubscribeA = jest.fn().mockResolvedValue(undefined);
        const unsubscribeB = jest.fn().mockResolvedValue(undefined);
        mocks.getSubscriptionsByChannel.mockImplementation(
          (channel: string) => {
            if (channel.includes('ABC123')) {
              return [{ unsubscribe: unsubscribeB }];
            }
            return [{ unsubscribe: unsubscribeA }];
          },
        );

        await service.unsubscribeMany({
          addresses: [
            'eip155:0:0x1234567890123456789012345678901234567890',
            'solana:0:ABC123',
          ],
        });

        expect(unsubscribeA).toHaveBeenCalledTimes(1);
        expect(unsubscribeB).toHaveBeenCalledTimes(1);
      });
    });

    it('returns without errors when there are no active subscriptions', async () => {
      await withService(async ({ service, mocks }) => {
        mocks.getSubscriptionsByChannel.mockReturnValue([]);

        await service.unsubscribeMany({
          addresses: [
            'eip155:0:0x1234567890123456789012345678901234567890',
          ],
        });

        expect(mocks.forceReconnection).not.toHaveBeenCalled();
      });
    });

    it('forces WebSocket reconnection when unsubscribe fails', async () => {
      await withService(async ({ service, mocks }) => {
        const mockUnsubscribeError = jest
          .fn()
          .mockRejectedValue(new Error('Unsubscribe failed'));
        mocks.getSubscriptionsByChannel.mockReturnValue([
          { unsubscribe: mockUnsubscribeError },
        ]);

        await service.unsubscribeMany({
          addresses: [
            'eip155:0:0x1234567890123456789012345678901234567890',
          ],
        });

        expect(mocks.forceReconnection).toHaveBeenCalledTimes(1);
      });
    });
  });

  // =============================================================================
  // EVENT HANDLERS TESTS
  // =============================================================================
  describe('event handlers', () => {
    describe('handleSystemNotification', () => {
      it('throws for invalid system notifications missing required fields', async () => {
        await withService(async ({ mocks }) => {
          const systemCallback = getSystemNotificationCallback(mocks);

          const invalidNotification = {
            event: 'system-notification',
            channel: 'system',
            data: { invalid: true },
            timestamp: Date.now(),
          };

          expect(() => systemCallback(invalidNotification)).toThrow(
            'Invalid system notification data: missing chainIds or status',
          );
        });
      });

      it('tracks chains as up and down based on system notifications', async () => {
        await withService(async ({ messenger, mocks }) => {
          const statusChangedEventListener = jest.fn();
          messenger.subscribe(
            'AccountActivityService:statusChanged',
            statusChangedEventListener,
          );
          const systemCallback = getSystemNotificationCallback(mocks);

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
      it('publishes tracked chains as down on DISCONNECTED', async () => {
        await withService(async ({ messenger, rootMessenger, mocks }) => {
          const statusChangedEventListener = jest.fn();
          messenger.subscribe(
            'AccountActivityService:statusChanged',
            statusChangedEventListener,
          );

          // First, mark chains up via a system notification
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

          expect(statusChangedEventListener).toHaveBeenCalledWith({
            chainIds: ['eip155:1', 'eip155:137', 'eip155:56'],
            status: 'down',
            timestamp: expect.any(Number),
          });
        });
      });

      it('does not publish status change on disconnect when no chains are tracked', async () => {
        await withService(async ({ messenger, rootMessenger }) => {
          const statusChangedEventListener = jest.fn();
          messenger.subscribe(
            'AccountActivityService:statusChanged',
            statusChangedEventListener,
          );

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

          expect(statusChangedEventListener).not.toHaveBeenCalled();
        });
      });

      it('resubscribes to the selected account group when the WebSocket connects', async () => {
        await withService(async ({ rootMessenger, mocks }) => {
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
            createMockInternalAccount(),
          ]);

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

          expect(mocks.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({
              channels: [
                'account-activity.v1.eip155:0:0x1234567890123456789012345678901234567890',
              ],
            }),
          );
        });
      });

      it('does not subscribe on connect when the selected account group is empty', async () => {
        await withService(async ({ rootMessenger, mocks }) => {
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([]);

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
        });
      });
    });

    describe('handleSelectedAccountGroupChange', () => {
      it('subscribes only to EVM accounts in the selected group (Solana/Tron not yet supported in prod)', async () => {
        await withService(async ({ rootMessenger, mocks }) => {
          mocks.subscribe.mockResolvedValue({
            subscriptionId: 'sub-123',
            unsubscribe: jest.fn(),
          });
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
            createMockInternalAccount(),
            createMockInternalAccount({
              id: 'solana-account-id',
              address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
              type: 'solana:data-account',
              scopes: ['solana:0'],
            }),
            createMockInternalAccount({
              id: 'tron-account-id',
              address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5Kcbic7',
              type: 'tron:eoa',
              scopes: ['tron:728126428'],
            }),
          ]);

          rootMessenger.publish(
            'AccountTreeController:selectedAccountGroupChange',
            'entropy:wallet/1',
            'entropy:wallet/0',
          );
          await completeAsyncOperations();

          // Only the EVM channel is subscribed; Solana and Tron are filtered out.
          expect(mocks.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({
              channels: [
                'account-activity.v1.eip155:0:0x1234567890123456789012345678901234567890',
              ],
            }),
          );
        });
      });

      it('does not subscribe when the selected group has no EVM accounts', async () => {
        await withService(async ({ rootMessenger, mocks }) => {
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
            createMockInternalAccount({
              id: 'solana-account-id',
              address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
              type: 'solana:data-account',
              scopes: ['solana:0'],
            }),
          ]);

          rootMessenger.publish(
            'AccountTreeController:selectedAccountGroupChange',
            'entropy:wallet/1',
            'entropy:wallet/0',
          );
          await completeAsyncOperations();

          expect(mocks.subscribe).not.toHaveBeenCalled();
        });
      });

      it('lowercases EVM addresses so the channel matches other consumers', async () => {
        await withService(async ({ rootMessenger, mocks }) => {
          mocks.subscribe.mockResolvedValue({
            subscriptionId: 'sub-123',
            unsubscribe: jest.fn(),
          });
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
            createMockInternalAccount({
              address: '0xB5D1D02A7ADB2E72A562A1C18C50216159E5C99C',
            }),
          ]);

          rootMessenger.publish(
            'AccountTreeController:selectedAccountGroupChange',
            'entropy:wallet/1',
            'entropy:wallet/0',
          );
          await completeAsyncOperations();

          expect(mocks.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({
              channels: [
                'account-activity.v1.eip155:0:0xb5d1d02a7adb2e72a562a1c18c50216159e5c99c',
              ],
            }),
          );
        });
      });

      it('unsubscribes existing account activity before subscribing to the new group', async () => {
        await withService(async ({ rootMessenger, mocks }) => {
          const unsubscribe = jest.fn().mockResolvedValue(undefined);
          mocks.findSubscriptionsByChannelPrefix.mockReturnValue([
            { unsubscribe },
          ]);
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([
            createMockInternalAccount(),
          ]);

          rootMessenger.publish(
            'AccountTreeController:selectedAccountGroupChange',
            'entropy:wallet/1',
            'entropy:wallet/0',
          );
          await completeAsyncOperations();

          expect(mocks.findSubscriptionsByChannelPrefix).toHaveBeenCalledWith(
            'account-activity.v1',
          );
          expect(unsubscribe).toHaveBeenCalledTimes(1);
        });
      });

      it('does not subscribe when the selected group has no accounts', async () => {
        await withService(async ({ rootMessenger, mocks }) => {
          mocks.getAccountsFromSelectedAccountGroup.mockReturnValue([]);

          rootMessenger.publish(
            'AccountTreeController:selectedAccountGroupChange',
            'entropy:wallet/1',
            'entropy:wallet/0',
          );
          await completeAsyncOperations();

          expect(mocks.subscribe).not.toHaveBeenCalled();
        });
      });
    });
  });

  // =============================================================================
  // CLEANUP TESTS
  // =============================================================================
  describe('destroy', () => {
    it('removes the system notification channel callback', async () => {
      await withService(async ({ service, mocks }) => {
        service.destroy();

        expect(mocks.removeChannelCallback).toHaveBeenCalledWith(
          'system-notifications.v1.account-activity.v1',
        );
      });
    });
  });
});
