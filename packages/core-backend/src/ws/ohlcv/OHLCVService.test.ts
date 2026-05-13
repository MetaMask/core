import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import { flushPromises } from '../../../../../tests/helpers';
import type { ServerNotificationMessage } from '../BackendWebSocketService';
import { WebSocketState } from '../BackendWebSocketService';
import { OHLCVService } from './OHLCVService';
import type { OHLCVServiceMessenger } from './OHLCVService';
import type { OHLCVSubscriptionOptions } from './types';

// =============================================================================
// Test Helpers
// =============================================================================

type AllOHLCVServiceActions = MessengerActions<OHLCVServiceMessenger>;
type AllOHLCVServiceEvents = MessengerEvents<OHLCVServiceMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllOHLCVServiceActions,
  AllOHLCVServiceEvents
>;

const completeAsyncOperations = async (timeoutMs = 0): Promise<void> => {
  // Multiple rounds are needed because the channel lock chains promises
  // through .then(), requiring several microtask ticks to fully settle.
  for (let i = 0; i < 5; i++) {
    await flushPromises();
  }
  if (timeoutMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  }
  await flushPromises();
};

function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

const getMessenger = (): {
  rootMessenger: RootMessenger;
  messenger: OHLCVServiceMessenger;
  mocks: {
    connect: jest.Mock;
    subscribe: jest.Mock;
    channelHasSubscription: jest.Mock;
    getSubscriptionsByChannel: jest.Mock;
    findSubscriptionsByChannelPrefix: jest.Mock;
    forceReconnection: jest.Mock;
    addChannelCallback: jest.Mock;
    removeChannelCallback: jest.Mock;
    getConnectionInfo: jest.Mock;
  };
} => {
  const rootMessenger = getRootMessenger();
  const messenger: OHLCVServiceMessenger = new Messenger<
    'OHLCVService',
    AllOHLCVServiceActions,
    AllOHLCVServiceEvents,
    RootMessenger
  >({
    namespace: 'OHLCVService',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: [
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
    events: ['BackendWebSocketService:connectionStateChanged'],
    messenger,
  });

  const mockConnect = jest.fn();
  const mockForceReconnection = jest.fn();
  const mockSubscribe = jest.fn();
  const mockChannelHasSubscription = jest.fn().mockReturnValue(false);
  const mockGetSubscriptionsByChannel = jest.fn().mockReturnValue([]);
  const mockFindSubscriptionsByChannelPrefix = jest.fn().mockReturnValue([]);
  const mockAddChannelCallback = jest.fn();
  const mockRemoveChannelCallback = jest.fn();
  const mockGetConnectionInfo = jest.fn();

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

  return {
    rootMessenger,
    messenger,
    mocks: {
      connect: mockConnect,
      subscribe: mockSubscribe,
      channelHasSubscription: mockChannelHasSubscription,
      getSubscriptionsByChannel: mockGetSubscriptionsByChannel,
      findSubscriptionsByChannelPrefix: mockFindSubscriptionsByChannelPrefix,
      forceReconnection: mockForceReconnection,
      addChannelCallback: mockAddChannelCallback,
      removeChannelCallback: mockRemoveChannelCallback,
      getConnectionInfo: mockGetConnectionInfo,
    },
  };
};

type WithServiceCallback<R> = (payload: {
  service: OHLCVService;
  messenger: OHLCVServiceMessenger;
  rootMessenger: RootMessenger;
  mocks: ReturnType<typeof getMessenger>['mocks'];
  destroy: () => void;
}) => Promise<R> | R;

async function withService<R>(fn: WithServiceCallback<R>): Promise<R> {
  const setup = getMessenger();
  const service = new OHLCVService({ messenger: setup.messenger });
  service.init();

  try {
    return await fn({
      service,
      messenger: setup.messenger,
      rootMessenger: setup.rootMessenger,
      mocks: setup.mocks,
      destroy: () => service.destroy(),
    });
  } finally {
    service.destroy();
  }
}

const getSystemNotificationCallback = (mocks: {
  addChannelCallback: jest.Mock;
}): ((notification: ServerNotificationMessage) => void) => {
  const call = mocks.addChannelCallback.mock.calls.find(
    (c: unknown[]) =>
      c[0] &&
      typeof c[0] === 'object' &&
      'channelName' in c[0] &&
      (c[0] as { channelName: string }).channelName ===
        'system-notifications.v1.market-data.v1',
  );

  if (!call) {
    throw new Error('system notification callback not registered');
  }

  return (call[0] as { callback: (n: ServerNotificationMessage) => void })
    .callback;
};

// =============================================================================
// Shared Constants
// =============================================================================

const SUB_OPTS: OHLCVSubscriptionOptions = {
  assetId: 'eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  interval: '1m',
  currency: 'usd',
};

const EXPECTED_CHANNEL =
  'market-data.v1.eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913.1m.usd';

const BASE_CONNECTION_INFO = {
  url: 'ws://test',
  timeout: 10000,
  reconnectDelay: 500,
  maxReconnectDelay: 5000,
  requestTimeout: 30000,
};

// =============================================================================
// Tests
// =============================================================================

describe('OHLCVService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ===========================================================================
  // Constructor
  // ===========================================================================

  describe('constructor', () => {
    it('should register method action handlers and system-notifications callback', async () => {
      await withService(async ({ service, mocks }) => {
        expect(service).toBeInstanceOf(OHLCVService);
        expect(service.name).toBe('OHLCVService');

        expect(mocks.addChannelCallback).toHaveBeenCalledWith({
          channelName: 'system-notifications.v1.market-data.v1',
          callback: expect.any(Function),
        });
      });
    });
  });

  // ===========================================================================
  // Subscribe
  // ===========================================================================

  describe('subscribe', () => {
    it('should connect and create a WebSocket subscription for a new channel', async () => {
      await withService(async ({ service, mocks }) => {
        await service.subscribe(SUB_OPTS);

        expect(mocks.connect).toHaveBeenCalledTimes(1);
        expect(mocks.channelHasSubscription).toHaveBeenCalledWith(
          EXPECTED_CHANNEL,
        );
        expect(mocks.subscribe).toHaveBeenCalledWith({
          channels: [EXPECTED_CHANNEL],
          channelType: 'market-data.v1',
          callback: expect.any(Function),
        });
      });
    });

    it('should skip WS subscribe if the channel already has a subscription', async () => {
      await withService(async ({ service, mocks }) => {
        mocks.channelHasSubscription.mockReturnValue(true);

        await service.subscribe(SUB_OPTS);

        expect(mocks.subscribe).not.toHaveBeenCalled();
      });
    });

    it('should increment refCount on duplicate subscribe without WS traffic', async () => {
      await withService(async ({ service, mocks }) => {
        await service.subscribe(SUB_OPTS);
        mocks.subscribe.mockClear();
        mocks.connect.mockClear();

        await service.subscribe(SUB_OPTS);

        expect(mocks.connect).not.toHaveBeenCalled();
        expect(mocks.subscribe).not.toHaveBeenCalled();
      });
    });

    it('should publish subscriptionError when subscribe fails', async () => {
      await withService(async ({ service, mocks, messenger }) => {
        mocks.connect.mockRejectedValueOnce(new Error('connection failed'));

        const errorListener = jest.fn();
        messenger.subscribe('OHLCVService:subscriptionError', errorListener);

        await service.subscribe(SUB_OPTS);

        expect(errorListener).toHaveBeenCalledWith({
          channel: EXPECTED_CHANNEL,
          error: expect.stringContaining('connection failed'),
          operation: 'subscribe',
        });
        expect(mocks.forceReconnection).not.toHaveBeenCalled();
      });
    });

    it('should publish barUpdated events when WebSocket delivers data', async () => {
      await withService(async ({ service, mocks, messenger }) => {
        let capturedCallback: (n: ServerNotificationMessage) => void =
          jest.fn();

        mocks.subscribe.mockImplementation((opts) => {
          capturedCallback = opts.callback;
          return Promise.resolve();
        });

        await service.subscribe(SUB_OPTS);

        const barListener = jest.fn();
        messenger.subscribe('OHLCVService:barUpdated', barListener);

        capturedCallback({
          event: 'data',
          subscriptionId: 'sub-1',
          timestamp: 1776364071003,
          channel: EXPECTED_CHANNEL,
          data: {
            timestamp: 1776364020,
            open: 74.099,
            high: 74.1,
            low: 74.083,
            close: 74.099,
            volume: 5806.43,
          },
        } as ServerNotificationMessage);

        expect(barListener).toHaveBeenCalledWith({
          channel: EXPECTED_CHANNEL,
          bar: {
            timestamp: 1776364020,
            open: 74.099,
            high: 74.1,
            low: 74.083,
            close: 74.099,
            volume: 5806.43,
          },
        });
      });
    });
  });

  // ===========================================================================
  // Unsubscribe
  // ===========================================================================

  describe('unsubscribe', () => {
    it('should be a no-op if channel was never subscribed', async () => {
      await withService(async ({ service, mocks }) => {
        await service.unsubscribe(SUB_OPTS);

        expect(mocks.getSubscriptionsByChannel).not.toHaveBeenCalled();
      });
    });

    it('should decrement refCount without unsubscribing when other consumers remain', async () => {
      await withService(async ({ service, mocks }) => {
        await service.subscribe(SUB_OPTS);
        await service.subscribe(SUB_OPTS);

        await service.unsubscribe(SUB_OPTS);

        // No timer should have been started, no WS unsubscribe
        jest.advanceTimersByTime(5000);
        await completeAsyncOperations();
        expect(mocks.getSubscriptionsByChannel).not.toHaveBeenCalled();
      });
    });

    it('should start a grace-period timer and unsubscribe after expiry', async () => {
      await withService(async ({ service, mocks }) => {
        const mockUnsub = jest.fn();
        mocks.getSubscriptionsByChannel.mockReturnValue([
          { unsubscribe: mockUnsub },
        ]);

        await service.subscribe(SUB_OPTS);
        await service.unsubscribe(SUB_OPTS);

        // Before grace period expires — still subscribed
        expect(mockUnsub).not.toHaveBeenCalled();

        jest.advanceTimersByTime(3000);
        await completeAsyncOperations();

        expect(mocks.getSubscriptionsByChannel).toHaveBeenCalledWith(
          EXPECTED_CHANNEL,
        );
        expect(mockUnsub).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ===========================================================================
  // Grace Period — Re-subscribe During Grace
  // ===========================================================================

  describe('grace period', () => {
    it('should cancel grace-period timer if re-subscribed before expiry', async () => {
      await withService(async ({ service, mocks }) => {
        const mockUnsub = jest.fn();
        mocks.getSubscriptionsByChannel.mockReturnValue([
          { unsubscribe: mockUnsub },
        ]);

        await service.subscribe(SUB_OPTS);
        await service.unsubscribe(SUB_OPTS);

        // WS subscription still exists (no disconnect happened)
        mocks.channelHasSubscription.mockReturnValue(true);

        // Re-subscribe during grace period
        jest.advanceTimersByTime(1000);
        mocks.subscribe.mockClear();
        mocks.connect.mockClear();
        await service.subscribe(SUB_OPTS);

        // Should NOT have called connect/subscribe again — subscription is still alive
        expect(mocks.connect).not.toHaveBeenCalled();
        expect(mocks.subscribe).not.toHaveBeenCalled();

        // Advance past original grace period — should NOT unsubscribe
        jest.advanceTimersByTime(5000);
        await completeAsyncOperations();
        expect(mockUnsub).not.toHaveBeenCalled();
      });
    });

    it('should unsubscribe old channel after grace period during time-range switching', async () => {
      const opts1m = SUB_OPTS;
      const opts1h: OHLCVSubscriptionOptions = {
        ...SUB_OPTS,
        interval: '1h',
      };

      await withService(async ({ service, mocks }) => {
        const mockUnsub = jest.fn().mockResolvedValue(undefined);
        mocks.getSubscriptionsByChannel.mockReturnValue([
          { unsubscribe: mockUnsub },
        ]);

        // Subscribe 1m → unsubscribe → subscribe 1h
        await service.subscribe(opts1m);
        await service.unsubscribe(opts1m);
        await service.subscribe(opts1h);

        // 1m is in grace period, not yet unsubscribed
        expect(mockUnsub).not.toHaveBeenCalled();

        // Grace period expires — old channel cleaned up
        jest.advanceTimersByTime(3000);
        await completeAsyncOperations();
        expect(mockUnsub).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ===========================================================================
  // Reference Counting
  // ===========================================================================

  describe('reference counting', () => {
    it('should share a single WS subscription across multiple consumers', async () => {
      await withService(async ({ service, mocks }) => {
        await service.subscribe(SUB_OPTS);
        await service.subscribe(SUB_OPTS);
        await service.subscribe(SUB_OPTS);

        // Only one WS subscribe call
        expect(mocks.subscribe).toHaveBeenCalledTimes(1);

        // Unsubscribe twice — refCount goes from 3 → 1
        await service.unsubscribe(SUB_OPTS);
        await service.unsubscribe(SUB_OPTS);

        jest.advanceTimersByTime(5000);
        await completeAsyncOperations();

        // Still has one consumer — no WS unsubscribe
        expect(mocks.getSubscriptionsByChannel).not.toHaveBeenCalled();
      });
    });

    it('should unsubscribe from WS when all consumers leave and grace expires', async () => {
      await withService(async ({ service, mocks }) => {
        const mockUnsub = jest.fn();
        mocks.getSubscriptionsByChannel.mockReturnValue([
          { unsubscribe: mockUnsub },
        ]);

        await service.subscribe(SUB_OPTS);
        await service.subscribe(SUB_OPTS);

        await service.unsubscribe(SUB_OPTS);
        await service.unsubscribe(SUB_OPTS);

        jest.advanceTimersByTime(3000);
        await completeAsyncOperations();

        expect(mockUnsub).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ===========================================================================
  // Race Condition — Per-Channel Locking
  // ===========================================================================

  describe('per-channel locking', () => {
    it('should serialize concurrent subscribes so refCount is correct', async () => {
      await withService(async ({ service, mocks }) => {
        let connectResolve!: () => void;
        mocks.connect.mockImplementation(
          () =>
            new Promise<void>((resolve) => {
              connectResolve = resolve;
            }),
        );

        const p1 = service.subscribe(SUB_OPTS);
        // Let the microtask tick so `connect` is called and `connectResolve` is assigned
        await flushPromises();

        const p2 = service.subscribe(SUB_OPTS);

        // p1 is waiting on connect, p2 is queued behind it via the lock
        connectResolve();
        mocks.connect.mockResolvedValue(undefined);
        await p1;
        await p2;

        expect(mocks.subscribe).toHaveBeenCalledTimes(1);

        const mockUnsub = jest.fn();
        mocks.getSubscriptionsByChannel.mockReturnValue([
          { unsubscribe: mockUnsub },
        ]);

        // refCount must be 2 — first unsubscribe drops it to 1, no grace timer
        await service.unsubscribe(SUB_OPTS);
        jest.advanceTimersByTime(5000);
        await completeAsyncOperations();
        expect(mockUnsub).not.toHaveBeenCalled();

        // Second unsubscribe drops refCount to 0 → grace timer → WS unsubscribe
        await service.unsubscribe(SUB_OPTS);
        jest.advanceTimersByTime(3000);
        await completeAsyncOperations();
        expect(mockUnsub).toHaveBeenCalledTimes(1);
      });
    });

    it('should serialize concurrent subscribe + unsubscribe so refCount never corrupts', async () => {
      await withService(async ({ service, mocks }) => {
        let connectResolve!: () => void;
        mocks.connect.mockImplementation(
          () =>
            new Promise<void>((resolve) => {
              connectResolve = resolve;
            }),
        );

        const pSub = service.subscribe(SUB_OPTS);
        await flushPromises();

        const pUnsub = service.unsubscribe(SUB_OPTS);

        connectResolve();
        await pSub;
        await pUnsub;

        // After subscribe then unsubscribe, refCount is 0 → grace timer starts
        // Advance past grace period
        const mockUnsub = jest.fn();
        mocks.getSubscriptionsByChannel.mockReturnValue([
          { unsubscribe: mockUnsub },
        ]);

        jest.advanceTimersByTime(3000);
        await completeAsyncOperations();

        expect(mockUnsub).toHaveBeenCalledTimes(1);
      });
    });

    it('should create a fresh WS subscription when subscribe races with grace-period unsubscribe', async () => {
      await withService(async ({ service, mocks }) => {
        let unsubResolve!: () => void;
        const mockUnsub = jest.fn(
          () =>
            new Promise<void>((resolve) => {
              unsubResolve = resolve;
            }),
        );
        mocks.getSubscriptionsByChannel.mockReturnValue([
          { unsubscribe: mockUnsub },
        ]);

        await service.subscribe(SUB_OPTS);
        await service.unsubscribe(SUB_OPTS);

        jest.advanceTimersByTime(3000);
        await flushPromises();

        const subscribePromise = service.subscribe(SUB_OPTS);
        unsubResolve();
        await subscribePromise;

        expect(mocks.subscribe).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ===========================================================================
  // Reconnect Resilience
  // ===========================================================================

  describe('reconnect', () => {
    it('should resubscribe active channels on WebSocket CONNECTED', async () => {
      await withService(async ({ service, mocks, rootMessenger }) => {
        await service.subscribe(SUB_OPTS);
        mocks.subscribe.mockClear();
        mocks.channelHasSubscription.mockReturnValue(false);

        rootMessenger.publish(
          'BackendWebSocketService:connectionStateChanged',
          {
            ...BASE_CONNECTION_INFO,
            state: WebSocketState.CONNECTED,
            connectedAt: Date.now(),
            reconnectAttempts: 0,
          },
        );
        await completeAsyncOperations();

        expect(mocks.subscribe).toHaveBeenCalledWith({
          channels: [EXPECTED_CHANNEL],
          channelType: 'market-data.v1',
          callback: expect.any(Function),
        });
      });
    });

    it('should skip resubscribe if channel already has a subscription after reconnect', async () => {
      await withService(async ({ service, mocks, rootMessenger }) => {
        await service.subscribe(SUB_OPTS);
        mocks.subscribe.mockClear();
        mocks.channelHasSubscription.mockReturnValue(true);

        rootMessenger.publish(
          'BackendWebSocketService:connectionStateChanged',
          {
            ...BASE_CONNECTION_INFO,
            state: WebSocketState.CONNECTED,
            connectedAt: Date.now(),
            reconnectAttempts: 0,
          },
        );
        await completeAsyncOperations();

        expect(mocks.subscribe).not.toHaveBeenCalled();
      });
    });

    it('should not resubscribe channels in grace period (refCount === 0)', async () => {
      await withService(async ({ service, mocks, rootMessenger }) => {
        await service.subscribe(SUB_OPTS);
        await service.unsubscribe(SUB_OPTS);

        // Channel is now in grace period (refCount === 0, timer running)
        mocks.subscribe.mockClear();
        mocks.channelHasSubscription.mockReturnValue(false);

        rootMessenger.publish(
          'BackendWebSocketService:connectionStateChanged',
          {
            ...BASE_CONNECTION_INFO,
            state: WebSocketState.CONNECTED,
            connectedAt: Date.now(),
            reconnectAttempts: 0,
          },
        );
        await completeAsyncOperations();

        expect(mocks.subscribe).not.toHaveBeenCalled();
      });
    });

    it('should recreate WS subscription when re-subscribing during grace period after disconnect', async () => {
      await withService(
        async ({ service, mocks, messenger, rootMessenger }) => {
          // 1. Subscribe — creates WS subscription, refCount = 1
          await service.subscribe(SUB_OPTS);

          // 2. Unsubscribe — refCount = 0, grace-period timer starts
          await service.unsubscribe(SUB_OPTS);

          // 3. Disconnect — BackendWebSocketService clears all server-side
          //    subscriptions. channelHasSubscription now returns false.
          mocks.channelHasSubscription.mockReturnValue(false);
          rootMessenger.publish(
            'BackendWebSocketService:connectionStateChanged',
            {
              ...BASE_CONNECTION_INFO,
              state: WebSocketState.DISCONNECTED,
              connectedAt: undefined,
              reconnectAttempts: 0,
            },
          );
          await completeAsyncOperations();

          // 4. Reconnect — resubscribeActiveChannels skips this channel
          //    because refCount is 0 (correct behaviour).
          mocks.subscribe.mockClear();
          mocks.connect.mockClear();
          rootMessenger.publish(
            'BackendWebSocketService:connectionStateChanged',
            {
              ...BASE_CONNECTION_INFO,
              state: WebSocketState.CONNECTED,
              connectedAt: Date.now(),
              reconnectAttempts: 1,
            },
          );
          await completeAsyncOperations();
          expect(mocks.subscribe).not.toHaveBeenCalled();

          // 5. User re-subscribes BEFORE grace timer fires.
          //    The grace-period branch cancels the timer and bumps refCount,
          //    but the underlying WS subscription no longer exists.
          //    The fix must detect this and create a fresh WS subscription.
          mocks.subscribe.mockClear();
          mocks.connect.mockClear();
          await service.subscribe(SUB_OPTS);

          expect(mocks.connect).toHaveBeenCalledTimes(1);
          expect(mocks.subscribe).toHaveBeenCalledWith({
            channels: [EXPECTED_CHANNEL],
            channelType: 'market-data.v1',
            callback: expect.any(Function),
          });

          // 6. Verify bar updates are delivered through the new subscription.
          const capturedCallback = mocks.subscribe.mock.calls[0][0].callback;
          const barListener = jest.fn();
          messenger.subscribe('OHLCVService:barUpdated', barListener);

          capturedCallback({
            data: {
              timestamp: 200,
              open: 10,
              high: 20,
              low: 5,
              close: 15,
              volume: 1000,
            },
            timestamp: Date.now(),
          });

          expect(barListener).toHaveBeenCalledWith({
            channel: EXPECTED_CHANNEL,
            bar: {
              timestamp: 200,
              open: 10,
              high: 20,
              low: 5,
              close: 15,
              volume: 1000,
            },
          });
        },
      );
    });

    it('should deliver bar updates via resubscribed channel callback', async () => {
      await withService(
        async ({ service, mocks, messenger, rootMessenger }) => {
          await service.subscribe(SUB_OPTS);
          mocks.subscribe.mockClear();
          mocks.channelHasSubscription.mockReturnValue(false);

          rootMessenger.publish(
            'BackendWebSocketService:connectionStateChanged',
            {
              ...BASE_CONNECTION_INFO,
              state: WebSocketState.CONNECTED,
              connectedAt: Date.now(),
              reconnectAttempts: 0,
            },
          );
          await completeAsyncOperations();

          const resubscribeCallback = mocks.subscribe.mock.calls[0][0].callback;
          const barListener = jest.fn();
          messenger.subscribe('OHLCVService:barUpdated', barListener);

          resubscribeCallback({
            data: {
              timestamp: 100,
              open: 1,
              high: 2,
              low: 0.5,
              close: 1.5,
              volume: 999,
            },
            timestamp: Date.now(),
          });

          expect(barListener).toHaveBeenCalledWith({
            channel: EXPECTED_CHANNEL,
            bar: {
              timestamp: 100,
              open: 1,
              high: 2,
              low: 0.5,
              close: 1.5,
              volume: 999,
            },
          });
        },
      );
    });

    it('should publish chainStatusChanged down on DISCONNECTED', async () => {
      await withService(async ({ mocks, messenger, rootMessenger }) => {
        const statusListener = jest.fn();
        messenger.subscribe('OHLCVService:chainStatusChanged', statusListener);

        // Simulate a system notification marking a chain as up
        const systemCallback = getSystemNotificationCallback(mocks);
        systemCallback({
          event: 'system-notification',
          channel: 'system-notifications.v1.market-data.v1',
          data: { chainIds: ['eip155:8453'], status: 'up' },
          timestamp: Date.now(),
        } as ServerNotificationMessage);

        statusListener.mockClear();

        rootMessenger.publish(
          'BackendWebSocketService:connectionStateChanged',
          {
            ...BASE_CONNECTION_INFO,
            state: WebSocketState.DISCONNECTED,
            connectedAt: undefined,
            reconnectAttempts: 0,
          },
        );
        await completeAsyncOperations();

        expect(statusListener).toHaveBeenCalledWith(
          expect.objectContaining({
            chainIds: ['eip155:8453'],
            status: 'down',
          }),
        );
      });
    });
  });

  // ===========================================================================
  // System Notifications
  // ===========================================================================

  describe('system notifications', () => {
    it('should forward chain-down notifications via chainStatusChanged event', async () => {
      await withService(async ({ mocks, messenger }) => {
        const statusListener = jest.fn();
        messenger.subscribe('OHLCVService:chainStatusChanged', statusListener);

        const systemCallback = getSystemNotificationCallback(mocks);
        systemCallback({
          event: 'system-notification',
          channel: 'system-notifications.v1.market-data.v1',
          data: { chainIds: ['eip155:8453'], status: 'down' },
          timestamp: 1776364071003,
        } as ServerNotificationMessage);

        expect(statusListener).toHaveBeenCalledWith({
          chainIds: ['eip155:8453'],
          status: 'down',
          timestamp: 1776364071003,
        });
      });
    });

    it('should forward chain-up notifications', async () => {
      await withService(async ({ mocks, messenger }) => {
        const statusListener = jest.fn();
        messenger.subscribe('OHLCVService:chainStatusChanged', statusListener);

        const systemCallback = getSystemNotificationCallback(mocks);
        systemCallback({
          event: 'system-notification',
          channel: 'system-notifications.v1.market-data.v1',
          data: { chainIds: ['eip155:1', 'eip155:137'], status: 'up' },
          timestamp: 1776364071003,
        } as ServerNotificationMessage);

        expect(statusListener).toHaveBeenCalledWith({
          chainIds: ['eip155:1', 'eip155:137'],
          status: 'up',
          timestamp: 1776364071003,
        });
      });
    });

    it('should throw on invalid system notification data', async () => {
      await withService(async ({ mocks }) => {
        const systemCallback = getSystemNotificationCallback(mocks);

        expect(() =>
          systemCallback({
            event: 'system-notification',
            channel: 'system-notifications.v1.market-data.v1',
            data: { invalid: true },
            timestamp: Date.now(),
          } as unknown as ServerNotificationMessage),
        ).toThrow('Invalid system notification data');
      });
    });
  });

  // ===========================================================================
  // Error Paths
  // ===========================================================================

  describe('error paths', () => {
    it('should publish subscriptionError when unsubscribe fails', async () => {
      await withService(async ({ service, mocks, messenger }) => {
        mocks.getSubscriptionsByChannel.mockImplementation(() => {
          throw new Error('ws gone');
        });

        const errorListener = jest.fn();
        messenger.subscribe('OHLCVService:subscriptionError', errorListener);

        await service.subscribe(SUB_OPTS);
        await service.unsubscribe(SUB_OPTS);

        jest.advanceTimersByTime(3000);
        await completeAsyncOperations();

        expect(errorListener).toHaveBeenCalledWith({
          channel: EXPECTED_CHANNEL,
          error: expect.stringContaining('ws gone'),
          operation: 'unsubscribe',
        });
        expect(mocks.forceReconnection).not.toHaveBeenCalled();
      });
    });

    it('should clean up channel entry when subscribe fails during grace-period fall-through so subsequent subscribes work', async () => {
      await withService(async ({ service, mocks, messenger }) => {
        // 1. Subscribe — creates WS subscription, refCount = 1
        await service.subscribe(SUB_OPTS);

        // 2. Unsubscribe — refCount = 0, grace-period timer starts
        await service.unsubscribe(SUB_OPTS);

        // 3. Disconnect — channelHasSubscription returns false
        mocks.channelHasSubscription.mockReturnValue(false);

        // 4. Re-subscribe during grace period — grace branch detects WS
        //    subscription is gone and falls through to the try block.
        //    Make connect() throw to simulate a network failure.
        mocks.connect.mockRejectedValueOnce(new Error('network down'));
        mocks.subscribe.mockClear();
        mocks.connect.mockClear();

        const errorListener = jest.fn();
        messenger.subscribe('OHLCVService:subscriptionError', errorListener);

        await service.subscribe(SUB_OPTS);

        expect(errorListener).toHaveBeenCalledWith({
          channel: EXPECTED_CHANNEL,
          error: expect.stringContaining('network down'),
          operation: 'subscribe',
        });
        expect(mocks.forceReconnection).not.toHaveBeenCalled();

        // 5. Now the critical assertion: a subsequent subscribe() must NOT
        //    silently increment a stale refCount. It must attempt a fresh
        //    WS subscription.
        mocks.connect.mockResolvedValue(undefined);
        mocks.subscribe.mockClear();

        await service.subscribe(SUB_OPTS);

        expect(mocks.subscribe).toHaveBeenCalledWith({
          channels: [EXPECTED_CHANNEL],
          channelType: 'market-data.v1',
          callback: expect.any(Function),
        });
      });
    });

    it('should log and continue when resubscription fails for a channel', async () => {
      await withService(async ({ service, mocks, rootMessenger }) => {
        await service.subscribe(SUB_OPTS);
        mocks.subscribe.mockClear();
        mocks.channelHasSubscription.mockReturnValue(false);
        mocks.subscribe.mockRejectedValueOnce(new Error('resubscribe fail'));

        rootMessenger.publish(
          'BackendWebSocketService:connectionStateChanged',
          {
            ...BASE_CONNECTION_INFO,
            state: WebSocketState.CONNECTED,
            connectedAt: Date.now(),
            reconnectAttempts: 1,
          },
        );
        await completeAsyncOperations();

        // Should have attempted but failed silently
        expect(mocks.subscribe).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ===========================================================================
  // Reconnect + Concurrent Mutation Safety
  // ===========================================================================

  describe('resubscribe holds mutex to prevent concurrent mutation', () => {
    it('should block unsubscribe until resubscription completes, preventing orphaned WS subscriptions', async () => {
      await withService(async ({ service, mocks, rootMessenger }) => {
        await service.subscribe(SUB_OPTS);
        mocks.subscribe.mockClear();
        mocks.channelHasSubscription.mockReturnValue(false);

        // Make the WS subscribe during reconnect take time so we can
        // attempt a concurrent unsubscribe while it's in progress.
        let resubResolve!: () => void;
        mocks.subscribe.mockImplementation(
          () =>
            new Promise<void>((resolve) => {
              resubResolve = resolve;
            }),
        );

        // Trigger reconnect — this calls #resubscribeActiveChannels which
        // now holds the mutex across the entire loop.
        rootMessenger.publish(
          'BackendWebSocketService:connectionStateChanged',
          {
            ...BASE_CONNECTION_INFO,
            state: WebSocketState.CONNECTED,
            connectedAt: Date.now(),
            reconnectAttempts: 1,
          },
        );
        await flushPromises();

        // Concurrent unsubscribe — must queue behind the mutex.
        const unsubPromise = service.unsubscribe(SUB_OPTS);

        // The unsubscribe hasn't run yet because the mutex is held.
        // Complete the WS resubscription.
        resubResolve();
        await flushPromises();
        await unsubPromise;

        // refCount was 1 at reconnect time; after resubscribe completes
        // the queued unsubscribe drops it to 0 and starts the grace timer.
        const mockUnsub = jest.fn();
        mocks.getSubscriptionsByChannel.mockReturnValue([
          { unsubscribe: mockUnsub },
        ]);

        jest.advanceTimersByTime(3000);
        await completeAsyncOperations();

        // The grace-period unsubscribe fires cleanly — no orphaned subscription.
        expect(mockUnsub).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ===========================================================================
  // Destroy
  // ===========================================================================

  describe('destroy', () => {
    it('should clear grace-period timers and remove channel callback', async () => {
      await withService(async ({ service, mocks }) => {
        const mockUnsub = jest.fn();
        mocks.getSubscriptionsByChannel.mockReturnValue([
          { unsubscribe: mockUnsub },
        ]);

        await service.subscribe(SUB_OPTS);
        await service.unsubscribe(SUB_OPTS);

        // Grace timer is running — destroy should clear it
        service.destroy();

        jest.advanceTimersByTime(5000);
        await completeAsyncOperations();

        // Timer was cleared so the actual unsubscribe should NOT have fired
        expect(mockUnsub).not.toHaveBeenCalled();

        expect(mocks.removeChannelCallback).toHaveBeenCalledWith(
          'system-notifications.v1.market-data.v1',
        );
      });
    });
  });
});
