import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { flushPromises } from '../../../../../tests/vitest/helpers.js';
import type { ServerNotificationMessage } from '../BackendWebSocketService.js';
import { WebSocketState } from '../BackendWebSocketService.js';
import { LaunchpadTokenDetailsService } from './LaunchpadTokenDetailsService.js';
import type { LaunchpadTokenDetailsServiceMessenger } from './LaunchpadTokenDetailsService.js';
import type { LaunchpadTokenDetailsSubscriptionOptions } from './types.js';

// =============================================================================
// Test Helpers
// =============================================================================

type AllActions = MessengerActions<LaunchpadTokenDetailsServiceMessenger>;
type AllEvents = MessengerEvents<LaunchpadTokenDetailsServiceMessenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const completeAsyncOperations = async (timeoutMs = 0): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await flushPromises();
  }
  if (timeoutMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  }
  await flushPromises();
};

const getMessenger = (): {
  rootMessenger: RootMessenger;
  messenger: LaunchpadTokenDetailsServiceMessenger;
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
  const messenger: LaunchpadTokenDetailsServiceMessenger = new Messenger({
    namespace: 'LaunchpadTokenDetailsService',
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

type WithServiceCallback<R> = (payload: {
  service: LaunchpadTokenDetailsService;
  messenger: LaunchpadTokenDetailsServiceMessenger;
  rootMessenger: RootMessenger;
  mocks: ReturnType<typeof getMessenger>['mocks'];
}) => Promise<R> | R;

async function withService<R>(fn: WithServiceCallback<R>): Promise<R> {
  const setup = getMessenger();
  const service = new LaunchpadTokenDetailsService({
    messenger: setup.messenger,
  });
  service.init();

  try {
    return await fn({
      service,
      messenger: setup.messenger,
      rootMessenger: setup.rootMessenger,
      mocks: setup.mocks,
    });
  } finally {
    service.destroy();
  }
}

const getSubscribeCallback = (mocks: {
  subscribe: Mock;
}): ((notification: ServerNotificationMessage) => void) => {
  const call = mocks.subscribe.mock.calls.at(-1);
  if (!call) {
    throw new Error('subscribe was not called');
  }
  return (call[0] as { callback: (n: ServerNotificationMessage) => void })
    .callback;
};

const getSystemNotificationCallback = (mocks: {
  addChannelCallback: Mock;
}): ((notification: ServerNotificationMessage) => void) => {
  const call = mocks.addChannelCallback.mock.calls.find(
    (c: unknown[]) =>
      c[0] &&
      typeof c[0] === 'object' &&
      'channelName' in c[0] &&
      (c[0] as { channelName: string }).channelName ===
        'system-notifications.v1.launchpad-tokens.v1',
  );
  if (!call) {
    throw new Error('system notification callback not registered');
  }
  return (call[0] as { callback: (n: ServerNotificationMessage) => void })
    .callback;
};

const SUB_OPTS: LaunchpadTokenDetailsSubscriptionOptions = {
  assetId: 'eip155:8453/erc20:0xaaa',
};

const EXPECTED_CHANNEL = 'launchpad-tokens.v1.eip155:8453/erc20:0xaaa';

// =============================================================================
// Tests
// =============================================================================

describe('LaunchpadTokenDetailsService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('registers the system-notifications callback on init', async () => {
      await withService(async ({ service, mocks }) => {
        expect(service).toBeInstanceOf(LaunchpadTokenDetailsService);
        expect(service.name).toBe('LaunchpadTokenDetailsService');
        expect(mocks.addChannelCallback).toHaveBeenCalledWith({
          channelName: 'system-notifications.v1.launchpad-tokens.v1',
          callback: expect.any(Function),
        });
      });
    });
  });

  describe('subscribe', () => {
    it('subscribes to the token per-asset channel', async () => {
      await withService(async ({ service, mocks }) => {
        await service.subscribe(SUB_OPTS);

        expect(mocks.connect).toHaveBeenCalledTimes(1);
        expect(mocks.subscribe).toHaveBeenCalledWith({
          channels: [EXPECTED_CHANNEL],
          channelType: 'launchpad-tokens.v1',
          callback: expect.any(Function),
        });
      });
    });

    it('publishes subscriptionError when subscribe fails', async () => {
      await withService(async ({ service, mocks, messenger }) => {
        mocks.connect.mockRejectedValueOnce(new Error('connection failed'));
        const errorListener = vi.fn();
        messenger.subscribe(
          'LaunchpadTokenDetailsService:subscriptionError',
          errorListener,
        );

        await service.subscribe(SUB_OPTS);

        expect(errorListener).toHaveBeenCalledWith({
          channel: EXPECTED_CHANNEL,
          error: expect.stringContaining('connection failed'),
          operation: 'subscribe',
        });
      });
    });
  });

  describe('token updates', () => {
    it('publishes tokenUpdated with the normalized batch', async () => {
      await withService(async ({ service, mocks, messenger }) => {
        await service.subscribe(SUB_OPTS);
        const updateListener = vi.fn();
        messenger.subscribe(
          'LaunchpadTokenDetailsService:tokenUpdated',
          updateListener,
        );

        const callback = getSubscribeCallback(mocks);
        callback({
          event: 'data',
          channel: EXPECTED_CHANNEL,
          data: [
            { evt: 'created', ts: 1, a: SUB_OPTS.assetId, n: 'AlphaDog' },
            { evt: 'stats', ts: 2, a: SUB_OPTS.assetId, mc: '21000' },
          ],
          timestamp: 2,
        } as unknown as ServerNotificationMessage);

        expect(updateListener).toHaveBeenCalledWith({
          channel: EXPECTED_CHANNEL,
          events: [
            expect.objectContaining({ eventType: 'created', name: 'AlphaDog' }),
            expect.objectContaining({ eventType: 'stats', marketCap: '21000' }),
          ],
        });
      });
    });

    it('does not publish tokenUpdated for an empty or invalid batch', async () => {
      await withService(async ({ service, mocks, messenger }) => {
        await service.subscribe(SUB_OPTS);
        const updateListener = vi.fn();
        messenger.subscribe(
          'LaunchpadTokenDetailsService:tokenUpdated',
          updateListener,
        );

        const callback = getSubscribeCallback(mocks);
        callback({
          event: 'data',
          channel: EXPECTED_CHANNEL,
          data: [],
          timestamp: 1,
        } as unknown as ServerNotificationMessage);
        callback({
          event: 'data',
          channel: EXPECTED_CHANNEL,
          data: { not: 'an array' },
          timestamp: 2,
        } as unknown as ServerNotificationMessage);

        expect(updateListener).not.toHaveBeenCalled();
      });
    });
  });

  describe('unsubscribe', () => {
    it('unsubscribes on the server after the grace period', async () => {
      await withService(async ({ service, mocks }) => {
        const mockUnsub = vi.fn().mockResolvedValue(undefined);
        mocks.getSubscriptionsByChannel.mockReturnValue([
          { unsubscribe: mockUnsub },
        ]);

        await service.subscribe(SUB_OPTS);
        await service.unsubscribe(SUB_OPTS);

        vi.advanceTimersByTime(3000);
        await completeAsyncOperations();

        expect(mocks.getSubscriptionsByChannel).toHaveBeenCalledWith(
          EXPECTED_CHANNEL,
        );
        expect(mockUnsub).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('system notifications', () => {
    it('publishes statusChanged from a system notification', async () => {
      await withService(async ({ mocks, messenger }) => {
        const statusListener = vi.fn();
        messenger.subscribe(
          'LaunchpadTokenDetailsService:statusChanged',
          statusListener,
        );

        const callback = getSystemNotificationCallback(mocks);
        callback({
          event: 'data',
          channel: 'system-notifications.v1.launchpad-tokens.v1',
          data: { chainIds: ['eip155:8453'], status: 'down' },
          timestamp: 42,
        } as unknown as ServerNotificationMessage);

        expect(statusListener).toHaveBeenCalledWith({
          chainIds: ['eip155:8453'],
          status: 'down',
          timestamp: 42,
        });
      });
    });

    it('throws on invalid system notification data', async () => {
      await withService(async ({ mocks }) => {
        const callback = getSystemNotificationCallback(mocks);
        expect(() =>
          callback({
            event: 'data',
            channel: 'system-notifications.v1.launchpad-tokens.v1',
            data: { status: 'down' },
            timestamp: 1,
          } as unknown as ServerNotificationMessage),
        ).toThrow('Invalid system notification data');
      });
    });

    it('ignores non-disconnect connection state changes', async () => {
      await withService(async ({ messenger, rootMessenger }) => {
        const statusListener = vi.fn();
        messenger.subscribe(
          'LaunchpadTokenDetailsService:statusChanged',
          statusListener,
        );

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

        expect(statusListener).not.toHaveBeenCalled();
      });
    });

    it('does not publish on disconnect when no chains are tracked', async () => {
      await withService(async ({ messenger, rootMessenger }) => {
        const statusListener = vi.fn();
        messenger.subscribe(
          'LaunchpadTokenDetailsService:statusChanged',
          statusListener,
        );

        rootMessenger.publish(
          'BackendWebSocketService:connectionStateChanged',
          {
            state: WebSocketState.DISCONNECTED,
            url: 'ws://test',
            reconnectAttempts: 0,
            timeout: 10000,
            reconnectDelay: 500,
            maxReconnectDelay: 5000,
            requestTimeout: 30000,
          },
        );
        await completeAsyncOperations();

        expect(statusListener).not.toHaveBeenCalled();
      });
    });

    it('marks tracked chains down on disconnect', async () => {
      await withService(async ({ mocks, messenger, rootMessenger }) => {
        const statusListener = vi.fn();
        messenger.subscribe(
          'LaunchpadTokenDetailsService:statusChanged',
          statusListener,
        );

        const callback = getSystemNotificationCallback(mocks);
        callback({
          event: 'data',
          channel: 'system-notifications.v1.launchpad-tokens.v1',
          data: { chainIds: ['eip155:8453'], status: 'up' },
          timestamp: 1,
        } as unknown as ServerNotificationMessage);
        statusListener.mockClear();

        rootMessenger.publish(
          'BackendWebSocketService:connectionStateChanged',
          {
            state: WebSocketState.DISCONNECTED,
            url: 'ws://test',
            reconnectAttempts: 0,
            timeout: 10000,
            reconnectDelay: 500,
            maxReconnectDelay: 5000,
            requestTimeout: 30000,
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

  describe('destroy', () => {
    it('removes the system-notifications callback', async () => {
      await withService(({ mocks }) => {
        // destroy() runs in withService's finally; assert afterwards below.
        return mocks;
      }).then((mocks) => {
        expect(mocks.removeChannelCallback).toHaveBeenCalledWith(
          'system-notifications.v1.launchpad-tokens.v1',
        );
      });
    });
  });
});
