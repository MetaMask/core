import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { hasProperty } from '@metamask/utils';
import { nanoid } from 'nanoid';

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

/**
 * @typedef NotificationOptions - Notification data to be used to display in the UI
 * @property message - The notification message
 * @property title - The notification's title displayed in expanded view
 * @property interfaceId - The interface id of the content to be displayed in expanded view
 * @property footerLink - An object holding link information to be used in the expanded view
 */
export type NotificationOptions = {
  message: string;
  title?: string;
  interfaceId?: string;
  footerLink?: { href: string; text: string };
};

const name = 'NotificationController';

export type NotificationControllerStateChange = ControllerStateChangeEvent<
  typeof name,
  NotificationControllerState
>;

export type GetNotificationControllerState = ControllerGetStateAction<
  typeof name,
  NotificationControllerState
>;

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

export type ClearNotifications = {
  type: `${typeof name}:clear`;
  handler: NotificationController['clear'];
};

export type NotificationControllerActions =
  | GetNotificationControllerState
  | ShowNotification
  | DismissNotification
  | MarkNotificationRead
  | ClearNotifications;

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
export class NotificationController extends BaseController<
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
      (origin: string, options: NotificationOptions) =>
        this.show(origin, options),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:dismiss` as const,
      (ids: string[]) => this.dismiss(ids),
    );

    this.messagingSystem.registerActionHandler(
      `${name}:markRead` as const,
      (ids: string[]) => this.markRead(ids),
    );

    this.messagingSystem.registerActionHandler(`${name}:clear` as const, () =>
      this.clear(),
    );
  }

  /**
   * Shows a notification.
   *
   * @param origin - The origin trying to send a notification
   * @param options - Notification args object
   * @param options.title - The title to show in an expanded view
   * @param options.interfaceId - A interface id for snap content
   * @param options.footerLink - Footer object
   * @param options.footerLink.href - Footer href
   * @param options.footerLink.text - Link text
   */
  show(origin: string, options: NotificationOptions) {
    const id = nanoid();
    const { message, ...expandedView } = options;
    const notification = {
      id,
      origin,
      createdDate: Date.now(),
      readDate: null,
      message,
      expandedView: Object.keys(expandedView).length > 0 ? expandedView : null,
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

  /**
   * Clears the state of the controller, removing all notifications.
   *
   */
  clear() {
    this.update(() => {
      return { ...defaultState };
    });
  }
}
