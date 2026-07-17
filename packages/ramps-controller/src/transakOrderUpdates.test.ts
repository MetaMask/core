import type { Channel } from 'pusher-js';
import Pusher from 'pusher-js';

import {
  TRANSAK_PUSHER_CLUSTER,
  TRANSAK_PUSHER_KEY,
  createDefaultPusher,
  createPusherTransakOrderUpdatesClient,
  isTransakNativeProvider,
} from './transakOrderUpdates';

jest.mock('pusher-js', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockPusherConstructor = Pusher as unknown as jest.Mock;

describe('isTransakNativeProvider', () => {
  it.each([
    ['transak-native', true],
    ['transak-native-staging', true],
    ['/providers/transak-native', true],
    ['/providers/transak-native-staging', true],
    ['transak', false],
    ['/providers/transak', false],
    ['moonpay', false],
    [undefined, false],
    ['', false],
  ])('%s -> %s', (providerId, expected) => {
    expect(isTransakNativeProvider(providerId)).toBe(expected);
  });
});

describe('createDefaultPusher', () => {
  beforeEach(() => {
    mockPusherConstructor.mockReset();
  });

  it('constructs a Pusher instance with the Transak key and cluster', () => {
    const instance = { connection: { state: 'connected' } };
    mockPusherConstructor.mockImplementation(() => instance);

    expect(createDefaultPusher(TRANSAK_PUSHER_KEY, { cluster: 'ap2' })).toBe(
      instance,
    );
    expect(mockPusherConstructor).toHaveBeenCalledWith(TRANSAK_PUSHER_KEY, {
      cluster: 'ap2',
    });
  });
});

describe('createPusherTransakOrderUpdatesClient', () => {
  const createMockChannel = () => {
    return {
      bind_global: jest.fn(),
      unbind_all: jest.fn(),
    } as unknown as Channel & {
      bind_global: jest.Mock;
      unbind_all: jest.Mock;
    };
  };

  beforeEach(() => {
    mockPusherConstructor.mockReset();
  });

  it('uses createDefaultPusher when no factory is provided', () => {
    const channel = createMockChannel();
    const subscribe = jest.fn(() => channel);
    const unsubscribe = jest.fn();
    const disconnect = jest.fn();
    mockPusherConstructor.mockImplementation(() => ({
      subscribe,
      unsubscribe,
      disconnect,
      connection: { state: 'connected' },
    }));

    const client = createPusherTransakOrderUpdatesClient();
    client.subscribeOrder('order-default', jest.fn());

    expect(mockPusherConstructor).toHaveBeenCalledWith(TRANSAK_PUSHER_KEY, {
      cluster: TRANSAK_PUSHER_CLUSTER,
    });
    expect(subscribe).toHaveBeenCalledWith('order-default');
  });

  it('subscribes to the order-ID channel and forwards non-pusher events', () => {
    const channel = createMockChannel();
    const subscribe = jest.fn(() => channel);
    const createPusher = jest.fn(() => ({
      subscribe,
      unsubscribe: jest.fn(),
      disconnect: jest.fn(),
      connection: { state: 'connected' },
    }));

    const client = createPusherTransakOrderUpdatesClient({ createPusher });
    const onUpdate = jest.fn();

    client.subscribeOrder('order-123', onUpdate);

    expect(createPusher).toHaveBeenCalledWith(TRANSAK_PUSHER_KEY, {
      cluster: TRANSAK_PUSHER_CLUSTER,
    });
    expect(subscribe).toHaveBeenCalledWith('order-123');
    expect(channel.bind_global).toHaveBeenCalledTimes(1);

    const handler = channel.bind_global.mock.calls[0][0] as (
      eventName: string,
      data: unknown,
    ) => void;

    handler('pusher:subscription_succeeded', {});
    expect(onUpdate).not.toHaveBeenCalled();

    handler('ORDER_PROCESSING', { status: 'PROCESSING' });
    expect(onUpdate).toHaveBeenCalledWith({
      orderId: 'order-123',
      eventName: 'ORDER_PROCESSING',
      status: 'PROCESSING',
    });

    handler('ORDER_FAILED', null);
    expect(onUpdate).toHaveBeenCalledWith({
      orderId: 'order-123',
      eventName: 'ORDER_FAILED',
      status: undefined,
    });

    handler('ORDER_FAILED', { status: 123 });
    expect(onUpdate).toHaveBeenLastCalledWith({
      orderId: 'order-123',
      eventName: 'ORDER_FAILED',
      status: undefined,
    });
  });

  it('ignores empty order IDs and duplicate subscriptions', () => {
    const subscribe = jest.fn(() => createMockChannel());
    const client = createPusherTransakOrderUpdatesClient({
      createPusher: () => ({
        subscribe,
        unsubscribe: jest.fn(),
        disconnect: jest.fn(),
        connection: { state: 'connecting' },
      }),
    });

    client.subscribeOrder('', jest.fn());
    client.subscribeOrder('order-1', jest.fn());
    client.subscribeOrder('order-1', jest.fn());

    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('no-ops unsubscribeOrder when the order is not subscribed', () => {
    const unsubscribe = jest.fn();
    const client = createPusherTransakOrderUpdatesClient({
      createPusher: () => ({
        subscribe: jest.fn(() => createMockChannel()),
        unsubscribe,
        disconnect: jest.fn(),
        connection: { state: 'connected' },
      }),
    });

    client.unsubscribeOrder('missing');
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('disconnects when the last subscription is removed', () => {
    const channel = createMockChannel();
    const unsubscribe = jest.fn();
    const disconnect = jest.fn();
    const client = createPusherTransakOrderUpdatesClient({
      createPusher: () => ({
        subscribe: jest.fn(() => channel),
        unsubscribe,
        disconnect,
        connection: { state: 'connected' },
      }),
    });

    client.subscribeOrder('order-1', jest.fn());
    expect(client.isConnected()).toBe(true);

    client.unsubscribeOrder('order-1');

    expect(channel.unbind_all).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledWith('order-1');
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(client.isConnected()).toBe(false);
  });

  it('unsubscribeAll and destroy remove every subscription', () => {
    const subscribe = jest
      .fn()
      .mockReturnValueOnce(createMockChannel())
      .mockReturnValueOnce(createMockChannel());
    const unsubscribe = jest.fn();
    const disconnect = jest.fn();
    const client = createPusherTransakOrderUpdatesClient({
      createPusher: () => ({
        subscribe,
        unsubscribe,
        disconnect,
        connection: { state: 'connected' },
      }),
    });

    client.subscribeOrder('a', jest.fn());
    client.subscribeOrder('b', jest.fn());
    client.destroy();

    expect(unsubscribe).toHaveBeenCalledWith('a');
    expect(unsubscribe).toHaveBeenCalledWith('b');
    expect(disconnect).toHaveBeenCalled();
  });
});
