import type { Patch } from 'immer';
import { nanoid } from 'nanoid';

import { hasProperty } from '../util';
import { BaseController } from '../BaseControllerV2';

import type { RestrictedControllerMessenger } from '../ControllerMessenger';

/**
 * @type NotificationState
 * @property notifications - Stores existing notifications to be shown in the UI
 */
export type NotificationState = {
  notifications: Record<string, Notification>;
};

export type Notification = {
  id: string;
  type: NotificationType;
  origin: string;
  date: number;
  read: boolean;
  message: string;
};

export enum NotificationType {
  Native = 'native',
  InApp = 'in-app',
}

export interface NotificationArgs {
  /**
   * Enum type to determine notification type.
   */
  type: NotificationType;

  /**
   * A message to show on the notification.
   */
  message: string;
}

const name = 'NotificationController';

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

export type DismissNotification = {
  type: `${typeof name}:dismiss`;
  handler: NotificationController['dismiss'];
};

export type MarkNotificationRead = {
  type: `${typeof name}:markRead`;
  handler: NotificationController['markRead'];
};

export type GetNotifications = {
  type: `${typeof name}:getNotifications`;
  handler: NotificationController['getNotifications'];
};

export type GetNotificationCount = {
  type: `${typeof name}:getCount`;
  handler: NotificationController['getCount'];
};

export type GetUnreadNotificationCount = {
  type: `${typeof name}:getUnreadCount`;
  handler: NotificationController['getUnreadCount'];
};

export type ControllerActions =
  | GetNotificationState
  | ShowNotification
  | DismissNotification
  | MarkNotificationRead
  | GetNotifications
  | GetNotificationCount
  | GetUnreadNotificationCount;

export type NotificationMessenger = RestrictedControllerMessenger<
  typeof name,
  ControllerActions,
  NotificationStateChange,
  never,
  never
>;

const metadata = {
  notifications: { persist: true, anonymous: false },
};

const defaultState = {
  notifications: {},
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

  /**
   * Creates a NotificationController instance.
   *
   * @param options - Constructor options.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   * @param options.showNativeNotification - Function that shows a native notification in the consumer
   */
  constructor({
    messenger,
    state,
    showNativeNotification,
  }: {
    messenger: NotificationMessenger;
    state?: Partial<NotificationState>;
    showNativeNotification: (origin: string, message: string) => void;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.showNativeNotification = showNativeNotification;

    this.messagingSystem.registerActionHandler(
      `${name}:show` as const,
      (origin: string, args: NotificationArgs) => this.show(origin, args),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:dismiss` as const,
      (ids: string[]) => this.dismiss(ids),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:markRead` as const,
      (ids: string[]) => this.markRead(ids),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:getNotifications` as const,
      () => this.getNotifications(),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:getCount` as const,
      () => this.getCount(),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:getUnreadCount` as const,
      () => this.getUnreadCount(),
    );
  }

  /**
   * Shows a notification.
   *
   * @param origin - The origin trying to send a notification
   * @param args - Notification arguments, containing the notification message etc.
   */
  show(origin: string, args: NotificationArgs) {
    switch (args.type) {
      case NotificationType.Native:
        this.showNativeNotification(origin, args.message);
        break;
      case NotificationType.InApp:
        this.add(origin, args.message);
        break;
      default:
        throw new Error('Invalid notification type');
    }
  }

  private add(origin: string, message: string) {
    const id = nanoid();
    const notification = {
      id,
      type: NotificationType.InApp,
      origin,
      date: Date.now(),
      read: false,
      message,
    };
    this.update((state) => {
      state.notifications[id] = notification;
    });
  }

  /**
   * Dimisses a list of notifications.
   *
   * @param ids - A list of notification IDs
   */
  dismiss(ids: string[]) {
    this.update((state) => {
      for (const id of ids) {
        if (hasProperty(state.notifications, id)) {
          delete state.notifications[id];
        }
      }
    });
  }

  /**
   * Marks a list of notifications as read.
   *
   * @param ids - A list of notification IDs
   */
  markRead(ids: string[]) {
    this.update((state) => {
      for (const id of ids) {
        if (hasProperty(state.notifications, id)) {
          state.notifications[id].read = true;
        }
      }
    });
  }

  /**
   * Gets the notifications.
   *
   * @returns The notifications
   */
  getNotifications() {
    return Object.values(this.state.notifications);
  }

  /**
   * Gets the current number of notifications.
   *
   * @returns The number of current notifications
   */
  getCount() {
    return this.getNotifications().length;
  }

  /**
   * Gets the current number of unread notifications.
   *
   * @returns The number of current notifications
   */
  getUnreadCount() {
    return this.getNotifications().filter((n) => !n.read).length;
  }
}
