import type { Patch } from 'immer';
import { nanoid } from 'nanoid';

import { hasProperty } from '../util';
import { BaseController } from '../BaseControllerV2';

import type { RestrictedControllerMessenger } from '../ControllerMessenger';

/**
 * @typedef NotificationControllerState
 * @property notifications - Stores existing notifications to be shown in the UI
 */
export type NotificationControllerState = {
  notifications: Record<string, Notification>;
};

export type Notification = {
  id: string;
  type: NotificationType;
  origin: string;
  createdDate: number;
  readDate: number | null;
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

export type ControllerActions =
  | GetNotificationControllerState
  | ShowNotification
  | DismissNotification
  | MarkNotificationRead;

export type NotificationControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  ControllerActions,
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
export class NotificationController extends BaseController<
  typeof name,
  NotificationControllerState,
  NotificationControllerMessenger
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
    messenger: NotificationControllerMessenger;
    state?: Partial<NotificationControllerState>;
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
