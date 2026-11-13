import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { flushPromises } from '../../../../tests/vitest/helpers.js';
import type { BackendWebSocketServiceMethodActions } from './BackendWebSocketService-method-action-types.js';
import type {
  BackendWebSocketServiceConnectionStateChangedEvent,
  ServerNotificationMessage,
} from './BackendWebSocketService.js';
import { WebSocketState } from './BackendWebSocketService.js';
import { ChannelSubscriptionManager } from './ChannelSubscriptionManager.js';
import type { ChannelSubscriptionManagerOptions } from './ChannelSubscriptionManager.js';

// =============================================================================
// Test Helpers
// =============================================================================

type RootMessenger = Messenger<
  MockAnyNamespace,
  BackendWebSocketServiceMethodActions,
  BackendWebSocketServiceConnectionStateChangedEvent
>;

type TestMessenger = Messenger<
  'Test',
  BackendWebSocketServiceMethodActions,
  BackendWebSocketServiceConnectionStateChangedEvent,
  RootMessenger
>;

const completeAsyncOperations = async (timeoutMs = 0): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await flushPromises();
  }
  if (timeoutMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  }
  await flushPromises();
};

const CHANNEL_TYPE = 'test.v1';
const CHANNEL = 'test.v1.chan-a';
const OTHER_CHANNEL = 'test.v1.chan-b';
const SYSTEM_CHANNEL = 'system-notifications.v1.test.v1';

const BASE_CONNECTION_INFO = {
  url: 'ws://test',
  reconnectAttempts: 0,
  timeout: 10000,
  reconnectDelay: 500,
  maxReconnectDelay: 5000,
  requestTimeout: 30000,
};

const getMessenger = (): {
  rootMessenger: RootMessenger;
  messenger: TestMessenger;
  mocks: {
    connect: Mock;
    subscribe: Mock;
    channelHasSubscription: Mock;
    getSubscriptionsByChannel: Mock;
    forceReconnection: Mock;
    addChannelCallback: Mock;
    removeChannelCallback: Mock;
  };
} => {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const messenger: TestMessenger = new Messenger({
    namespace: 'Test',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: [
      'BackendWebSocketService:connect',
      'BackendWebSocketService:forceReconnection',
      'BackendWebSocketService:subscribe',
      'BackendWebSocketService:channelHasSubscription',
      'BackendWebSocketService:getSubscriptionsByChannel',
      'BackendWebSocketService:addChannelCallback',
      'BackendWebSocketService:removeChannelCallback',
    ],
    events: ['BackendWebSocketService:connectionStateChanged'],
    messenger,
  });

  const mocks = {
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    channelHasSubscription: vi.fn().mockReturnValue(false),
    getSubscriptionsByChannel: vi.fn().mockReturnValue([]),
    forceReconnection: vi.fn().mockResolvedValue(undefined),
    addChannelCallback: vi.fn(),
    removeChannelCallback: vi.fn(),
  };

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
    'BackendWebSocketService:addChannelCallback',
    mocks.addChannelCallback,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:removeChannelCallback',
    mocks.removeChannelCallback,
  );

  return { rootMessenger, messenger, mocks };
};

type Setup = ReturnType<typeof getMessenger> & {
  manager: ChannelSubscriptionManager;
  options: {
    onMessage: Mock;
    onSubscriptionError: Mock;
    onSystemNotification: Mock;
    onConnectionStateChange: Mock;
  };
};

const getManager = (
  overrides: Partial<ChannelSubscriptionManagerOptions> = {},
): Setup => {
  const base = getMessenger();
  const options = {
    onMessage: vi.fn(),
    onSubscriptionError: vi.fn(),
    onSystemNotification: vi.fn(),
    onConnectionStateChange: vi.fn(),
  };
  const manager = new ChannelSubscriptionManager({
    messenger: base.messenger,
    channelType: CHANNEL_TYPE,
    onMessage: options.onMessage,
    onSubscriptionError: options.onSubscriptionError,
    systemNotificationsChannel: SYSTEM_CHANNEL,
    onSystemNotification: options.onSystemNotification,
    onConnectionStateChange: options.onConnectionStateChange,
    ...overrides,
  });
  return { ...base, manager, options };
};

const getSubscribeCallback = (
  mocks: Setup['mocks'],
): ((notification: ServerNotificationMessage) => void) => {
  const call = mocks.subscribe.mock.calls.at(-1);
  if (!call) {
    throw new Error('subscribe was not called');
  }
  return (call[0] as { callback: (n: ServerNotificationMessage) => void })
    .callback;
};

// =============================================================================
// Tests
// =============================================================================

describe('ChannelSubscriptionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('subscribe', () => {
    it('connects and creates a WebSocket subscription for a new channel', async () => {
      const { manager, mocks } = getManager();

      await manager.subscribe(CHANNEL);

      expect(mocks.connect).toHaveBeenCalledTimes(1);
      expect(mocks.subscribe).toHaveBeenCalledWith({
        channels: [CHANNEL],
        channelType: CHANNEL_TYPE,
        callback: expect.any(Function),
      });
    });

    it('reports channels with a live reference count', async () => {
      const { manager } = getManager();

      expect(manager.getActiveChannels()).toStrictEqual([]);

      await manager.subscribe(CHANNEL);
      await manager.subscribe(CHANNEL);

      expect(manager.getActiveChannels()).toStrictEqual([CHANNEL]);

      await manager.unsubscribe(CHANNEL);

      expect(manager.getActiveChannels()).toStrictEqual([CHANNEL]);

      await manager.unsubscribe(CHANNEL);

      expect(manager.getActiveChannels()).toStrictEqual([]);
    });

    it('increments refCount on duplicate subscribe without WS traffic', async () => {
      const { manager, mocks } = getManager();
      await manager.subscribe(CHANNEL);
      mocks.subscribe.mockClear();
      mocks.connect.mockClear();

      await manager.subscribe(CHANNEL);

      expect(mocks.connect).not.toHaveBeenCalled();
      expect(mocks.subscribe).not.toHaveBeenCalled();
    });

    it('sends a deferred subscribe once the socket connects', async () => {
      const { manager, mocks, options, rootMessenger } = getManager();
      mocks.subscribe.mockRejectedValueOnce(
        new Error(
          'Cannot create subscription(s) test.v1.chan-a: WebSocket is DISCONNECTED',
        ),
      );

      await manager.subscribe(CHANNEL);

      expect(options.onSubscriptionError).not.toHaveBeenCalled();
      expect(mocks.subscribe).toHaveBeenCalledTimes(1);

      mocks.subscribe.mockResolvedValue(undefined);
      mocks.subscribe.mockClear();
      rootMessenger.publish('BackendWebSocketService:connectionStateChanged', {
        ...BASE_CONNECTION_INFO,
        state: WebSocketState.CONNECTED,
      });
      await completeAsyncOperations();

      expect(mocks.subscribe).toHaveBeenCalledWith({
        channels: [CHANNEL],
        channelType: CHANNEL_TYPE,
        callback: expect.any(Function),
      });
    });

    it('sends a subscribe that failed before sign-in once the socket connects', async () => {
      const { manager, mocks, options, rootMessenger } = getManager();
      mocks.subscribe.mockRejectedValueOnce(
        new Error('Authentication required: user not signed in'),
      );

      await manager.subscribe(CHANNEL);

      expect(options.onSubscriptionError).not.toHaveBeenCalled();

      mocks.subscribe.mockResolvedValue(undefined);
      mocks.subscribe.mockClear();
      rootMessenger.publish('BackendWebSocketService:connectionStateChanged', {
        ...BASE_CONNECTION_INFO,
        state: WebSocketState.CONNECTED,
      });
      await completeAsyncOperations();

      expect(mocks.subscribe).toHaveBeenCalledWith({
        channels: [CHANNEL],
        channelType: CHANNEL_TYPE,
        callback: expect.any(Function),
      });
    });

    it('invokes onSubscriptionError when subscribe fails', async () => {
      const { manager, mocks, options } = getManager();
      mocks.connect.mockRejectedValueOnce(new Error('connection failed'));

      await manager.subscribe(CHANNEL);

      expect(options.onSubscriptionError).toHaveBeenCalledWith(
        CHANNEL,
        expect.stringContaining('connection failed'),
        'subscribe',
      );
    });
  });

  describe('message delivery', () => {
    it('forwards notifications on the channel to onMessage', async () => {
      const { manager, mocks, options } = getManager();
      await manager.subscribe(CHANNEL);

      const callback = getSubscribeCallback(mocks);
      const notification = {
        event: 'data',
        channel: CHANNEL,
        data: { hello: 'world' },
        timestamp: 123,
      } as ServerNotificationMessage;
      callback(notification);

      expect(options.onMessage).toHaveBeenCalledWith(CHANNEL, notification);
    });
  });

  describe('unsubscribe', () => {
    it('unsubscribes every channel in one frame', async () => {
      const { manager, mocks } = getManager();
      const mockUnsub = vi.fn().mockResolvedValue(undefined);
      mocks.getSubscriptionsByChannel.mockReturnValue([
        {
          subscriptionId: 'sub-1',
          channels: [CHANNEL, OTHER_CHANNEL],
          unsubscribe: mockUnsub,
        },
      ]);

      await manager.subscribe([CHANNEL, OTHER_CHANNEL]);
      await manager.unsubscribe([CHANNEL, OTHER_CHANNEL]);

      expect(mockUnsub).not.toHaveBeenCalled();

      vi.advanceTimersByTime(3000);
      await completeAsyncOperations();

      expect(mockUnsub).toHaveBeenCalledTimes(1);
      expect(mockUnsub).toHaveBeenCalledWith(undefined, [
        CHANNEL,
        OTHER_CHANNEL,
      ]);
    });

    it('unsubscribes on the server after the grace period', async () => {
      const { manager, mocks } = getManager();
      const mockUnsub = vi.fn().mockResolvedValue(undefined);
      mocks.getSubscriptionsByChannel.mockReturnValue([
        { unsubscribe: mockUnsub },
      ]);

      await manager.subscribe(CHANNEL);
      await manager.unsubscribe(CHANNEL);

      expect(mockUnsub).not.toHaveBeenCalled();

      vi.advanceTimersByTime(3000);
      await completeAsyncOperations();

      expect(mocks.getSubscriptionsByChannel).toHaveBeenCalledWith(CHANNEL);
      expect(mockUnsub).toHaveBeenCalledTimes(1);
    });

    it('reuses the subscription if a new subscriber arrives during the grace period', async () => {
      const { manager, mocks } = getManager();
      const mockUnsub = vi.fn().mockResolvedValue(undefined);
      mocks.getSubscriptionsByChannel.mockReturnValue([
        { unsubscribe: mockUnsub },
      ]);
      mocks.channelHasSubscription.mockReturnValue(true);

      await manager.subscribe(CHANNEL);
      await manager.unsubscribe(CHANNEL);
      await manager.subscribe(CHANNEL);

      vi.advanceTimersByTime(3000);
      await completeAsyncOperations();

      expect(mockUnsub).not.toHaveBeenCalled();
    });

    it('forces a reconnection after unsubscribe retries are exhausted', async () => {
      const { manager, mocks } = getManager();
      mocks.getSubscriptionsByChannel.mockImplementation(() => {
        throw new Error('unsubscribe failed');
      });

      await manager.subscribe(CHANNEL);
      await manager.unsubscribe(CHANNEL);

      vi.advanceTimersByTime(3000);
      await completeAsyncOperations();
      vi.advanceTimersByTime(1000);
      await completeAsyncOperations();
      vi.advanceTimersByTime(2000);
      await completeAsyncOperations();
      vi.advanceTimersByTime(4000);
      await completeAsyncOperations();

      expect(mocks.forceReconnection).toHaveBeenCalledTimes(1);
    });

    it('returns when unsubscribe is given no channels', async () => {
      const { manager, mocks } = getManager();

      await manager.unsubscribe([]);

      expect(mocks.getSubscriptionsByChannel).not.toHaveBeenCalled();
    });

    it('drops a channel after the grace period when the server has no subscription', async () => {
      const { manager, mocks, options } = getManager();

      await manager.subscribe(CHANNEL);
      await manager.unsubscribe(CHANNEL);
      vi.advanceTimersByTime(3000);
      await completeAsyncOperations();

      expect(mocks.getSubscriptionsByChannel).toHaveBeenCalledWith(CHANNEL);
      expect(options.onSubscriptionError).not.toHaveBeenCalled();
      expect(manager.getActiveChannels()).toStrictEqual([]);
    });

    it('reports a channel whose subscription was already handled in the batch', async () => {
      const { manager, mocks, options } = getManager();
      const mockUnsub = vi.fn().mockResolvedValue(undefined);
      mocks.getSubscriptionsByChannel.mockImplementation((channel: string) => [
        {
          subscriptionId: 'sub-1',
          channels: [channel],
          unsubscribe: mockUnsub,
        },
      ]);

      await manager.subscribe([CHANNEL, OTHER_CHANNEL]);
      await manager.unsubscribe([CHANNEL, OTHER_CHANNEL]);
      vi.advanceTimersByTime(3000);
      await completeAsyncOperations();

      expect(mockUnsub).toHaveBeenCalledTimes(1);
      expect(options.onSubscriptionError).toHaveBeenCalledWith(
        OTHER_CHANNEL,
        'channel was not on a returned subscription',
        'unsubscribe',
      );
    });

    it('reports a channel missing from the returned subscription', async () => {
      const { manager, mocks, options } = getManager();
      const mockUnsub = vi.fn().mockResolvedValue(undefined);
      mocks.getSubscriptionsByChannel.mockReturnValue([
        {
          subscriptionId: 'sub-other',
          channels: ['test.v1.not-pending'],
          unsubscribe: mockUnsub,
        },
      ]);

      await manager.subscribe(CHANNEL);
      await manager.unsubscribe(CHANNEL);
      vi.advanceTimersByTime(3000);
      await completeAsyncOperations();

      expect(mockUnsub).not.toHaveBeenCalled();
      expect(options.onSubscriptionError).toHaveBeenCalledWith(
        CHANNEL,
        'channel was not on a returned subscription',
        'unsubscribe',
      );
    });

    it('leaves a channel up when its old grace timer fires after it was opened again', async () => {
      const { manager, mocks } = getManager();

      await manager.subscribe(CHANNEL);
      await manager.unsubscribe(CHANNEL);
      mocks.connect.mockRejectedValueOnce(
        new Error('WebSocket is DISCONNECTED'),
      );
      await manager.ensureSubscribed(CHANNEL);
      vi.advanceTimersByTime(3000);
      await completeAsyncOperations();

      expect(manager.getActiveChannels()).toStrictEqual([CHANNEL]);
      expect(mocks.getSubscriptionsByChannel).not.toHaveBeenCalled();
    });

    it('ignores an error thrown while reporting an unsubscribe failure', async () => {
      const { manager, mocks, options } = getManager();
      mocks.getSubscriptionsByChannel.mockImplementation(() => {
        throw new Error('unsubscribe failed');
      });
      options.onSubscriptionError.mockImplementation(() => {
        throw new Error('listener failed');
      });

      await manager.subscribe(CHANNEL);
      await manager.unsubscribe(CHANNEL);
      vi.advanceTimersByTime(3000);
      await completeAsyncOperations();

      expect(mocks.forceReconnection).not.toHaveBeenCalled();
    });
  });

  describe('reconnect', () => {
    it('resubscribes active channels when the socket reconnects', async () => {
      const { manager, mocks, rootMessenger } = getManager();
      await manager.subscribe(CHANNEL);
      mocks.subscribe.mockClear();
      mocks.channelHasSubscription.mockReturnValue(false);

      rootMessenger.publish('BackendWebSocketService:connectionStateChanged', {
        ...BASE_CONNECTION_INFO,
        state: WebSocketState.CONNECTED,
      });
      await completeAsyncOperations();

      expect(mocks.subscribe).toHaveBeenCalledWith({
        channels: [CHANNEL],
        channelType: CHANNEL_TYPE,
        callback: expect.any(Function),
      });
    });

    it('invokes onConnectionStateChange for every state change', async () => {
      const { options, rootMessenger } = getManager();

      rootMessenger.publish('BackendWebSocketService:connectionStateChanged', {
        ...BASE_CONNECTION_INFO,
        state: WebSocketState.DISCONNECTED,
      });
      await completeAsyncOperations();

      expect(options.onConnectionStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ state: WebSocketState.DISCONNECTED }),
      );
    });
  });

  describe('system notifications', () => {
    it('registers the system-notifications callback on init and routes messages', () => {
      const { manager, mocks, options } = getManager();

      manager.init();

      expect(mocks.addChannelCallback).toHaveBeenCalledWith({
        channelName: SYSTEM_CHANNEL,
        callback: expect.any(Function),
      });

      const call = mocks.addChannelCallback.mock.calls[0][0] as {
        callback: (n: ServerNotificationMessage) => void;
      };
      const notification = {
        event: 'data',
        channel: SYSTEM_CHANNEL,
        data: { status: 'up' },
        timestamp: 1,
      } as ServerNotificationMessage;
      call.callback(notification);

      expect(options.onSystemNotification).toHaveBeenCalledWith(notification);
    });

    it('does not register or remove a callback when no system channel is configured', () => {
      const { manager, mocks } = getManager({
        systemNotificationsChannel: undefined,
        onSystemNotification: undefined,
      });

      manager.init();
      manager.destroy();

      expect(mocks.addChannelCallback).not.toHaveBeenCalled();
      expect(mocks.removeChannelCallback).not.toHaveBeenCalled();
    });

    it('removes the system-notifications callback on destroy', () => {
      const { manager, mocks } = getManager();

      manager.destroy();

      expect(mocks.removeChannelCallback).toHaveBeenCalledWith(SYSTEM_CHANNEL);
    });
  });

  describe('flush', () => {
    it('flushes other grace-period channels before subscribing a new one', async () => {
      const { manager, mocks } = getManager();
      const mockUnsub = vi.fn().mockResolvedValue(undefined);
      mocks.getSubscriptionsByChannel.mockReturnValue([
        { unsubscribe: mockUnsub },
      ]);

      await manager.subscribe(CHANNEL);
      await manager.unsubscribe(CHANNEL);
      // CHANNEL is now in its grace period; subscribing OTHER_CHANNEL flushes it.
      await manager.subscribe(OTHER_CHANNEL);

      expect(mocks.getSubscriptionsByChannel).toHaveBeenCalledWith(CHANNEL);
      expect(mockUnsub).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureSubscribed', () => {
    it('does nothing when given no channels', async () => {
      const { manager, mocks } = getManager();

      await manager.subscribe([]);
      await manager.ensureSubscribedChannels([]);

      expect(mocks.connect).not.toHaveBeenCalled();
    });

    it('returns when the server already has the channel', async () => {
      const { manager, mocks } = getManager();
      mocks.channelHasSubscription.mockReturnValue(true);

      await manager.ensureSubscribed(CHANNEL);

      expect(mocks.connect).not.toHaveBeenCalled();
      expect(mocks.subscribe).not.toHaveBeenCalled();
    });

    it('stops when the server gains the channel during connect', async () => {
      const { manager, mocks } = getManager();
      const gainOnConnect = async (): Promise<void> => {
        mocks.channelHasSubscription.mockReturnValue(true);
      };

      mocks.channelHasSubscription.mockReturnValue(false);
      mocks.connect.mockImplementation(gainOnConnect);
      await manager.ensureSubscribed(CHANNEL);

      mocks.channelHasSubscription.mockReturnValue(false);
      mocks.connect.mockImplementation(gainOnConnect);
      await manager.ensureSubscribedChannels([CHANNEL, CHANNEL]);

      expect(mocks.subscribe).not.toHaveBeenCalled();
    });

    it('opens a tracked channel and keeps one that is waiting for the socket', async () => {
      const { manager, mocks, options } = getManager();
      mocks.channelHasSubscription.mockReturnValue(false);

      await manager.ensureSubscribed(CHANNEL);
      await manager.unsubscribe(CHANNEL);
      await manager.ensureSubscribed(CHANNEL);

      mocks.connect.mockRejectedValueOnce(
        new Error('WebSocket is DISCONNECTED'),
      );
      await manager.ensureSubscribed(OTHER_CHANNEL);

      mocks.connect.mockRejectedValueOnce(new Error('not signed in'));
      await manager.ensureSubscribed(CHANNEL);

      mocks.connect.mockRejectedValueOnce(new Error('nope'));
      await expect(manager.ensureSubscribed('test.v1.chan-c')).rejects.toThrow(
        'nope',
      );

      expect(options.onSubscriptionError).toHaveBeenCalledWith(
        'test.v1.chan-c',
        expect.stringContaining('nope'),
        'subscribe',
      );
      expect(mocks.subscribe).toHaveBeenCalledWith({
        channels: [CHANNEL],
        channelType: CHANNEL_TYPE,
        callback: expect.any(Function),
      });
    });

    it('keeps the reference count when the channel is already tracked', async () => {
      const { manager, mocks } = getManager();
      await manager.subscribe(CHANNEL);
      mocks.subscribe.mockClear();
      mocks.channelHasSubscription.mockReturnValue(false);

      await manager.ensureSubscribed(CHANNEL);

      expect(mocks.subscribe).toHaveBeenCalledTimes(1);
      expect(manager.getActiveChannels()).toStrictEqual([CHANNEL]);
    });

    it('clears a pending unsubscribe retry when the channel is opened again', async () => {
      const { manager, mocks } = getManager({ unsubRetryDelaysMs: [60_000] });
      mocks.getSubscriptionsByChannel.mockImplementation(() => {
        throw new Error('unsubscribe failed');
      });

      await manager.subscribe(CHANNEL);
      await manager.unsubscribe(CHANNEL);
      vi.advanceTimersByTime(3000);
      await completeAsyncOperations();

      mocks.channelHasSubscription.mockReturnValue(false);
      await manager.ensureSubscribed(CHANNEL);
      vi.advanceTimersByTime(60_000);
      await completeAsyncOperations();

      expect(mocks.forceReconnection).not.toHaveBeenCalled();
      expect(manager.getActiveChannels()).toStrictEqual([CHANNEL]);
    });
  });

  describe('batch subscribe results', () => {
    it('drops a channel the gateway rejects and routes each notification', async () => {
      const { manager, mocks, options } = getManager();
      mocks.subscribe.mockResolvedValueOnce({
        failedChannels: [OTHER_CHANNEL],
      });

      await manager.subscribe([CHANNEL, OTHER_CHANNEL]);

      expect(options.onSubscriptionError).toHaveBeenCalledWith(
        OTHER_CHANNEL,
        `Request failed: ${OTHER_CHANNEL}`,
        'subscribe',
      );

      const notification = {
        event: 'data',
        channel: CHANNEL,
        data: { price: 1 },
        timestamp: 4,
      } as ServerNotificationMessage;
      getSubscribeCallback(mocks)(notification);

      expect(options.onMessage).toHaveBeenCalledWith(CHANNEL, notification);
    });

    it('resubscribes active channels when asked', async () => {
      const { manager, mocks } = getManager();
      await manager.subscribe(CHANNEL);
      mocks.subscribe.mockClear();
      mocks.channelHasSubscription.mockReturnValue(false);

      await manager.resubscribe();

      expect(mocks.subscribe).toHaveBeenCalledWith({
        channels: [CHANNEL],
        channelType: CHANNEL_TYPE,
        callback: expect.any(Function),
      });
    });

    it('keeps a channel when connect fails with a non-Error socket message', async () => {
      const { manager, mocks, options } = getManager();
      mocks.connect.mockRejectedValueOnce('WebSocket is DISCONNECTED');

      await manager.subscribe(CHANNEL);

      expect(options.onSubscriptionError).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe retry', () => {
    it('leaves the socket up when retries are exhausted and reconnect is disabled', async () => {
      const { manager, mocks } = getManager({
        forceReconnectOnUnsubscribeFailure: false,
      });
      mocks.getSubscriptionsByChannel.mockImplementation(() => {
        throw new Error('unsubscribe failed');
      });

      await manager.subscribe(CHANNEL);
      await manager.unsubscribe(CHANNEL);

      vi.advanceTimersByTime(3000);
      await completeAsyncOperations();
      vi.advanceTimersByTime(1000);
      await completeAsyncOperations();
      vi.advanceTimersByTime(2000);
      await completeAsyncOperations();
      vi.advanceTimersByTime(4000);
      await completeAsyncOperations();

      expect(mocks.forceReconnection).not.toHaveBeenCalled();
    });

    it('does not force a reconnection when teardown aborts the retry', async () => {
      const { manager, mocks } = getManager();
      mocks.getSubscriptionsByChannel.mockImplementation(() => {
        throw new Error('unsubscribe failed');
      });

      await manager.subscribe(CHANNEL);
      await manager.unsubscribe(CHANNEL);
      vi.advanceTimersByTime(3000);
      await completeAsyncOperations();

      manager.destroy();
      vi.advanceTimersByTime(10000);
      await completeAsyncOperations();

      expect(mocks.forceReconnection).not.toHaveBeenCalled();
    });

    it('skips an unsubscribe retry when the channel is subscribed again', async () => {
      const { manager, mocks } = getManager({ unsubRetryDelaysMs: [5_000] });
      mocks.getSubscriptionsByChannel.mockImplementation(() => {
        throw new Error('unsubscribe failed');
      });

      await manager.subscribe(CHANNEL);
      await manager.unsubscribe(CHANNEL);
      vi.advanceTimersByTime(3000);
      await completeAsyncOperations();

      let releaseConnect: () => void = () => undefined;
      mocks.connect.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseConnect = resolve;
          }),
      );

      const ensureOther = manager.ensureSubscribed(OTHER_CHANNEL);
      await completeAsyncOperations();
      const resubscribe = manager.subscribe(CHANNEL);
      await completeAsyncOperations();
      vi.advanceTimersByTime(5_000);
      await completeAsyncOperations();
      releaseConnect();
      await ensureOther;
      await resubscribe;
      await completeAsyncOperations();

      expect(manager.getActiveChannels()).toStrictEqual([
        CHANNEL,
        OTHER_CHANNEL,
      ]);
      expect(mocks.forceReconnection).not.toHaveBeenCalled();
    });

    it('stops an in-flight unsubscribe retry when the manager is destroyed', async () => {
      const { manager, mocks } = getManager({ unsubRetryDelaysMs: [0] });
      let rejectUnsub: (error: Error) => void = () => undefined;
      mocks.getSubscriptionsByChannel
        .mockImplementationOnce((): never => {
          throw new Error('unsubscribe failed');
        })
        .mockImplementation(() => [
          {
            channels: [CHANNEL],
            unsubscribe: (): Promise<void> =>
              new Promise((_resolve, reject) => {
                rejectUnsub = reject;
              }),
          },
        ]);

      await manager.subscribe(CHANNEL);
      await manager.unsubscribe(CHANNEL);
      vi.advanceTimersByTime(3000);
      await completeAsyncOperations();
      vi.advanceTimersByTime(0);
      await completeAsyncOperations();

      expect(mocks.getSubscriptionsByChannel).toHaveBeenCalledTimes(2);

      manager.destroy();
      rejectUnsub(new Error('closed'));
      await completeAsyncOperations();

      expect(mocks.forceReconnection).not.toHaveBeenCalled();
    });
  });
});
