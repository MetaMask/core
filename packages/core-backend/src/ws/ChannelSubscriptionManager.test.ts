import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { flushPromises } from '../../../../tests/vitest/helpers.js';
import type { BackendWebSocketServiceMethodActions } from './BackendWebSocketService-method-action-types.js';
import type {
  BackendWebSocketServiceConnectionStateChangedEvent,
  ServerNotificationMessage,
  WebSocketConnectionInfo,
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
      expect(mocks.channelHasSubscription).toHaveBeenCalledWith(CHANNEL);
      expect(mocks.subscribe).toHaveBeenCalledWith({
        channels: [CHANNEL],
        channelType: CHANNEL_TYPE,
        callback: expect.any(Function),
      });
    });

    it('skips WS subscribe if the channel already has a subscription', async () => {
      const { manager, mocks } = getManager();
      mocks.channelHasSubscription.mockReturnValue(true);

      await manager.subscribe(CHANNEL);

      expect(mocks.subscribe).not.toHaveBeenCalled();
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
      } as WebSocketConnectionInfo);
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
      } as WebSocketConnectionInfo);
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
});
