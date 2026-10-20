import { WebSocketState } from '@metamask/core-backend';
import type {
  BackendWebSocketServiceMessenger,
  ServerNotificationMessage,
  WebSocketSubscription,
} from '@metamask/core-backend';

import { parseSocialRealtimeFeedItem } from './structs.js';
import type { SocialRealtimeFeedItem } from './structs.js';

export const SOCIAL_FEED_CHANNELS = {
  all: 'social.v1.feed.all',
  trending: 'social.v1.feed.trending',
} as const;

export type SocialFeedRealtimeScope = keyof typeof SOCIAL_FEED_CHANNELS;

export const SOCIAL_FEED_CHANNEL_TYPE = 'social.v1' as const;

export type SocialFeedEvent = {
  version: 1;
  kind: 'feed-item';
  eventId: string;
  feedItemId: string;
  revision: number;
  occurredAt: string;
  data: SocialRealtimeFeedItem;
};

export type SocialFeedEventListener = (
  event: SocialFeedEvent,
  scope: SocialFeedRealtimeScope,
) => void;
export type SocialFeedReconnectListener = () => void;

export type SocialRealtimeServiceOptions = {
  messenger: BackendWebSocketServiceMessenger;
  scopes: readonly SocialFeedRealtimeScope[];
  isEnabled?: () => boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeScopes = (
  scopes: readonly SocialFeedRealtimeScope[],
): SocialFeedRealtimeScope[] => {
  const normalized = [...new Set(scopes)];
  if (normalized.length === 0) {
    throw new Error('At least one Social feed scope is required');
  }
  return normalized;
};

const scopeForChannel = (
  channel: string,
): SocialFeedRealtimeScope | undefined =>
  (Object.entries(SOCIAL_FEED_CHANNELS).find(
    ([, value]) => value === channel,
  )?.[0] as SocialFeedRealtimeScope | undefined) ?? undefined;

const parseSocialFeedEvent = (data: unknown): SocialFeedEvent | undefined => {
  if (!isRecord(data)) {
    return undefined;
  }

  const feedItem = parseSocialRealtimeFeedItem(data.data);
  if (
    data.version !== 1 ||
    data.kind !== 'feed-item' ||
    typeof data.eventId !== 'string' ||
    typeof data.feedItemId !== 'string' ||
    typeof data.revision !== 'number' ||
    typeof data.occurredAt !== 'string' ||
    feedItem === undefined
  ) {
    return undefined;
  }

  return { ...data, data: feedItem } as unknown as SocialFeedEvent;
};

const parseSocialFeedEvents = (data: unknown): SocialFeedEvent[] => {
  const entries = Array.isArray(data) ? data : [data];

  return entries
    .map((entry) => parseSocialFeedEvent(entry))
    .filter((event): event is SocialFeedEvent => event !== undefined);
};

/**
 * Social realtime subscription service built on the shared backend WebSocket.
 *
 * Clients explicitly select one or more global feed scopes. Additional Social
 * channels can be added here without creating another WebSocket connection.
 */
export class SocialRealtimeService {
  readonly name = 'SocialRealtimeService' as const;

  readonly #messenger: BackendWebSocketServiceMessenger;

  readonly #listeners = new Set<SocialFeedEventListener>();

  readonly #reconnectListeners = new Set<SocialFeedReconnectListener>();

  readonly #isEnabled: () => boolean;

  #scopes: SocialFeedRealtimeScope[];

  #scopeUpdatePromise: Promise<void> | undefined;

  #active = false;

  #subscription: WebSocketSubscription | undefined;

  #subscriptionToken: symbol | undefined;

  #subscriptionPromise: Promise<void> | undefined;

  readonly #pendingUnsubscriptions = new Set<WebSocketSubscription>();

  #connectionVersion = 0;

  #wasDisconnected = false;

  constructor({
    messenger,
    scopes,
    isEnabled = (): boolean => true,
  }: SocialRealtimeServiceOptions) {
    this.#messenger = messenger;
    this.#scopes = normalizeScopes(scopes);
    this.#isEnabled = isEnabled;

    this.#messenger.subscribe(
      'BackendWebSocketService:connectionStateChanged',
      ({ state }: { state: WebSocketState }): void => {
        if (state === WebSocketState.DISCONNECTED) {
          this.#connectionVersion += 1;
          this.#subscription = undefined;
          this.#subscriptionToken = undefined;
          this.#wasDisconnected = true;
        }

        if (state === WebSocketState.CONNECTED && this.#active) {
          const isReconnect = this.#wasDisconnected;
          this.#wasDisconnected = false;
          // eslint-disable-next-line no-void
          void this.#subscribeToFeed()
            .then(() => {
              if (isReconnect) {
                this.#reconnectListeners.forEach((listener) => listener());
              }
            })
            .catch(() => undefined);
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

  async setScopes(scopes: readonly SocialFeedRealtimeScope[]): Promise<void> {
    const normalizedScopes = normalizeScopes(scopes);

    const scopeUpdate = this.#scopeUpdatePromise
      ? this.#scopeUpdatePromise
          .catch(() => undefined)
          .then(() => this.#applyScopes(normalizedScopes))
      : this.#applyScopes(normalizedScopes);
    this.#scopeUpdatePromise = scopeUpdate;

    try {
      await scopeUpdate;
    } finally {
      if (this.#scopeUpdatePromise === scopeUpdate) {
        this.#scopeUpdatePromise = Promise.resolve();
      }
    }
  }

  async #applyScopes(
    normalizedScopes: SocialFeedRealtimeScope[],
  ): Promise<void> {
    if (!this.#active) {
      this.#scopes = normalizedScopes;
      return;
    }

    const previousScopes = this.#scopes;
    const connectionVersion = this.#connectionVersion;
    this.#scopes = normalizedScopes;

    try {
      await this.#resubscribeToFeed();
    } catch (error) {
      if (
        this.#active &&
        this.#connectionVersion === connectionVersion &&
        this.#subscription
      ) {
        this.#scopes = previousScopes;
      }
      throw error;
    }
  }

  async setActive(active: boolean): Promise<void> {
    this.#active = active && this.#isEnabled();

    if (!this.#active) {
      await this.#unsubscribeFromFeed();
      return;
    }

    await this.#retryPendingUnsubscriptions();
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
        await this.#messenger.call('BackendWebSocketService:connect');

        const subscriptionToken = Symbol('social-feed-subscription');

        // Each service needs its own callback and subscription lifecycle.
        const subscription = await this.#messenger.call(
          'BackendWebSocketService:subscribe',
          {
            channels: this.#scopes.map((scope) => SOCIAL_FEED_CHANNELS[scope]),
            channelType: SOCIAL_FEED_CHANNEL_TYPE,
            callback: (notification: ServerNotificationMessage) => {
              if (this.#subscriptionToken !== subscriptionToken) {
                return;
              }
              this.#handleNotification(notification);
            },
          },
        );

        if (!this.#active) {
          await subscription.unsubscribe();
          return;
        }

        this.#subscription = subscription;
        this.#subscriptionToken = subscriptionToken;
      },
    );
    this.#subscriptionPromise = subscriptionPromise;

    try {
      await subscriptionPromise;
    } finally {
      this.#subscriptionPromise = undefined;
    }
  }

  async #resubscribeToFeed(): Promise<void> {
    while (this.#subscriptionPromise) {
      await this.#subscriptionPromise;
    }

    await this.#retryPendingUnsubscriptions();

    const existingSubscription = this.#subscription;
    const existingSubscriptionToken = this.#subscriptionToken;
    const connectionVersion = this.#connectionVersion;
    this.#subscription = undefined;

    try {
      await this.#subscribeToFeed();
    } catch (error) {
      if (this.#active && this.#connectionVersion === connectionVersion) {
        this.#subscription = existingSubscription;
        this.#subscriptionToken = existingSubscriptionToken;
      } else {
        this.#subscription = undefined;
        this.#subscriptionToken = undefined;

        if (existingSubscription) {
          try {
            await existingSubscription.unsubscribe();
          } catch {
            this.#pendingUnsubscriptions.add(existingSubscription);
          }
        }
      }
      throw error;
    }

    const replacementSubscription = this.#subscription as
      | WebSocketSubscription
      | undefined;
    if (existingSubscription && existingSubscription !== this.#subscription) {
      try {
        await existingSubscription.unsubscribe();
      } catch (error) {
        if (this.#active && this.#connectionVersion === connectionVersion) {
          this.#subscription = existingSubscription;
          this.#subscriptionToken = existingSubscriptionToken;
        } else {
          this.#subscription = undefined;
          this.#subscriptionToken = undefined;
          this.#pendingUnsubscriptions.add(existingSubscription);
        }

        if (replacementSubscription) {
          try {
            await replacementSubscription.unsubscribe();
          } catch {
            this.#pendingUnsubscriptions.add(replacementSubscription);
          }
        }

        throw error;
      }
    }
  }

  async #unsubscribeFromFeed(): Promise<void> {
    const subscription = this.#subscription;
    this.#subscription = undefined;
    this.#subscriptionToken = undefined;

    try {
      if (subscription) {
        await subscription.unsubscribe();
      }
    } finally {
      await this.#retryPendingUnsubscriptions();
    }
  }

  async #retryPendingUnsubscriptions(): Promise<void> {
    for (const subscription of this.#pendingUnsubscriptions) {
      try {
        await subscription.unsubscribe();
        this.#pendingUnsubscriptions.delete(subscription);
      } catch {
        // Keep the subscription queued for a later cleanup attempt.
      }
    }
  }

  #handleNotification(notification: ServerNotificationMessage): void {
    const scope = scopeForChannel(notification.channel);
    if (!scope || !this.#scopes.includes(scope)) {
      return;
    }

    parseSocialFeedEvents(notification.data).forEach((event) => {
      this.#listeners.forEach((listener) => listener(event, scope));
    });
  }
}
