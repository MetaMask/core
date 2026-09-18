import type { KeyringControllerUnlockEvent } from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';

import { projectLogger, createModuleLogger } from '../logger.js';
import type { BackendWebSocketServiceMethodActions } from './BackendWebSocketService-method-action-types.js';
import type {
  BackendWebSocketServiceConnectionStateChangedEvent,
  ServerNotificationMessage,
  WebSocketConnectionInfo,
} from './BackendWebSocketService.js';
import { WebSocketState } from './BackendWebSocketService.js';

const SERVICE_NAME = 'AutorampActivityService';
const SUBSCRIPTION_NAMESPACE = 'autoramp-activity.v1';
const MESSENGER_EXPOSED_METHODS = [] as const;

const log = createModuleLogger(projectLogger, SERVICE_NAME);

export const AUTORAMP_ACTIVITY_CATEGORIES = [
  'customer',
  'autoramp',
  'transaction',
  'identification',
  'fiat_address',
  'unknown',
] as const;

export type AutorampActivityCategory =
  (typeof AUTORAMP_ACTIVITY_CATEGORIES)[number];

export type AutorampActivityEntity = {
  id: string;
  kind?: string;
  status?: string;
  transactionStatus?: string;
  transactionHash?: string;
};

export type AutorampActivityEvent = {
  eventId: string;
  type: string;
  category: AutorampActivityCategory;
  occurredAt: string;
  entity: AutorampActivityEntity | null;
  needsFetch: boolean;
};

export type AutorampActivityServiceOptions = {
  messenger: AutorampActivityServiceMessenger;
};

export type AutorampActivityServiceActions = never;

export const AUTORAMP_ACTIVITY_SERVICE_ALLOWED_ACTIONS = [
  'AuthenticationController:getSessionProfile',
  'BackendWebSocketService:connect',
  'BackendWebSocketService:subscribe',
  'BackendWebSocketService:getConnectionInfo',
  'BackendWebSocketService:channelHasSubscription',
  'BackendWebSocketService:findSubscriptionsByChannelPrefix',
] as const;

export const AUTORAMP_ACTIVITY_SERVICE_ALLOWED_EVENTS = [
  'AuthenticationController:stateChange',
  'AuthenticationController:profileSignIn',
  'BackendWebSocketService:connectionStateChanged',
  'KeyringController:unlock',
] as const;

export type AutorampActivityServiceAllowedActions =
  | AuthenticationController.AuthenticationControllerGetSessionProfileAction
  | BackendWebSocketServiceMethodActions;

export type AutorampActivityServiceEventReceivedEvent = {
  type: 'AutorampActivityService:eventReceived';
  payload: [AutorampActivityEvent];
};

export type AutorampActivityServiceStatusChangedEvent = {
  type: 'AutorampActivityService:statusChanged';
  payload: [{ status: WebSocketState }];
};

export type AutorampActivityServiceEvents =
  | AutorampActivityServiceEventReceivedEvent
  | AutorampActivityServiceStatusChangedEvent;

export type AutorampActivityServiceAllowedEvents =
  | AuthenticationController.AuthenticationControllerStateChangeEvent
  | AuthenticationController.AuthenticationControllerProfileSignInEvent
  | BackendWebSocketServiceConnectionStateChangedEvent
  | KeyringControllerUnlockEvent;

export type AutorampActivityServiceMessenger = Messenger<
  typeof SERVICE_NAME,
  AutorampActivityServiceActions | AutorampActivityServiceAllowedActions,
  AutorampActivityServiceEvents | AutorampActivityServiceAllowedEvents
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getHasOwnProperty = (
  value: Record<string, unknown>,
  key: string,
): boolean => Object.prototype.hasOwnProperty.call(value, key);

const getOptionalString = (
  value: Record<string, unknown>,
  key: string,
): string | undefined | false => {
  const property = value[key];
  if (property === undefined) {
    return undefined;
  }
  return typeof property === 'string' ? property : false;
};

const parseEntity = (value: unknown): AutorampActivityEntity | null | false => {
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || typeof value.id !== 'string') {
    return false;
  }

  const kind = getOptionalString(value, 'kind');
  const status = getOptionalString(value, 'status');
  const transactionStatus = getOptionalString(value, 'transactionStatus');
  const transactionHash = getOptionalString(value, 'transactionHash');
  if (
    kind === false ||
    status === false ||
    transactionStatus === false ||
    transactionHash === false
  ) {
    return false;
  }

  return {
    id: value.id,
    ...(kind === undefined ? {} : { kind }),
    ...(status === undefined ? {} : { status }),
    ...(transactionStatus === undefined ? {} : { transactionStatus }),
    ...(transactionHash === undefined ? {} : { transactionHash }),
  };
};

const parseAutorampActivityEvent = (
  value: unknown,
): AutorampActivityEvent | undefined => {
  if (
    !isRecord(value) ||
    typeof value.eventId !== 'string' ||
    typeof value.type !== 'string' ||
    !AUTORAMP_ACTIVITY_CATEGORIES.includes(
      value.category as AutorampActivityCategory,
    ) ||
    typeof value.occurredAt !== 'string' ||
    typeof value.needsFetch !== 'boolean' ||
    getHasOwnProperty(value, 'payload') ||
    getHasOwnProperty(value, 'customerId') ||
    getHasOwnProperty(value, 'userId')
  ) {
    return undefined;
  }

  const entity = parseEntity(value.entity);
  if (entity === false) {
    return undefined;
  }

  return {
    eventId: value.eventId,
    type: value.type,
    category: value.category as AutorampActivityCategory,
    occurredAt: value.occurredAt,
    entity,
    needsFetch: value.needsFetch,
  };
};

/**
 * Subscribes to profile-scoped Autoramp activity through
 * {@link BackendWebSocketService}. The service owns no domain state; it only
 * tracks its subscription lifecycle and publishes validated notifications.
 */
export class AutorampActivityService {
  readonly name = SERVICE_NAME;

  readonly #messenger: AutorampActivityServiceMessenger;

  #isDestroyed = false;

  constructor({ messenger }: AutorampActivityServiceOptions) {
    this.#messenger = messenger;
    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    this.#messenger.subscribe(
      'BackendWebSocketService:connectionStateChanged',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (connectionInfo: WebSocketConnectionInfo) =>
        await this.#handleConnectionStateChange(connectionInfo),
    );
    this.#messenger.subscribe(
      'AuthenticationController:stateChange',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (isSignedIn: boolean) =>
        await this.#handleAuthenticationStateChange(isSignedIn),
      // Messenger compares selector results with `!==`. Return the boolean
      // primitive so token/session writes do not resubscribe.
      (state: AuthenticationController.AuthenticationControllerState) =>
        state.isSignedIn,
    );
    this.#messenger.subscribe(
      'AuthenticationController:profileSignIn',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async () => await this.#replaceSubscription(),
    );
    this.#messenger.subscribe(
      'KeyringController:unlock',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async () => await this.#replaceSubscription(),
    );
  }

  /**
   * Connect and subscribe for the current authentication profile.
   */
  async init(): Promise<void> {
    await this.#replaceSubscription();
  }

  async #handleConnectionStateChange(
    connectionInfo: WebSocketConnectionInfo,
  ): Promise<void> {
    if (this.#isDestroyed) {
      return;
    }

    this.#messenger.publish('AutorampActivityService:statusChanged', {
      status: connectionInfo.state,
    });

    if (connectionInfo.state === WebSocketState.CONNECTED) {
      await this.#subscribeToCurrentProfile();
    }
  }

  async #handleAuthenticationStateChange(isSignedIn: boolean): Promise<void> {
    if (isSignedIn) {
      await this.#replaceSubscription();
    } else {
      await this.#unsubscribeAll();
    }
  }

  async #replaceSubscription(): Promise<void> {
    if (this.#isDestroyed) {
      return;
    }

    await this.#unsubscribeAll();
    await this.#subscribeToCurrentProfile();
  }

  async #subscribeToCurrentProfile(): Promise<void> {
    if (this.#isDestroyed) {
      return;
    }

    try {
      await this.#messenger.call('BackendWebSocketService:connect');
      const profile = await this.#messenger.call(
        'AuthenticationController:getSessionProfile',
      );
      const profileId = this.#getChannelProfileId(profile);
      if (!profileId || this.#isDestroyed) {
        return;
      }

      const channel = `${SUBSCRIPTION_NAMESPACE}.${profileId}`;
      const connectionInfo = this.#messenger.call(
        'BackendWebSocketService:getConnectionInfo',
      );
      if (connectionInfo.state !== WebSocketState.CONNECTED) {
        return;
      }

      if (
        this.#messenger.call(
          'BackendWebSocketService:channelHasSubscription',
          channel,
        )
      ) {
        return;
      }

      if (this.#isDestroyed) {
        return;
      }

      await this.#messenger.call('BackendWebSocketService:subscribe', {
        channels: [channel],
        channelType: SUBSCRIPTION_NAMESPACE,
        callback: (notification: ServerNotificationMessage) =>
          this.#handleNotification(notification),
      });
    } catch (error) {
      log('Unable to subscribe to Autoramp activity', { error });
    }
  }

  #getChannelProfileId(profile: {
    canonicalProfileId?: string;
    profileId?: string;
  }): string | undefined {
    const canonical = profile.canonicalProfileId;
    if (typeof canonical === 'string' && canonical.length > 0) {
      return canonical;
    }

    const profileId = profile.profileId;
    return typeof profileId === 'string' && profileId.length > 0
      ? profileId
      : undefined;
  }

  #handleNotification(notification: ServerNotificationMessage): void {
    const event = parseAutorampActivityEvent(notification.data);
    if (!event) {
      log('Ignoring malformed Autoramp activity event', {
        channel: notification.channel,
      });
      return;
    }

    this.#messenger.publish('AutorampActivityService:eventReceived', event);
  }

  async #unsubscribeAll(): Promise<void> {
    const subscriptions = this.#messenger.call(
      'BackendWebSocketService:findSubscriptionsByChannelPrefix',
      SUBSCRIPTION_NAMESPACE,
    );

    for (const subscription of subscriptions) {
      await subscription.unsubscribe();
    }
  }

  /**
   * Stop future subscriptions and remove all active Autoramp subscriptions.
   */
  async destroy(): Promise<void> {
    this.#isDestroyed = true;
    await this.#unsubscribeAll();
  }
}
