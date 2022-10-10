import type { Patch } from 'immer';
import { nanoid } from 'nanoid';
import { hasProperty } from '@metamask/controller-utils';
import {
  BaseControllerV2,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';

/**
 * @typedef NotificationControllerState
 * @property notifications - Stores existing notifications to be shown in the UI
 */
export type NotificationControllerState = {
  notifications: Record<string, Notification>;
};

/**
 * @typedef Notification - Stores information about in-app notifications, to be shown in the UI
 * @property id - A UUID that identifies the notification
 * @property origin - The origin that requested the notification
 * @property createdDate - The notification creation date in milliseconds elapsed since the UNIX epoch
 * @property readDate - The notification read date in milliseconds elapsed since the UNIX epoch or null if unread
 * @property message - The notification message
 */
export type Notification = {
  id: string;
  origin: string;
  createdDate: number;
  readDate: number | null;
  message: string;
};

const name = 'NotificationController';

export type NotificationControllerStateChange = {
  type: `${typeof name}:stateChange`;
  payload: [NotificationControllerState, Patch[]];
};

export type GetNotificationControllerState = {
  type: `${typeof name}:getState`;
  handler: () => NotificationControllerState;
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

export type NotificationControllerActions =
  | GetNotificationControllerState
  | ShowNotification
  | DismissNotification
  | MarkNotificationRead;

export type NotificationControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  NotificationControllerActions,
  NotificationControllerStateChange,
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
 * Controller that handles storing notifications and showing them to the user
 */
export class NotificationController extends BaseControllerV2<
  typeof name,
  NotificationControllerState,
  NotificationControllerMessenger
> {
  /**
   * Creates a NotificationController instance.
   *
   * @param options - Constructor options.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: NotificationControllerMessenger;
    state?: Partial<NotificationControllerState>;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });

    this.messagingSystem.registerActionHandler(
      `${name}:show` as const,
      (origin: string, message: string) => this.show(origin, message),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:dismiss` as const,
      (ids: string[]) => this.dismiss(ids),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:markRead` as const,
      (ids: string[]) => this.markRead(ids),
    );
  }

  /**
   * Shows a notification.
   *
   * @param origin - The origin trying to send a notification
   * @param message - A message to show on the notification
   */
  show(origin: string, message: string) {
    const id = nanoid();
    const notification = {
      id,
      origin,
      createdDate: Date.now(),
      readDate: null,
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
          state.notifications[id].readDate = Date.now();
        }
      }
    });
  }
}
