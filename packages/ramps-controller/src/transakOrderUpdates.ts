import Pusher, { type Channel } from 'pusher-js';

/**
 * Transak Pusher Channels app credentials (public; see Transak WebSockets docs).
 */
export const TRANSAK_PUSHER_KEY = '1d9ffac87de599c61283';
export const TRANSAK_PUSHER_CLUSTER = 'ap2';

export const TRANSAK_NATIVE_PROVIDER_IDS = new Set([
  'transak-native',
  'transak-native-staging',
  '/providers/transak-native',
  '/providers/transak-native-staging',
]);

/**
 * Returns whether a provider ID refers to Transak Native (prod or staging).
 *
 * Accepts both canonical IDs (`transak-native`) and path-prefixed IDs
 * (`/providers/transak-native`).
 *
 * @param providerId - Provider id from a ramps order or providers list.
 * @returns True when the provider is Transak Native.
 */
export function isTransakNativeProvider(providerId?: string): boolean {
  if (!providerId) {
    return false;
  }
  if (TRANSAK_NATIVE_PROVIDER_IDS.has(providerId)) {
    return true;
  }
  const segment = providerId.startsWith('/providers/')
    ? providerId.slice('/providers/'.length)
    : providerId;
  return (
    segment === 'transak-native' || segment === 'transak-native-staging'
  );
}

export type TransakOrderUpdateEvent = {
  orderId: string;
  eventName: string;
  status?: string;
};

export type TransakOrderUpdateListener = (
  event: TransakOrderUpdateEvent,
) => void;

/**
 * Client that subscribes to Transak public order-ID Pusher channels.
 */
export type TransakOrderUpdatesClient = {
  subscribeOrder: (
    orderId: string,
    onUpdate: TransakOrderUpdateListener,
  ) => void;
  unsubscribeOrder: (orderId: string) => void;
  unsubscribeAll: () => void;
  isConnected: () => boolean;
  destroy: () => void;
};

type ChannelSubscription = {
  channel: Channel;
  listener: TransakOrderUpdateListener;
};

type PusherLike = {
  subscribe: (channelName: string) => Channel;
  unsubscribe: (channelName: string) => void;
  disconnect: () => void;
  connection: { state: string };
};

export type CreatePusherTransakOrderUpdatesClientOptions = {
  /**
   * Optional factory for injecting a mock Pusher in tests.
   */
  createPusher?: (key: string, options: { cluster: string }) => PusherLike;
};

/**
 * Default Pusher factory used when no test inject is provided.
 *
 * @param key - Pusher app key.
 * @param options - Pusher client options.
 * @returns A Pusher-like client instance.
 */
export function createDefaultPusher(
  key: string,
  options: { cluster: string },
): PusherLike {
  return new Pusher(key, options) as unknown as PusherLike;
}

/**
 * Creates a Transak order-updates client backed by Pusher Channels.
 *
 * Subscribes to the public channel named with the Transak order UUID.
 * Payloads are treated as wake-up signals; callers should refresh via the
 * MetaMask on-ramp API for normalized status.
 *
 * @param options - Optional overrides (e.g. mock Pusher factory for tests).
 * @returns A {@link TransakOrderUpdatesClient}.
 */
export function createPusherTransakOrderUpdatesClient(
  options: CreatePusherTransakOrderUpdatesClientOptions = {},
): TransakOrderUpdatesClient {
  const createPusher = options.createPusher ?? createDefaultPusher;

  let pusher: PusherLike | null = null;
  const subscriptions = new Map<string, ChannelSubscription>();

  const ensurePusher = (): PusherLike => {
    if (!pusher) {
      pusher = createPusher(TRANSAK_PUSHER_KEY, {
        cluster: TRANSAK_PUSHER_CLUSTER,
      });
    }
    return pusher;
  };

  const subscribeOrder = (
    orderId: string,
    onUpdate: TransakOrderUpdateListener,
  ): void => {
    if (!orderId || subscriptions.has(orderId)) {
      return;
    }

    const instance = ensurePusher();
    const channel = instance.subscribe(orderId);

    const handler = (eventName: string, data: unknown): void => {
      if (eventName.startsWith('pusher:')) {
        return;
      }
      const status =
        data &&
        typeof data === 'object' &&
        'status' in data &&
        typeof (data as { status: unknown }).status === 'string'
          ? (data as { status: string }).status
          : undefined;
      onUpdate({ orderId, eventName, status });
    };

    channel.bind_global(handler);
    subscriptions.set(orderId, { channel, listener: onUpdate });
  };

  const unsubscribeOrder = (orderId: string): void => {
    const subscription = subscriptions.get(orderId);
    if (!subscription || !pusher) {
      return;
    }
    subscription.channel.unbind_all();
    pusher.unsubscribe(orderId);
    subscriptions.delete(orderId);

    if (subscriptions.size === 0) {
      pusher.disconnect();
      pusher = null;
    }
  };

  const unsubscribeAll = (): void => {
    for (const orderId of [...subscriptions.keys()]) {
      unsubscribeOrder(orderId);
    }
  };

  const isConnected = (): boolean => {
    if (!pusher) {
      return false;
    }
    return pusher.connection.state === 'connected';
  };

  const destroy = (): void => {
    unsubscribeAll();
  };

  return {
    subscribeOrder,
    unsubscribeOrder,
    unsubscribeAll,
    isConnected,
    destroy,
  };
}
