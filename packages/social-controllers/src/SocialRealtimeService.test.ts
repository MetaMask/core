import { WebSocketState } from '@metamask/core-backend';
import type {
  BackendWebSocketServiceMessenger,
  WebSocketSubscription,
} from '@metamask/core-backend';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import {
  SOCIAL_FEED_CHANNELS,
  SOCIAL_FEED_CHANNEL_TYPE,
  SocialRealtimeService,
} from './SocialRealtimeService.js';

describe('SocialRealtimeService', () => {
  type ConnectionStateHandler = (connection: { state: WebSocketState }) => void;

  type BackendCall = Mock<(method: string, params?: unknown) => unknown>;

  type TestHarness = {
    call: BackendCall;
    connectionStateHandler: () => ConnectionStateHandler | undefined;
    messenger: BackendWebSocketServiceMessenger;
    service: SocialRealtimeService;
    unsubscribe: Mock;
  };

  const event = {
    version: 1 as const,
    kind: 'feed-item' as const,
    eventId: 'event-1',
    feedItemId: 'position-1:trade-1',
    revision: 1,
    occurredAt: '2026-01-01T00:00:00.000Z',
    data: {
      itemId: 'position-1',
      timestamp: 1,
      cardLatestTradeAt: 1,
      actor: {
        type: 'user',
        address: '0x123',
        name: 'Trader',
        images: {},
        profile: { id: 'profile-1', metadata: {} },
      },
      metadata: {
        tokenChain: 'base',
        tokenAddress: '0xtoken',
        trades: [{ intent: 'enter', comments: [] }],
      },
    },
  };

  const createService = (
    enabled = true,
    scopes: ('all' | 'trending')[] = ['trending'],
  ): TestHarness => {
    let connectionStateHandler: ConnectionStateHandler | undefined;
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const call: BackendCall = vi.fn(
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
      subscribe: vi.fn(
        (_event: string, handler: ConnectionStateHandler): void => {
          connectionStateHandler = handler;
        },
      ),
    };
    const service = new SocialRealtimeService({
      messenger: messenger as unknown as BackendWebSocketServiceMessenger,
      scopes,
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
    const listener = vi.fn();
    service.addListener(listener);

    await service.setActive(true);
    const handleNotification = getFeedCallback(call);
    handleNotification({
      channel: SOCIAL_FEED_CHANNELS.trending,
      data: event,
    });

    expect(call).toHaveBeenCalledWith('BackendWebSocketService:connect');
    expect(call).toHaveBeenCalledWith(
      'BackendWebSocketService:subscribe',
      expect.objectContaining({
        channels: [SOCIAL_FEED_CHANNELS.trending],
        channelType: SOCIAL_FEED_CHANNEL_TYPE,
      }),
    );
    expect(listener).toHaveBeenCalledWith(event, 'trending');
  });

  it('subscribes to all selected feed scopes together', async () => {
    const { call, service } = createService(true, ['all', 'trending']);
    const listener = vi.fn();
    service.addListener(listener);

    await service.setActive(true);
    const subscribeCall = call.mock.calls.find(
      ([action]) => action === 'BackendWebSocketService:subscribe',
    );
    const subscribeOptions = subscribeCall?.[1] as {
      channels: string[];
      callback: (notification: { channel: string; data: unknown }) => void;
    };

    expect(subscribeOptions.channels).toStrictEqual([
      SOCIAL_FEED_CHANNELS.all,
      SOCIAL_FEED_CHANNELS.trending,
    ]);

    subscribeOptions.callback({
      channel: SOCIAL_FEED_CHANNELS.all,
      data: event,
    });

    expect(listener).toHaveBeenCalledWith(event, 'all');
  });

  it('forwards every valid event in a batched notification', async () => {
    const { call, service } = createService();
    const listener = vi.fn();
    service.addListener(listener);

    await service.setActive(true);
    getFeedCallback(call)({
      channel: SOCIAL_FEED_CHANNELS.trending,
      data: [
        event,
        {
          ...event,
          eventId: 'event-2',
          feedItemId: 'position-2:trade-2',
        },
      ],
    });

    expect(listener).toHaveBeenNthCalledWith(1, event, 'trending');
    expect(listener).toHaveBeenNthCalledWith(
      2,
      {
        ...event,
        eventId: 'event-2',
        feedItemId: 'position-2:trade-2',
      },
      'trending',
    );
  });

  it('drops malformed items without rejecting valid items in a batch', async () => {
    const { call, service } = createService();
    const listener = vi.fn();
    service.addListener(listener);

    await service.setActive(true);
    getFeedCallback(call)({
      channel: SOCIAL_FEED_CHANNELS.trending,
      data: [event, { ...event, eventId: 'invalid', data: null }],
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event, 'trending');
  });

  it('ignores non-object feed events', async () => {
    const { call, service } = createService();
    const listener = vi.fn();
    service.addListener(listener);

    await service.setActive(true);
    getFeedCallback(call)({
      channel: SOCIAL_FEED_CHANNELS.trending,
      data: null,
    });

    expect(listener).not.toHaveBeenCalled();
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
      const listener = vi.fn();
      service.addListener(listener);

      await service.setActive(true);
      getFeedCallback(call)({
        channel: SOCIAL_FEED_CHANNELS.trending,
        data: { ...event, ...invalid },
      });

      expect(listener).not.toHaveBeenCalled();
    },
  );

  it('ignores notifications for other channels', async () => {
    const { call, service } = createService();
    const listener = vi.fn();
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

  it('subscribes configured scopes when no gate is provided', async () => {
    const { call, messenger } = createService();
    const service = new SocialRealtimeService({
      messenger,
      scopes: ['trending'],
    });

    await service.setActive(true);

    expect(call).toHaveBeenCalledWith(
      'BackendWebSocketService:subscribe',
      expect.objectContaining({
        channels: [SOCIAL_FEED_CHANNELS.trending],
      }),
    );
  });

  it('replaces active scopes with a new subscription', async () => {
    const { call, service, unsubscribe } = createService(true, ['trending']);

    await service.setActive(true);
    await service.setScopes(['all', 'trending']);

    const subscribeCalls = call.mock.calls.filter(
      ([action]) => action === 'BackendWebSocketService:subscribe',
    );
    expect(subscribeCalls).toHaveLength(2);
    const secondSubscribe = subscribeCalls[1];
    if (!secondSubscribe) {
      throw new Error('Missing scope replacement call');
    }
    expect(
      (secondSubscribe[1] as { channels: string[] }).channels,
    ).toStrictEqual([SOCIAL_FEED_CHANNELS.all, SOCIAL_FEED_CHANNELS.trending]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('forwards overlapping events once during scope replacement', async () => {
    const { call, service } = createService(true, ['trending']);
    const listener = vi.fn();
    service.addListener(listener);

    await service.setActive(true);
    await service.setScopes(['all', 'trending']);

    const subscribeCalls = call.mock.calls.filter(
      ([action]) => action === 'BackendWebSocketService:subscribe',
    );
    const firstSubscribe = subscribeCalls[0];
    const secondSubscribe = subscribeCalls[1];
    if (!firstSubscribe || !secondSubscribe) {
      throw new Error('Missing scope replacement calls');
    }
    const firstCallback = (
      firstSubscribe[1] as {
        callback: (notification: { channel: string; data: unknown }) => void;
      }
    ).callback;
    const secondCallback = (
      secondSubscribe[1] as {
        callback: (notification: { channel: string; data: unknown }) => void;
      }
    ).callback;
    const notification = {
      channel: SOCIAL_FEED_CHANNELS.trending,
      data: event,
    };

    firstCallback(notification);
    secondCallback(notification);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event, 'trending');
  });

  it('cleans up a replacement when the existing subscription cleanup fails', async () => {
    const { call, service } = createService(true, ['trending']);
    const existingUnsubscribe = vi
      .fn()
      .mockRejectedValue(new Error('Unsubscribe failed'));
    const replacementUnsubscribe = vi.fn().mockResolvedValue(undefined);
    const listener = vi.fn();
    let subscribeCount = 0;
    service.addListener(listener);

    call.mockImplementation((action: string): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.resolve();
      }

      if (action === 'BackendWebSocketService:subscribe') {
        subscribeCount += 1;
        return Promise.resolve({
          unsubscribe:
            subscribeCount === 1 ? existingUnsubscribe : replacementUnsubscribe,
        });
      }

      return Promise.resolve();
    });

    await service.setActive(true);
    await expect(service.setScopes(['all'])).rejects.toThrow(
      'Unsubscribe failed',
    );

    const subscribeCalls = call.mock.calls.filter(
      ([action]) => action === 'BackendWebSocketService:subscribe',
    );
    const firstSubscribe = subscribeCalls[0];
    const secondSubscribe = subscribeCalls[1];
    if (!firstSubscribe || !secondSubscribe) {
      throw new Error('Missing scope replacement calls');
    }
    const firstCallback = (
      firstSubscribe[1] as {
        callback: (notification: { channel: string; data: unknown }) => void;
      }
    ).callback;
    const secondCallback = (
      secondSubscribe[1] as {
        callback: (notification: { channel: string; data: unknown }) => void;
      }
    ).callback;
    const notification = {
      channel: SOCIAL_FEED_CHANNELS.trending,
      data: event,
    };

    firstCallback(notification);
    secondCallback(notification);

    expect(replacementUnsubscribe).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('resubscribes after disconnect during replacement cleanup', async () => {
    const { call, connectionStateHandler, service } = createService(true, [
      'trending',
    ]);
    const error = new Error('Unsubscribe failed');
    const existingUnsubscribe = vi.fn().mockImplementation(() => {
      connectionStateHandler()?.({ state: WebSocketState.DISCONNECTED });
      return Promise.reject(error);
    });
    let subscribeCount = 0;

    call.mockImplementation((action: string): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.resolve();
      }

      if (action === 'BackendWebSocketService:subscribe') {
        subscribeCount += 1;
        return Promise.resolve({
          unsubscribe:
            subscribeCount === 1
              ? existingUnsubscribe
              : vi.fn().mockResolvedValue(undefined),
        });
      }

      return Promise.resolve();
    });

    await service.setActive(true);
    await expect(service.setScopes(['all'])).rejects.toBe(error);
    connectionStateHandler()?.({ state: WebSocketState.CONNECTED });
    await Promise.resolve();
    await Promise.resolve();

    expect(
      call.mock.calls.filter(
        ([action]) => action === 'BackendWebSocketService:subscribe',
      ),
    ).toHaveLength(3);
  });

  it('handles deactivation while replacing scopes', async () => {
    const { call, service } = createService(true, ['trending']);
    const existingUnsubscribe = vi
      .fn()
      .mockRejectedValue(new Error('Unsubscribe failed'));
    const replacementUnsubscribe = vi.fn().mockResolvedValue(undefined);
    let resolveReplacement: (value: WebSocketSubscription) => void = () =>
      undefined;
    const replacementPromise = new Promise<WebSocketSubscription>(
      (resolve): void => {
        resolveReplacement = resolve;
      },
    );
    let subscribeCount = 0;

    call.mockImplementation((action: string): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.resolve();
      }

      if (action === 'BackendWebSocketService:subscribe') {
        subscribeCount += 1;
        return subscribeCount === 1
          ? Promise.resolve({ unsubscribe: existingUnsubscribe })
          : replacementPromise;
      }

      return Promise.resolve();
    });

    await service.setActive(true);
    const scopeUpdate = service.setScopes(['all']);
    await Promise.resolve();
    await Promise.resolve();
    await service.setActive(false);
    resolveReplacement({
      unsubscribe: replacementUnsubscribe,
    } as unknown as WebSocketSubscription);

    await expect(scopeUpdate).rejects.toThrow('Unsubscribe failed');
    expect(replacementUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('cleans up after deactivation during a failed scope replacement', async () => {
    const { call, service } = createService(true, ['trending']);
    const existingUnsubscribe = vi
      .fn()
      .mockRejectedValueOnce(new Error('Existing cleanup failed'))
      .mockResolvedValue(undefined);
    const replacementError = new Error('Replacement failed');
    const listener = vi.fn();
    let rejectReplacement: (reason?: unknown) => void = () => undefined;
    const replacementPromise = new Promise<WebSocketSubscription>(
      (_resolve, reject): void => {
        rejectReplacement = reject;
      },
    );
    let subscribeCount = 0;
    service.addListener(listener);

    call.mockImplementation((action: string): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.resolve();
      }

      if (action === 'BackendWebSocketService:subscribe') {
        subscribeCount += 1;
        return subscribeCount === 1
          ? Promise.resolve({ unsubscribe: existingUnsubscribe })
          : replacementPromise;
      }

      return Promise.resolve();
    });

    await service.setActive(true);
    const scopeUpdate = service.setScopes(['all']);
    await Promise.resolve();
    await Promise.resolve();
    await service.setActive(false);
    rejectReplacement(replacementError);

    await expect(scopeUpdate).rejects.toBe(replacementError);
    getFeedCallback(call)({
      channel: SOCIAL_FEED_CHANNELS.trending,
      data: event,
    });
    await service.setActive(false);

    expect(existingUnsubscribe).toHaveBeenCalledTimes(2);
    expect(listener).not.toHaveBeenCalled();
  });

  it('retains requested scopes after cleanup fails during deactivation', async () => {
    const { call, service } = createService(true, ['trending']);
    const replacementUnsubscribe = vi.fn().mockResolvedValue(undefined);
    const existingUnsubscribe = vi
      .fn()
      .mockImplementationOnce(() => {
        service.setActive(false).catch(() => undefined);
        return Promise.reject(new Error('Existing cleanup failed'));
      })
      .mockResolvedValue(undefined);
    let subscribeCount = 0;

    call.mockImplementation((action: string): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.resolve();
      }

      if (action === 'BackendWebSocketService:subscribe') {
        subscribeCount += 1;
        return Promise.resolve({
          unsubscribe:
            subscribeCount === 1 ? existingUnsubscribe : replacementUnsubscribe,
        });
      }

      return Promise.resolve();
    });

    await service.setActive(true);
    await expect(service.setScopes(['all'])).rejects.toThrow(
      'Existing cleanup failed',
    );
    await service.setActive(true);

    const subscribeCalls = call.mock.calls.filter(
      ([action]) => action === 'BackendWebSocketService:subscribe',
    );
    const latestSubscribe = subscribeCalls[2];
    if (!latestSubscribe) {
      throw new Error('Missing reactivation subscription call');
    }

    expect(existingUnsubscribe).toHaveBeenCalledTimes(2);
    expect(
      (latestSubscribe[1] as { channels: string[] }).channels,
    ).toStrictEqual([SOCIAL_FEED_CHANNELS.all]);
  });

  it('handles a failed replacement after disconnecting', async () => {
    const { call, connectionStateHandler, service } = createService(true, [
      'trending',
    ]);
    const replacementError = new Error('Replacement failed');
    let rejectReplacement: (reason?: unknown) => void = () => undefined;
    const replacementPromise = new Promise<WebSocketSubscription>(
      (_resolve, reject): void => {
        rejectReplacement = reject;
      },
    );
    let subscribeCount = 0;

    call.mockImplementation((action: string): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.resolve();
      }

      if (action === 'BackendWebSocketService:subscribe') {
        subscribeCount += 1;
        return subscribeCount === 1
          ? Promise.resolve({ unsubscribe: vi.fn() })
          : replacementPromise;
      }

      return Promise.resolve();
    });

    await service.setActive(true);
    connectionStateHandler()?.({ state: WebSocketState.DISCONNECTED });
    const scopeUpdate = service.setScopes(['all']);
    await Promise.resolve();
    await Promise.resolve();
    await service.setActive(false);
    rejectReplacement(replacementError);

    await expect(scopeUpdate).rejects.toBe(replacementError);
  });

  it('retries failed replacement cleanup', async () => {
    const { call, service } = createService(true, ['trending']);
    const existingUnsubscribe = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unsubscribe failed'))
      .mockResolvedValue(undefined);
    const replacementUnsubscribe = vi
      .fn()
      .mockRejectedValueOnce(new Error('Replacement cleanup failed'))
      .mockRejectedValueOnce(new Error('Replacement cleanup still failed'))
      .mockResolvedValue(undefined);
    let subscribeCount = 0;

    call.mockImplementation((action: string): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.resolve();
      }

      if (action === 'BackendWebSocketService:subscribe') {
        subscribeCount += 1;
        return Promise.resolve({
          unsubscribe:
            subscribeCount === 1 ? existingUnsubscribe : replacementUnsubscribe,
        });
      }

      return Promise.resolve();
    });

    await service.setActive(true);
    await expect(service.setScopes(['all'])).rejects.toThrow(
      'Unsubscribe failed',
    );
    await service.setActive(false);
    await service.setActive(true);
    await service.setScopes(['all']);

    expect(replacementUnsubscribe).toHaveBeenCalledTimes(4);
  });

  it('preserves the active feed when replacing scopes fails', async () => {
    const { call, service } = createService(true, ['trending']);
    const existingUnsubscribe = vi.fn().mockResolvedValue(undefined);
    const error = new Error('WebSocket unavailable');
    const listener = vi.fn();
    let subscribeCount = 0;
    service.addListener(listener);

    call.mockImplementation((action: string): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.resolve();
      }

      if (action === 'BackendWebSocketService:subscribe') {
        subscribeCount += 1;
        if (subscribeCount === 2) {
          return Promise.reject(error);
        }
        return Promise.resolve({ unsubscribe: existingUnsubscribe });
      }

      return Promise.resolve();
    });

    await service.setActive(true);
    await expect(service.setScopes(['all'])).rejects.toBe(error);
    getFeedCallback(call)({
      channel: SOCIAL_FEED_CHANNELS.trending,
      data: event,
    });

    expect(existingUnsubscribe).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith(event, 'trending');
  });

  it('waits for an active subscription before replacing scopes', async () => {
    const { call, service, unsubscribe } = createService(true, ['trending']);
    let resolveSubscription: (value: WebSocketSubscription) => void = () =>
      undefined;
    const subscriptionPromise = new Promise<WebSocketSubscription>(
      (resolve): void => {
        resolveSubscription = resolve;
      },
    );
    call.mockImplementation((action: string): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.resolve();
      }
      return subscriptionPromise;
    });

    const activation = service.setActive(true);
    await Promise.resolve();
    await Promise.resolve();
    const scopeUpdate = service.setScopes(['all']);
    resolveSubscription({ unsubscribe } as unknown as WebSocketSubscription);

    await activation;
    await scopeUpdate;

    const subscribeCalls = call.mock.calls.filter(
      ([action]) => action === 'BackendWebSocketService:subscribe',
    );
    expect(subscribeCalls).toHaveLength(2);
    const secondSubscribe = subscribeCalls[1];
    if (!secondSubscribe) {
      throw new Error('Missing scope replacement call');
    }
    expect(
      (secondSubscribe[1] as { channels: string[] }).channels,
    ).toStrictEqual([SOCIAL_FEED_CHANNELS.all]);
  });

  it('serializes concurrent scope updates', async () => {
    const { call, service, unsubscribe } = createService(true, ['trending']);
    const firstError = new Error('First replacement failed');
    let rejectFirstReplacement: (reason?: unknown) => void = () => undefined;
    const firstReplacement = new Promise<WebSocketSubscription>(
      (_resolve, reject): void => {
        rejectFirstReplacement = reject;
      },
    );
    let subscribeCount = 0;

    call.mockImplementation((action: string): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.resolve();
      }

      if (action === 'BackendWebSocketService:subscribe') {
        subscribeCount += 1;
        if (subscribeCount === 2) {
          return firstReplacement;
        }
        return Promise.resolve({ unsubscribe });
      }

      return Promise.resolve();
    });

    await service.setActive(true);
    const firstUpdate = service.setScopes(['all']);
    await Promise.resolve();
    await Promise.resolve();
    const secondUpdate = service.setScopes(['all', 'trending']);
    rejectFirstReplacement(firstError);

    await expect(firstUpdate).rejects.toBe(firstError);
    await secondUpdate;

    const subscribeCalls = call.mock.calls.filter(
      ([action]) => action === 'BackendWebSocketService:subscribe',
    );
    expect(subscribeCalls).toHaveLength(3);
    const firstReplacementCall = subscribeCalls[1];
    const secondReplacementCall = subscribeCalls[2];
    if (!firstReplacementCall || !secondReplacementCall) {
      throw new Error('Missing concurrent scope replacement calls');
    }

    expect(
      (firstReplacementCall[1] as { channels: string[] }).channels,
    ).toStrictEqual([SOCIAL_FEED_CHANNELS.all]);
    expect(
      (secondReplacementCall[1] as { channels: string[] }).channels,
    ).toStrictEqual([SOCIAL_FEED_CHANNELS.all, SOCIAL_FEED_CHANNELS.trending]);
  });

  it('rejects an empty scope set', async () => {
    const { service } = createService();

    await expect(service.setScopes([])).rejects.toThrow(
      'At least one Social feed scope is required',
    );
  });

  it('remembers scope changes while inactive', async () => {
    const { call, service } = createService();

    await service.setScopes(['all']);
    await service.setActive(true);

    expect(call).toHaveBeenCalledWith(
      'BackendWebSocketService:subscribe',
      expect.objectContaining({
        channels: [SOCIAL_FEED_CHANNELS.all],
      }),
    );
  });

  it('creates an owned subscription when the feed channel already has one', async () => {
    const { call, service, unsubscribe } = createService();
    const listener = vi.fn();
    const existingUnsubscribe = vi.fn().mockResolvedValue(undefined);
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
      channel: SOCIAL_FEED_CHANNELS.trending,
      data: event,
    });
    await service.setActive(false);

    expect(call).toHaveBeenCalledWith(
      'BackendWebSocketService:subscribe',
      expect.objectContaining({
        channels: [SOCIAL_FEED_CHANNELS.trending],
      }),
    );
    expect(listener).toHaveBeenCalledWith(event, 'trending');
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
        channels: [SOCIAL_FEED_CHANNELS.trending],
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
    const listener = vi.fn();
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

  it('retries subscription setup when reactivation overlaps subscription cleanup', async () => {
    const { call, service, unsubscribe } = createService();
    let resolveSubscription: (value: WebSocketSubscription) => void = () =>
      undefined;
    const subscriptionPromise = new Promise<WebSocketSubscription>(
      (resolve): void => {
        resolveSubscription = resolve;
      },
    );
    let resolveUnsubscribe: () => void = () => undefined;
    const unsubscribePromise = new Promise<void>((resolve): void => {
      resolveUnsubscribe = resolve;
    });
    unsubscribe.mockReturnValue(unsubscribePromise);
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
    await Promise.resolve();

    const reactivation = service.setActive(true);
    resolveUnsubscribe();
    await activation;
    await reactivation;

    expect(
      call.mock.calls.filter(
        ([action]) => action === 'BackendWebSocketService:subscribe',
      ),
    ).toHaveLength(2);
  });

  it('rejects subscription errors during feed activation', async () => {
    const { call, service } = createService();
    const error = new Error('WebSocket unavailable');
    call.mockImplementation((action: string, _options?: unknown): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.reject(error);
      }

      return Promise.resolve({ unsubscribe: vi.fn() });
    });

    await expect(service.setActive(true)).rejects.toBe(error);

    expect(call).toHaveBeenCalledWith('BackendWebSocketService:connect');
  });

  it('does not unsubscribe when deactivated without an active subscription', async () => {
    const { service, unsubscribe } = createService();

    await service.setActive(false);

    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('removes feed and reconnect listeners', () => {
    const { service } = createService();
    const removeFeedListener = service.addListener(vi.fn());
    const removeReconnectListener = service.addReconnectListener(vi.fn());

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
    const listener = vi.fn();
    service.addReconnectListener(listener);

    await service.setActive(true);
    connectionStateHandler()?.({ state: WebSocketState.DISCONNECTED });
    connectionStateHandler()?.({ state: WebSocketState.CONNECTED });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not notify reconnect listeners when resubscription fails', async () => {
    const { call, connectionStateHandler, service } = createService();
    const listener = vi.fn();
    service.addReconnectListener(listener);

    await service.setActive(true);
    call.mockImplementation((action: string): unknown => {
      if (action === 'BackendWebSocketService:connect') {
        return Promise.reject(new Error('WebSocket unavailable'));
      }
      return Promise.resolve({ unsubscribe: vi.fn() });
    });

    connectionStateHandler()?.({ state: WebSocketState.DISCONNECTED });
    connectionStateHandler()?.({ state: WebSocketState.CONNECTED });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribes when the feed leaves the active tab', async () => {
    const { service, unsubscribe } = createService();

    await service.setActive(true);
    await service.setActive(false);

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
