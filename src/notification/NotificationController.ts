import { BaseController, BaseConfig, BaseState } from '../BaseController';

interface viewedNotification {
  [id: number]: boolean;
}

interface Notification {
  id: number;
  date: string;
}

interface StateNotification extends Notification {
  isShown: boolean;
}

/**
 * A map of notification ids to Notification objects
 */
interface NotificationMap {
  [id: number]: Notification;
}

/**
 * A map of notification ids to StateNotification objects
 */
export interface StateNotificationMap {
  [id: number]: StateNotification;
}

/**
 * NotitificationConfig will hold the active notifications
 */
export interface NotificationConfig extends BaseConfig {
  allNotifications: NotificationMap;
}

/**
 * Notification state will hold all the seen and unseen notifications
 * that are still active
 */
export interface NotificationState extends BaseState {
  notifications: StateNotificationMap;
}

const defaultState = {
  notifications: {},
};

/**
 * Controller for managing in-app announcement notifications.
 */
export class NotificationController extends BaseController<
  NotificationConfig,
  NotificationState
> {
  /**
   * Creates a NotificationController instance.
   *
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(config: NotificationConfig, state?: NotificationState) {
    super(config, state || defaultState);
    this.initialize();
    this._addNotifications();
  }

  /**
   * Compares the notifications in state with the notifications from file
   * to check if there are any new notifications/announcements
   * if yes, the new notification will be added to the state with a flag indicating
   * that the notification is not seen by the user.
   */
  private _addNotifications(): void {
    const newNotifications: StateNotificationMap = {};
    const { allNotifications } = this.config;
    Object.values(allNotifications).forEach(
      (notification: StateNotification) => {
        newNotifications[notification.id] = this.state.notifications[
          notification.id
        ]
          ? this.state.notifications[notification.id]
          : {
              ...notification,
              isShown: false,
            };
      },
    );
    this.update({ notifications: newNotifications });
  }

  /**
   * Updates the status of the status of the specified notifications
   * once it is read by the user.
   *
   * @param viewedIds - The notification IDs to mark as viewed.
   */
  updateViewed(viewedIds: viewedNotification): void {
    const stateNotifications = this.state.notifications;

    for (const id of Object.keys(viewedIds).map(Number)) {
      stateNotifications[id].isShown = viewedIds[id];
    }
    this.update({ notifications: stateNotifications }, true);
  }
}
