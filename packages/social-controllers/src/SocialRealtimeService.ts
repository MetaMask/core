import { WebSocketState } from '@metamask/core-backend';
import type {
  BackendWebSocketServiceMessenger,
  ServerNotificationMessage,
  WebSocketSubscription,
} from '@metamask/core-backend';

import type { FeedItem } from './social-types.js';

export const SOCIAL_FEED_CHANNEL = 'social.v1.feed.all' as const;
export const SOCIAL_FEED_CHANNEL_TYPE = 'social.v1' as const;

export type SocialFeedEvent = {
  version: 1;
  kind: 'feed-item';
  eventId: string;
  feedItemId: string;
  revision: number;
  occurredAt: string;
  data: FeedItem;
};

export type SocialFeedEventListener = (event: SocialFeedEvent) => void;
export type SocialFeedReconnectListener = () => void;

export type SocialRealtimeServiceOptions = {
  messenger: BackendWebSocketServiceMessenger;
  isEnabled?: () => boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseSocialFeedEvent = (
  data: Record<string, unknown>,
): SocialFeedEvent | undefined => {
  if (
    data.version !== 1 ||
    data.kind !== 'feed-item' ||
    typeof data.eventId !== 'string' ||
    typeof data.feedItemId !== 'string' ||
    typeof data.revision !== 'number' ||
    typeof data.occurredAt !== 'string' ||
    !isRecord(data.data)
  ) {
    return undefined;
  }

  return data as unknown as SocialFeedEvent;
};

/**
 * Social realtime subscription service built on the shared backend WebSocket.
 *
 * The POC subscribes to the global feed channel. Additional Social channels
 * can be added here without creating another WebSocket connection.
 */
export class SocialRealtimeService {
  readonly name = 'SocialRealtimeService' as const;

  readonly #messenger: BackendWebSocketServiceMessenger;

  readonly #listeners = new Set<SocialFeedEventListener>();

  readonly #reconnectListeners = new Set<SocialFeedReconnectListener>();

  readonly #isEnabled: () => boolean;

  #active = false;

  #subscription: WebSocketSubscription | undefined;

  #subscriptionPromise: Promise<void> | undefined;

  #wasDisconnected = false;

  constructor({
    messenger,
    isEnabled = (): boolean => true,
  }: SocialRealtimeServiceOptions) {
    this.#messenger = messenger;
    this.#isEnabled = isEnabled;

    this.#messenger.subscribe(
      'BackendWebSocketService:connectionStateChanged',
      ({ state }: { state: WebSocketState }): void => {
        if (state === WebSocketState.DISCONNECTED) {
          this.#subscription = undefined;
          this.#wasDisconnected = true;
        }

        if (state === WebSocketState.CONNECTED && this.#active) {
          const isReconnect = this.#wasDisconnected;
          this.#wasDisconnected = false;
          // Subscription setup handles its own errors and must not block reconnect handling.
          // eslint-disable-next-line no-void
          void this.#subscribeToFeed();

          if (isReconnect) {
            this.#reconnectListeners.forEach((listener) => listener());
          }
        }
      },
    );
  }

  addListener(listener: SocialFeedEventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  addReconnectListener(listener: SocialFeedReconnectListener): () => void {
    this.#reconnectListeners.add(listener);
    return () => this.#reconnectListeners.delete(listener);
  }

  async setActive(active: boolean): Promise<void> {
    this.#active = active && this.#isEnabled();

    if (!this.#active) {
      await this.#unsubscribeFromFeed();
      return;
    }

    await this.#subscribeToFeed();
  }

  async #subscribeToFeed(): Promise<void> {
    if (!this.#active || this.#subscription) {
      return;
    }

    while (this.#subscriptionPromise) {
      await this.#subscriptionPromise;

      if (!this.#active || this.#subscription) {
        return;
      }
    }

    const subscriptionPromise = Promise.resolve().then(
      async (): Promise<void> => {
        try {
          await this.#messenger.call('BackendWebSocketService:connect');

          // Each service needs its own callback and subscription lifecycle.
          const subscription = await this.#messenger.call(
            'BackendWebSocketService:subscribe',
            {
              channels: [SOCIAL_FEED_CHANNEL],
              channelType: SOCIAL_FEED_CHANNEL_TYPE,
              callback: (notification: ServerNotificationMessage) => {
                this.#handleNotification(notification);
              },
            },
          );

          if (!this.#active) {
            await subscription.unsubscribe();
            return;
          }

          this.#subscription = subscription;
        } catch {
          this.#subscription = undefined;
        }
      },
    );
    this.#subscriptionPromise = subscriptionPromise;

    try {
      await subscriptionPromise;
    } finally {
      this.#subscriptionPromise = undefined;
    }
  }

  async #unsubscribeFromFeed(): Promise<void> {
    const subscription = this.#subscription;
    this.#subscription = undefined;

    if (subscription) {
      await subscription.unsubscribe();
    }
  }

  #handleNotification(notification: ServerNotificationMessage): void {
    if (notification.channel !== SOCIAL_FEED_CHANNEL) {
      return;
    }

    const event = parseSocialFeedEvent(notification.data);
    if (!event) {
      return;
    }

    this.#listeners.forEach((listener) => listener(event));
  }
}
