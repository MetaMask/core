import { WebSocketState } from '@metamask/core-backend';
import type {
  BackendWebSocketServiceMessenger,
  WebSocketSubscription,
} from '@metamask/core-backend';

import {
  SOCIAL_FEED_CHANNEL,
  SOCIAL_FEED_CHANNEL_TYPE,
  SocialRealtimeService,
} from './SocialRealtimeService.js';

describe('SocialRealtimeService', () => {
  type ConnectionStateHandler = (connection: { state: WebSocketState }) => void;

  type BackendCall = jest.Mock<unknown, [string, unknown?]>;

  type TestHarness = {
    call: BackendCall;
    connectionStateHandler: () => ConnectionStateHandler | undefined;
    messenger: BackendWebSocketServiceMessenger;
    service: SocialRealtimeService;
    unsubscribe: jest.Mock;
  };

  const event = {
    version: 1 as const,
    kind: 'feed-item' as const,
    eventId: 'event-1',
    feedItemId: 'position-1:trade-1',
    revision: 1,
    occurredAt: '2026-01-01T00:00:00.000Z',
    data: {
      positionId: 'position-1',
      timestamp: 1,
    },
  };

  const createService = (enabled = true): TestHarness => {
    let connectionStateHandler: ConnectionStateHandler | undefined;
    const unsubscribe = jest.fn().mockResolvedValue(undefined);
    const call: BackendCall = jest.fn(
      (action: string, _options?: unknown): unknown => {
        if (action === 'BackendWebSocketService:connect') {
          return Promise.resolve();
        }

        if (action === 'BackendWebSocketService:channelHasSubscription') {
          return false;
        }

        if (action === 'BackendWebSocketService:getSubscriptionsByChannel') {
          return [];
        }

        return Promise.resolve({ unsubscribe });
      },
    );
    const messenger = {
      call,
      subscribe: jest.fn(
        (_event: string, handler: ConnectionStateHandler): void => {
          connectionStateHandler = handler;
        },
      ),
    };
    const service = new SocialRealtimeService({
      messenger: messenger as unknown as BackendWebSocketServiceMessenger,
      isEnabled: (): boolean => enabled,
    });

    return {
      call,
      connectionStateHandler: (): ConnectionStateHandler | undefined =>
        connectionStateHandler,
      messenger: messenger as unknown as BackendWebSocketServiceMessenger,
      service,
      unsubscribe,
    };
  };

  const getFeedCallback = (
    call: BackendCall,
  ): ((notification: { channel: string; data: unknown }) => void) => {
    const subscribeCall = call.mock.calls.find(
      ([action]) => action === 'BackendWebSocketService:subscribe',
    );
    if (!subscribeCall) {
      throw new Error('The feed subscription was not created');
    }

    const [, subscribeOptions] = subscribeCall;
    return (
      subscribeOptions as {
        callback: (notification: { channel: string; data: unknown }) => void;
      }
    ).callback;
  };

  it('subscribes and forwards valid feed events', async () => {
    const { call, service } = createService();
    const listener = jest.fn();
    service.addListener(listener);

    await service.setActive(true);
    const handleNotification = getFeedCallback(call);
    handleNotification({
      channel: SOCIAL_FEED_CHANNEL,
      data: event,
    });

    expect(call).toHaveBeenCalledWith('BackendWebSocketService:connect');
    expect(call).toHaveBeenCalledWith(
      'BackendWebSocketService:subscribe',
      expect.objectContaining({
        channels: [SOCIAL_FEED_CHANNEL],
        channelType: SOCIAL_FEED_CHANNEL_TYPE,
      }),
    );
    expect(listener).toHaveBeenCalledWith(event);
  });

  it.each([
    ['version', { version: 2 }],
    ['kind', { kind: 'other' }],
    ['eventId', { eventId: 1 }],
    ['feedItemId', { feedItemId: 1 }],
    ['revision', { revision: '1' }],
    ['occurredAt', { occurredAt: 1 }],
    ['data', { data: null }],
  ])(
    'ignores feed events with an invalid %s field',
    async (_field, invalid) => {
      const { call, service } = createService();
      const listener = jest.fn();
      service.addListener(listener);

      await service.setActive(true);
      getFeedCallback(call)({
        channel: SOCIAL_FEED_CHANNEL,
        data: { ...event, ...invalid },
      });

      expect(listener).not.toHaveBeenCalled();
    },
  );

  it('ignores notifications for other channels', async () => {
    const { call, service } = createService();
    const listener = jest.fn();
    service.addListener(listener);

    await service.setActive(true);
    getFeedCallback(call)({
      channel: 'social.v1.other',
      data: event,
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps the feed unsubscribed while the enablement gate is disabled', async () => {
    const { call, service } = createService(false);

    await service.setActive(true);

    expect(call).not.toHaveBeenCalled();
  });

  it('enables the feed by default when no gate is provided', async () => {
    const { call, messenger } = createService();
    const service = new SocialRealtimeService({ messenger });

    await service.setActive(true);

    expect(call).toHaveBeenCalledWith(
      'BackendWebSocketService:subscribe',
      expect.objectContaining({
        channels: [SOCIAL_FEED_CHANNEL],
      }),
    );
  });

  it('creates an owned subscription when the feed channel already has one', async () => {
    const { call, service, unsubscribe } = createService();
    const listener = jest.fn();
    const existingUnsubscribe = jest.fn().mockResolvedValue(undefined);
    const existingSubscription = {
      unsubscribe: existingUnsubscribe,
    } as unknown as WebSocketSubscription;
    call.mockImplementation((action: string, _options?: unknown): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.resolve();
      }

      if (action === 'BackendWebSocketService:channelHasSubscription') {
        return true;
      }

      if (action === 'BackendWebSocketService:getSubscriptionsByChannel') {
        return [existingSubscription];
      }

      return Promise.resolve({ unsubscribe });
    });

    service.addListener(listener);
    await service.setActive(true);
    getFeedCallback(call)({
      channel: SOCIAL_FEED_CHANNEL,
      data: event,
    });
    await service.setActive(false);

    expect(call).toHaveBeenCalledWith(
      'BackendWebSocketService:subscribe',
      expect.objectContaining({
        channels: [SOCIAL_FEED_CHANNEL],
      }),
    );
    expect(listener).toHaveBeenCalledWith(event);
    expect(existingUnsubscribe).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('creates a subscription when the backend lookup is empty', async () => {
    const { call, service, unsubscribe } = createService();
    call.mockImplementation((action: string, _options?: unknown): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.resolve();
      }

      if (action === 'BackendWebSocketService:channelHasSubscription') {
        return true;
      }

      if (action === 'BackendWebSocketService:getSubscriptionsByChannel') {
        return [];
      }

      return Promise.resolve({ unsubscribe });
    });

    await service.setActive(true);
    await service.setActive(false);

    expect(call).toHaveBeenCalledWith(
      'BackendWebSocketService:subscribe',
      expect.objectContaining({
        channels: [SOCIAL_FEED_CHANNEL],
      }),
    );
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('avoids creating a second subscription while already active', async () => {
    const { call, service } = createService();

    await service.setActive(true);
    await service.setActive(true);

    expect(
      call.mock.calls.filter(
        ([action]) => action === 'BackendWebSocketService:subscribe',
      ),
    ).toHaveLength(1);
  });

  it('avoids duplicate subscriptions when connect reports connected synchronously', async () => {
    const { call, connectionStateHandler, service, unsubscribe } =
      createService();
    let hasReportedConnected = false;
    call.mockImplementation((action: string, _options?: unknown): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        if (!hasReportedConnected) {
          hasReportedConnected = true;
          connectionStateHandler()?.({ state: WebSocketState.CONNECTED });
        }
        return Promise.resolve();
      }

      if (action === 'BackendWebSocketService:channelHasSubscription') {
        return false;
      }

      return Promise.resolve({ unsubscribe });
    });

    await service.setActive(true);
    await Promise.resolve();

    expect(
      call.mock.calls.filter(
        ([action]) => action === 'BackendWebSocketService:subscribe',
      ),
    ).toHaveLength(1);
  });

  it('ignores an initial connected notification instead of reporting a reconnect', async () => {
    const { call, connectionStateHandler, service } = createService();
    const listener = jest.fn();
    service.addReconnectListener(listener);

    await service.setActive(true);
    connectionStateHandler()?.({ state: WebSocketState.CONNECTED });
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
    expect(
      call.mock.calls.filter(
        ([action]) => action === 'BackendWebSocketService:subscribe',
      ),
    ).toHaveLength(1);
  });

  it('unsubscribes a subscription that resolves after deactivation', async () => {
    const { call, service, unsubscribe } = createService();
    let resolveSubscription: (value: WebSocketSubscription) => void = () =>
      undefined;
    const subscriptionPromise = new Promise<WebSocketSubscription>(
      (resolve): void => {
        resolveSubscription = resolve;
      },
    );
    call.mockImplementation((action: string, _options?: unknown): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.resolve();
      }

      if (action === 'BackendWebSocketService:channelHasSubscription') {
        return false;
      }

      if (action === 'BackendWebSocketService:getSubscriptionsByChannel') {
        return [];
      }

      return subscriptionPromise;
    });

    const activation = service.setActive(true);
    await Promise.resolve();
    await Promise.resolve();
    await service.setActive(false);
    resolveSubscription({ unsubscribe } as unknown as WebSocketSubscription);
    await activation;

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('swallows subscription errors so feed activation remains best effort', async () => {
    const { call, service } = createService();
    const error = new Error('WebSocket unavailable');
    call.mockImplementation((action: string, _options?: unknown): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.reject(error);
      }

      return Promise.resolve({ unsubscribe: jest.fn() });
    });

    await service.setActive(true);

    expect(call).toHaveBeenCalledWith('BackendWebSocketService:connect');
  });

  it('does not unsubscribe when deactivated without an active subscription', async () => {
    const { service, unsubscribe } = createService();

    await service.setActive(false);

    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('removes feed and reconnect listeners', () => {
    const { service } = createService();
    const removeFeedListener = service.addListener(jest.fn());
    const removeReconnectListener = service.addReconnectListener(jest.fn());

    expect(removeFeedListener()).toBe(true);
    expect(removeReconnectListener()).toBe(true);
  });

  it('resubscribes after the shared socket reconnects', async () => {
    const { call, connectionStateHandler, service } = createService();

    await service.setActive(true);
    connectionStateHandler()?.({ state: WebSocketState.DISCONNECTED });
    connectionStateHandler()?.({ state: WebSocketState.CONNECTED });
    await Promise.resolve();
    await Promise.resolve();

    expect(
      call.mock.calls.filter(
        ([action]) => action === 'BackendWebSocketService:subscribe',
      ),
    ).toHaveLength(2);
  });

  it('notifies active feed listeners after a socket reconnects', async () => {
    const { connectionStateHandler, service } = createService();
    const listener = jest.fn();
    service.addReconnectListener(listener);

    await service.setActive(true);
    connectionStateHandler()?.({ state: WebSocketState.DISCONNECTED });
    connectionStateHandler()?.({ state: WebSocketState.CONNECTED });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes when the feed leaves the active tab', async () => {
    const { service, unsubscribe } = createService();

    await service.setActive(true);
    await service.setActive(false);

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
