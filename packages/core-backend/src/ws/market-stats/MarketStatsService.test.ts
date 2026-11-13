import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { flushPromises } from '../../../../../tests/vitest/helpers.js';
import { WebSocketState } from '../BackendWebSocketService.js';
import type {
  BackendWebSocketService,
  ServerNotificationMessage,
} from '../BackendWebSocketService.js';
import { MarketStatsService } from './MarketStatsService.js';
import type { MarketStatsServiceMessenger } from './MarketStatsService.js';
import type { MarketStatsSubscriptionOptions } from './types.js';

type AllActions = MessengerActions<MarketStatsServiceMessenger>;
type AllEvents = MessengerEvents<MarketStatsServiceMessenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const completeAsyncOperations = async (): Promise<void> => {
  for (let index = 0; index < 5; index++) {
    await flushPromises();
  }
};

const getMessenger = (): {
  rootMessenger: RootMessenger;
  messenger: MarketStatsServiceMessenger;
  mocks: {
    subscribe: Mock;
    forceReconnection: Mock;
    addChannelCallback: Mock;
    removeChannelCallback: Mock;
    channelHasSubscription: Mock;
    getSubscriptionsByChannel: Mock;
  };
} => {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const messenger: MarketStatsServiceMessenger = new Messenger({
    namespace: 'MarketStatsService',
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

  const subscribedChannels = new Set<string>();
  const mockSubscribe = vi.fn(
    async (
      options: Parameters<BackendWebSocketService['subscribe']>[0],
    ): ReturnType<BackendWebSocketService['subscribe']> => {
      for (const channel of options.channels) {
        subscribedChannels.add(channel);
      }
      return {
        subscriptionId: 'market-stats-sub',
        channels: [...options.channels],
        channelType: options.channelType,
        unsubscribe: async () => undefined,
      };
    },
  );
  const mockAddChannelCallback = vi.fn();
  const mockRemoveChannelCallback = vi.fn();
  const mockForceReconnection = vi.fn().mockResolvedValue(undefined);
  const mockChannelHasSubscription = vi.fn((channel: string) =>
    subscribedChannels.has(channel),
  );
  const mockGetSubscriptionsByChannel = vi.fn().mockReturnValue([]);

  rootMessenger.registerActionHandler(
    'BackendWebSocketService:connect',
    vi.fn().mockResolvedValue(undefined),
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
      subscribe: mockSubscribe,
      forceReconnection: mockForceReconnection,
      addChannelCallback: mockAddChannelCallback,
      removeChannelCallback: mockRemoveChannelCallback,
      channelHasSubscription: mockChannelHasSubscription,
      getSubscriptionsByChannel: mockGetSubscriptionsByChannel,
    },
  };
};

const SUB_OPTS: MarketStatsSubscriptionOptions = {
  assetId: 'eip155:1/slip44:60',
  currency: 'eur',
};

const EXPECTED_CHANNEL = 'market-stats.v1.eip155:1/slip44:60.eur';

const CONNECTION_INFO = {
  url: 'ws://test',
  reconnectAttempts: 0,
  timeout: 1000,
  reconnectDelay: 500,
  maxReconnectDelay: 5000,
  requestTimeout: 30000,
};

const publishConnection = (
  rootMessenger: RootMessenger,
  state: WebSocketState,
): void => {
  rootMessenger.publish('BackendWebSocketService:connectionStateChanged', {
    ...CONNECTION_INFO,
    state,
  });
};

const callbackFor = (
  mocks: { addChannelCallback: Mock },
  channelName: string,
): ((notification: ServerNotificationMessage) => void) => {
  const call = mocks.addChannelCallback.mock.calls.find(
    (args: unknown[]) =>
      typeof args[0] === 'object' &&
      args[0] !== null &&
      'channelName' in args[0] &&
      (args[0] as { channelName: string }).channelName === channelName,
  );
  if (!call) {
    throw new Error(`callback not registered for ${channelName}`);
  }
  return (
    call[0] as {
      callback: (notification: ServerNotificationMessage) => void;
    }
  ).callback;
};

describe('MarketStatsService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to the per-asset currency channel', async () => {
    const { messenger, mocks } = getMessenger();
    const service = new MarketStatsService({ messenger });
    await service.subscribe(SUB_OPTS);

    expect(mocks.subscribe).toHaveBeenCalledWith({
      channels: [EXPECTED_CHANNEL],
      channelType: 'market-stats.v1',
      callback: expect.any(Function),
    });

    service.destroy();
  });

  it('subscribes many assets in one websocket frame', async () => {
    const { messenger, mocks } = getMessenger();
    const service = new MarketStatsService({ messenger });
    await service.subscribe([
      SUB_OPTS,
      { assetId: 'eip155:137/slip44:966', currency: 'eur' },
    ]);

    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledWith({
      channels: [EXPECTED_CHANNEL, 'market-stats.v1.eip155:137/slip44:966.eur'],
      channelType: 'market-stats.v1',
      callback: expect.any(Function),
    });

    service.destroy();
  });

  it('returns open channels from getSubscriptions', async () => {
    const { messenger } = getMessenger();
    const service = new MarketStatsService({ messenger });
    expect(service.getSubscriptions()).toStrictEqual([]);

    await service.subscribe([
      SUB_OPTS,
      { assetId: 'eip155:137/slip44:966', currency: 'eur' },
    ]);

    expect(service.getSubscriptions()).toStrictEqual([
      { assetId: 'eip155:1/slip44:60', currency: 'eur' },
      { assetId: 'eip155:137/slip44:966', currency: 'eur' },
    ]);

    await service.unsubscribe(SUB_OPTS);
    expect(service.getSubscriptions()).toStrictEqual([
      { assetId: 'eip155:137/slip44:966', currency: 'eur' },
    ]);

    service.destroy();
  });

  it('subscribes tracked channels when the socket connects', async () => {
    const { messenger, mocks, rootMessenger } = getMessenger();
    mocks.subscribe.mockRejectedValueOnce(
      new Error(
        `Cannot create subscription(s) ${EXPECTED_CHANNEL}: WebSocket is DISCONNECTED`,
      ),
    );
    const service = new MarketStatsService({ messenger });
    await service.subscribe(SUB_OPTS);
    mocks.subscribe.mockClear();

    publishConnection(rootMessenger, WebSocketState.CONNECTED);
    await completeAsyncOperations();

    expect(mocks.subscribe).toHaveBeenCalledWith({
      channels: [EXPECTED_CHANNEL],
      channelType: 'market-stats.v1',
      callback: expect.any(Function),
    });

    service.destroy();
  });

  it('subscribes when the first attempt failed before sign-in', async () => {
    const { messenger, mocks, rootMessenger } = getMessenger();
    mocks.subscribe.mockRejectedValueOnce(
      new Error('Authentication required: user not signed in'),
    );
    const service = new MarketStatsService({ messenger });
    await service.subscribe(SUB_OPTS);
    mocks.subscribe.mockClear();

    publishConnection(rootMessenger, WebSocketState.CONNECTED);
    await completeAsyncOperations();

    expect(mocks.subscribe).toHaveBeenCalledWith({
      channels: [EXPECTED_CHANNEL],
      channelType: 'market-stats.v1',
      callback: expect.any(Function),
    });

    service.destroy();
  });

  it('leaves a channel alone when the server already has it', async () => {
    const { messenger, mocks, rootMessenger } = getMessenger();
    const service = new MarketStatsService({ messenger });
    await service.subscribe(SUB_OPTS);
    mocks.subscribe.mockClear();

    publishConnection(rootMessenger, WebSocketState.CONNECTED);
    await completeAsyncOperations();

    expect(mocks.subscribe).not.toHaveBeenCalled();

    service.destroy();
  });

  it('rejects when the socket subscribe fails', async () => {
    const { messenger, mocks } = getMessenger();
    mocks.subscribe.mockRejectedValueOnce(new Error('socket down'));
    const service = new MarketStatsService({ messenger });
    await expect(service.subscribe(SUB_OPTS)).rejects.toThrow('socket down');
    expect(mocks.forceReconnection).not.toHaveBeenCalled();

    service.destroy();
  });

  it('does not resubscribe a channel the server rejected', async () => {
    const { messenger, mocks, rootMessenger } = getMessenger();
    mocks.subscribe.mockRejectedValueOnce(
      new Error(`Request failed: ${EXPECTED_CHANNEL}`),
    );
    const service = new MarketStatsService({ messenger });
    await expect(service.subscribe(SUB_OPTS)).rejects.toThrow('Request failed');
    mocks.subscribe.mockClear();

    publishConnection(rootMessenger, WebSocketState.CONNECTED);
    await completeAsyncOperations();

    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(mocks.forceReconnection).not.toHaveBeenCalled();

    service.destroy();
  });

  it('drops a deferred channel when the server rejects it on connect', async () => {
    const { messenger, mocks, rootMessenger } = getMessenger();
    const errors: unknown[] = [];
    rootMessenger.subscribe(
      'MarketStatsService:subscriptionError',
      (payload) => {
        errors.push(payload);
      },
    );
    mocks.subscribe.mockRejectedValueOnce(
      new Error(
        `Cannot create subscription(s) ${EXPECTED_CHANNEL}: WebSocket is DISCONNECTED`,
      ),
    );
    const service = new MarketStatsService({ messenger });
    await service.subscribe(SUB_OPTS);
    mocks.subscribe.mockRejectedValueOnce(
      new Error(`Request failed: ${EXPECTED_CHANNEL}`),
    );

    publishConnection(rootMessenger, WebSocketState.CONNECTED);
    await completeAsyncOperations();
    mocks.subscribe.mockClear();
    publishConnection(rootMessenger, WebSocketState.CONNECTED);
    await completeAsyncOperations();

    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(mocks.forceReconnection).not.toHaveBeenCalled();
    expect(errors).toStrictEqual([
      {
        channel: EXPECTED_CHANNEL,
        error: `Error: Request failed: ${EXPECTED_CHANNEL}`,
        operation: 'subscribe',
      },
    ]);

    service.destroy();
  });

  it('publishes a price batch delivered on the top-level channel', async () => {
    const { messenger, mocks, rootMessenger } = getMessenger();
    const service = new MarketStatsService({ messenger });
    await service.subscribe(SUB_OPTS);

    const prices: unknown[] = [];
    rootMessenger.subscribe('MarketStatsService:pricesUpdated', (payload) => {
      prices.push(payload);
    });

    callbackFor(
      mocks,
      'market-stats.v1',
    )({
      event: 'data',
      channel: 'market-stats.v1',
      timestamp: 1_782_135_139_175,
      // The gateway sends an array. The shared message type types `data` as a record.
      data: [
        {
          assetId: 'eip155:1/slip44:60',
          currency: 'eur',
          price: 1540.38,
          pricePercentChange1d: 2.61,
        },
        { assetId: '', currency: 'eur', price: 1 },
      ] as unknown as ServerNotificationMessage['data'],
    });

    expect(prices).toStrictEqual([
      {
        updates: [
          {
            assetId: 'eip155:1/slip44:60',
            currency: 'eur',
            price: 1540.38,
            pricePercentChange1d: 2.61,
          },
        ],
        timestamp: 1_782_135_139_175,
      },
    ]);

    service.destroy();
  });

  it('publishes socket state when the shared connection changes', () => {
    const { messenger, rootMessenger } = getMessenger();
    const service = new MarketStatsService({ messenger });
    const states: WebSocketState[] = [];
    rootMessenger.subscribe(
      'MarketStatsService:connectionStateChanged',
      (payload) => {
        states.push(payload.state);
      },
    );

    publishConnection(rootMessenger, WebSocketState.CONNECTED);
    publishConnection(rootMessenger, WebSocketState.DISCONNECTED);

    expect(states).toStrictEqual([
      WebSocketState.CONNECTED,
      WebSocketState.DISCONNECTED,
    ]);

    service.destroy();
  });

  it('publishes chain status and marks tracked chains down on disconnect', async () => {
    const { messenger, mocks, rootMessenger } = getMessenger();
    const service = new MarketStatsService({ messenger });
    await service.subscribe(SUB_OPTS);
    const statuses: unknown[] = [];
    rootMessenger.subscribe(
      'MarketStatsService:chainStatusChanged',
      (payload) => {
        statuses.push(payload);
      },
    );

    callbackFor(
      mocks,
      'system-notifications.v1.market-stats.v1',
    )({
      event: 'system-notification',
      channel: 'system-notifications.v1.market-stats.v1',
      timestamp: 10,
      data: { chainIds: ['eip155:1'], status: 'up' },
    });

    publishConnection(rootMessenger, WebSocketState.DISCONNECTED);
    await completeAsyncOperations();

    expect(statuses).toStrictEqual([
      { chainIds: ['eip155:1'], status: 'up', timestamp: 10 },
      { chainIds: ['eip155:1'], status: 'down', timestamp: expect.any(Number) },
    ]);
    expect(service.getChainStatuses()).toStrictEqual([
      { chainId: 'eip155:1', status: 'down' },
    ]);

    service.destroy();
  });

  it('registers chain status and the batch callback once, on the first subscribe', async () => {
    const { messenger, mocks } = getMessenger();
    const service = new MarketStatsService({ messenger });

    await service.subscribe([]);

    expect(mocks.addChannelCallback).not.toHaveBeenCalled();

    await service.subscribe(SUB_OPTS);

    expect(mocks.addChannelCallback).toHaveBeenCalledTimes(2);
    expect(mocks.addChannelCallback).toHaveBeenCalledWith({
      channelName: 'system-notifications.v1.market-stats.v1',
      callback: expect.any(Function),
    });
    expect(mocks.addChannelCallback).toHaveBeenCalledWith({
      channelName: 'market-stats.v1',
      callback: expect.any(Function),
    });

    await service.subscribe({
      assetId: 'eip155:1/slip44:60',
      currency: 'usd',
    });

    expect(mocks.addChannelCallback).toHaveBeenCalledTimes(2);

    service.destroy();
  });

  it('removes the batch callback on destroy', async () => {
    const { messenger, mocks } = getMessenger();
    const service = new MarketStatsService({ messenger });
    await service.subscribe(SUB_OPTS);
    service.destroy();

    expect(mocks.removeChannelCallback).toHaveBeenCalledWith('market-stats.v1');
  });

  it('throws when callback registration fails and does not subscribe', async () => {
    const { messenger, mocks } = getMessenger();
    mocks.addChannelCallback.mockImplementationOnce(() => {
      throw new Error('callback registry down');
    });
    const service = new MarketStatsService({ messenger });

    await expect(service.subscribe(SUB_OPTS)).rejects.toThrow(
      'callback registry down',
    );
    expect(mocks.subscribe).not.toHaveBeenCalled();

    service.destroy();
  });

  it('subscribes each asset once and ignores an empty list', async () => {
    const { messenger, mocks } = getMessenger();
    const service = new MarketStatsService({ messenger });
    await service.subscribe([]);
    await service.subscribe([SUB_OPTS, { ...SUB_OPTS }]);

    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledWith({
      channels: [EXPECTED_CHANNEL],
      channelType: 'market-stats.v1',
      callback: expect.any(Function),
    });

    service.destroy();
  });

  it('leaves an open channel as it is when subscribe is repeated', async () => {
    const { messenger, mocks } = getMessenger();
    const service = new MarketStatsService({ messenger });
    await service.subscribe(SUB_OPTS);
    mocks.subscribe.mockClear();

    await service.subscribe([
      SUB_OPTS,
      { assetId: 'eip155:137/slip44:966', currency: 'eur' },
    ]);

    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledWith({
      channels: ['market-stats.v1.eip155:137/slip44:966.eur'],
      channelType: 'market-stats.v1',
      callback: expect.any(Function),
    });
    expect(service.getSubscriptions()).toStrictEqual([
      { assetId: 'eip155:1/slip44:60', currency: 'eur' },
      { assetId: 'eip155:137/slip44:966', currency: 'eur' },
    ]);

    await service.unsubscribe(SUB_OPTS);
    expect(service.getSubscriptions()).toStrictEqual([
      { assetId: 'eip155:137/slip44:966', currency: 'eur' },
    ]);

    service.destroy();
  });

  it('sends a checksummed erc20 address in lowercase and does not subscribe it again', async () => {
    const { messenger, mocks } = getMessenger();
    const service = new MarketStatsService({ messenger });
    const checksummed =
      'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const channel =
      'market-stats.v1.eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.usd';

    await service.subscribe({ assetId: checksummed, currency: 'USD' });

    expect(mocks.subscribe).toHaveBeenCalledWith({
      channels: [channel],
      channelType: 'market-stats.v1',
      callback: expect.any(Function),
    });
    expect(service.getSubscriptions()).toStrictEqual([
      {
        assetId: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        currency: 'usd',
      },
    ]);

    mocks.subscribe.mockClear();
    await service.subscribe([
      { assetId: checksummed, currency: 'usd' },
      {
        assetId: 'solana:101/token:SoLMint',
        currency: 'usd',
      },
    ]);

    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledWith({
      channels: ['market-stats.v1.solana:101/token:SoLMint.usd'],
      channelType: 'market-stats.v1',
      callback: expect.any(Function),
    });

    await service.unsubscribe({ assetId: checksummed, currency: 'USD' });
    expect(service.getSubscriptions()).toStrictEqual([
      { assetId: 'solana:101/token:SoLMint', currency: 'usd' },
    ]);

    service.destroy();
  });

  it('publishes a price delivered on the per-asset callback and drops empty batches', async () => {
    const { messenger, mocks, rootMessenger } = getMessenger();
    const service = new MarketStatsService({ messenger });
    await service.subscribe(SUB_OPTS);

    const prices: unknown[] = [];
    rootMessenger.subscribe('MarketStatsService:pricesUpdated', (payload) => {
      prices.push(payload);
    });

    const notify = (data: ServerNotificationMessage['data']): void => {
      (
        mocks.subscribe.mock.calls[0][0] as {
          callback: (notification: ServerNotificationMessage) => void;
        }
      ).callback({
        event: 'data',
        channel: EXPECTED_CHANNEL,
        timestamp: 5,
        data,
      });
    };

    notify({ not: 'a batch' });
    notify([null] as unknown as ServerNotificationMessage['data']);
    notify([
      {
        assetId: 'eip155:1/slip44:60',
        currency: 'eur',
        price: 1,
        pricePercentChange1d: Number.POSITIVE_INFINITY,
      },
    ] as unknown as ServerNotificationMessage['data']);

    expect(prices).toStrictEqual([
      {
        updates: [
          {
            assetId: 'eip155:1/slip44:60',
            currency: 'eur',
            price: 1,
            pricePercentChange1d: null,
          },
        ],
        timestamp: 5,
      },
    ]);

    service.destroy();
  });

  it('rejects a chain-status message that has no chains and clears a down chain', async () => {
    const { messenger, mocks, rootMessenger } = getMessenger();
    const service = new MarketStatsService({ messenger });
    await service.subscribe(SUB_OPTS);
    const statuses: unknown[] = [];
    rootMessenger.subscribe(
      'MarketStatsService:chainStatusChanged',
      (payload) => {
        statuses.push(payload);
      },
    );

    const notify = callbackFor(
      mocks,
      'system-notifications.v1.market-stats.v1',
    );

    expect(() =>
      notify({
        event: 'system-notification',
        channel: 'system-notifications.v1.market-stats.v1',
        timestamp: 1,
        data: { status: 'up' },
      }),
    ).toThrow('Invalid system notification data');

    notify({
      event: 'system-notification',
      channel: 'system-notifications.v1.market-stats.v1',
      timestamp: 2,
      data: { chainIds: ['eip155:1'], status: 'down' },
    });
    publishConnection(rootMessenger, WebSocketState.CONNECTING);
    publishConnection(rootMessenger, WebSocketState.DISCONNECTED);
    await completeAsyncOperations();

    expect(statuses).toStrictEqual([
      { chainIds: ['eip155:1'], status: 'down', timestamp: 2 },
    ]);
    expect(service.getChainStatuses()).toStrictEqual([
      { chainId: 'eip155:1', status: 'down' },
    ]);

    service.destroy();
  });

  it('logs a subscribe failure when the socket connects and channel lookup throws', async () => {
    const { messenger, mocks, rootMessenger } = getMessenger();
    mocks.subscribe.mockRejectedValueOnce(
      new Error(
        `Cannot create subscription(s) ${EXPECTED_CHANNEL}: WebSocket is DISCONNECTED`,
      ),
    );
    const service = new MarketStatsService({ messenger });
    await service.subscribe(SUB_OPTS);
    mocks.subscribe.mockClear();
    mocks.channelHasSubscription.mockImplementation(() => {
      throw new Error('lookup failed');
    });

    publishConnection(rootMessenger, WebSocketState.CONNECTED);
    await completeAsyncOperations();

    expect(mocks.subscribe).not.toHaveBeenCalled();

    service.destroy();
  });

  it('leaves every open channel as it is when subscribe is repeated', async () => {
    const { messenger, mocks } = getMessenger();
    const service = new MarketStatsService({ messenger });
    await service.subscribe(SUB_OPTS);
    mocks.subscribe.mockClear();

    await service.subscribe([SUB_OPTS, { ...SUB_OPTS }]);

    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(service.getSubscriptions()).toStrictEqual([
      { assetId: 'eip155:1/slip44:60', currency: 'eur' },
    ]);

    service.destroy();
  });

  it('unsubscribes many assets in one call', async () => {
    const { messenger } = getMessenger();
    const service = new MarketStatsService({ messenger });
    const other = { assetId: 'eip155:137/slip44:966', currency: 'eur' };
    await service.subscribe([SUB_OPTS, other]);

    await service.unsubscribe([SUB_OPTS, other]);

    expect(service.getSubscriptions()).toStrictEqual([]);

    service.destroy();
  });

  it('omits a channel that does not parse from getSubscriptions', async () => {
    const { messenger } = getMessenger();
    const service = new MarketStatsService({ messenger });

    await service.subscribe({ assetId: 'eip155:1/slip44:60', currency: '' });

    expect(service.getSubscriptions()).toStrictEqual([]);

    service.destroy();
  });

  it('publishes an unsubscribe failure without recording it as a subscribe error', async () => {
    const { messenger, mocks, rootMessenger } = getMessenger();
    const errors: unknown[] = [];
    rootMessenger.subscribe(
      'MarketStatsService:subscriptionError',
      (payload) => {
        errors.push(payload);
      },
    );
    const service = new MarketStatsService({ messenger });
    await service.subscribe(SUB_OPTS);
    mocks.getSubscriptionsByChannel.mockImplementation(() => {
      throw new Error('unsubscribe failed');
    });

    await service.unsubscribe(SUB_OPTS);
    vi.advanceTimersByTime(3000);
    await completeAsyncOperations();

    expect(errors).toStrictEqual([
      {
        channel: EXPECTED_CHANNEL,
        error: 'Error: unsubscribe failed',
        operation: 'unsubscribe',
      },
    ]);
    expect(mocks.forceReconnection).not.toHaveBeenCalled();

    service.destroy();
  });
});
