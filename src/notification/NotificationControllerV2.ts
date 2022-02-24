import type { Patch } from 'immer';

import { BaseController } from '../BaseControllerV2';

import type { RestrictedControllerMessenger } from '../ControllerMessenger';
import type { GetSubjectMetadataState } from '../subject-metadata';

/**
 * @type NotificationState
 * @property requests - Object containing number of requests in a given interval and a timeout id
 */
export type NotificationState = {
  requests: Record<string, number>;
};

export enum NotificationType {
  Native = 'native',
}

export interface NotificationArgs {
  /**
   * @todo
   */
  type: NotificationType;

  /**
   * @todo
   */
  message: string;
}

const name = 'NotificationControllerV2';

export type NotificationStateChange = {
  type: `${typeof name}:stateChange`;
  payload: [NotificationState, Patch[]];
};

export type GetNotificationState = {
  type: `${typeof name}:getState`;
  handler: () => NotificationState;
};

export type ShowNotification = {
  type: `${typeof name}:show`;
  handler: NotificationController['show'];
};

export type ControllerActions = GetNotificationState | ShowNotification;

type AllowedActions = GetSubjectMetadataState;

export type NotificationMessenger = RestrictedControllerMessenger<
  typeof name,
  ControllerActions | AllowedActions,
  NotificationStateChange,
  AllowedActions['type'],
  never
>;

const metadata = {
  requests: { persist: false, anonymous: false },
};

const defaultState = {
  requests: {},
};

/**
 * Controller that handles showing notifications to the user and rate limiting origins
 */
export class NotificationController extends BaseController<
  typeof name,
  NotificationState,
  NotificationMessenger
> {
  private showNativeNotification;

  private rateLimitTimeout;

  private rateLimitCount;

  /**
   * Creates a NotificationController instance.
   *
   * @param options - Constructor options.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   * @param options.showNativeNotification - Function that shows a native notification in the consumer
   * @param options.rateLimitTimeout - The time window in which the rate limit is applied
   * @param options.rateLimitCount - The amount of notifications an origin can show in the rate limit time window
   */
  constructor({
    rateLimitTimeout = 5000,
    rateLimitCount = 3,
    messenger,
    state,
    showNativeNotification,
  }: {
    rateLimitTimeout?: number;
    rateLimitCount?: number;
    messenger: NotificationMessenger;
    state?: Partial<NotificationState>;
    showNativeNotification: (
      title: string,
      message: string,
      url?: string,
    ) => void;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.showNativeNotification = showNativeNotification;
    this.rateLimitTimeout = rateLimitTimeout;
    this.rateLimitCount = rateLimitCount;

    this.messagingSystem.registerActionHandler(
      `${name}:show` as const,
      (origin: string, args: NotificationArgs) => this.show(origin, args),
    );
  }

  /**
   * Shows a notification if origin is not rate-limited.
   *
   * @param origin - The origin trying to send a notification
   * @param args - Notification arguments, containing the notification message etc.
   * @returns False if rate-limited, true if not
   */
  show(origin: string, args: NotificationArgs) {
    if (this._isRateLimited(origin)) {
      return false;
    }
    this._recordRequest(origin);

    const subjectMetadataState = this.messagingSystem.call(
      'SubjectMetadataController:getState',
    );

    const originMetadata = subjectMetadataState.subjectMetadata[origin];

    switch (args.type) {
      case NotificationType.Native:
        this.showNativeNotification(
          originMetadata?.name ?? origin,
          args.message,
        );
        break;
      default:
        throw new Error('Invalid notification type');
    }

    return true;
  }

  _isRateLimited(origin: string) {
    return this.state.requests[origin] >= this.rateLimitCount;
  }

  _recordRequest(origin: string) {
    this.update((state) => {
      state.requests[origin] = (state.requests[origin] ?? 0) + 1;
      setTimeout(() => this._resetRequestCount(origin), this.rateLimitTimeout);
    });
  }

  _resetRequestCount(origin: string) {
    this.update((state) => {
      state.requests[origin] = 0;
    });
  }
}
