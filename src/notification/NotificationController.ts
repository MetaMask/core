import BaseController, { BaseConfig, BaseState } from '../BaseController';

interface viewedNotification {
  [id: number]: boolean;
}

export interface Notification{
  id: number;
  title: string;
  description: string;
  date: string;
  image?: string;
  actionText: string;
  actionURL: string;
  isShown?: boolean;
}

/**
 * NotitificationConfig will hold the notifications from JSON file read
 * from `metamask-extension`
 */
export interface NotificationConfig extends BaseConfig{
  allNotifications: Notification[];
}

/**
 * Notification state will hold all the seen and unseen notifications
 * that are still active
 */
export interface NotificationState extends BaseState{
  notifications: { [id: number]: Notification};
}

const defaultState = {};

/**
 * Controller for managing in-app announcement notifications.
 */
export class NotificationController extends BaseController<NotificationConfig, NotificationState> {

    /**
   * Creates a NotificationController instance
   *
   * @param config - Initial options used to configure this controller
   * @param state - Initial state to set on this controller
   */
  constructor(config: NotificationConfig, state?: NotificationState) {
    const { allNotifications } = config;
    super(config, state || defaultState);
    this.initialize();
    this._addNotifications(allNotifications);
  }

  /**
   * Compares the notifications in state with the notifications from file
   * to check if there are any new notifications/announcements
   * if yes, the new notification will be added to the state with a flag indicating
   * that the notification is not seen by the user.
   *
   *  @param allNotifications
   */
  private _addNotifications(allNotifications: Notification[]): void{
    const existingNotificationIds: number[] = this.state.notifications ? Object.keys(this.state.notifications).map(Number) : [];

    const newNotifications: Notification[] = allNotifications
      .filter((newNotification) => !existingNotificationIds.some((existingId) => existingId === newNotification.id))
      .map((notification) => {
          notification.isShown = true;
          return notification;
        }
      );

    const stateNotifications: Record<number, Notification> = newNotifications
      .reduce((object: Record<number, Notification>, notification: Notification) => {
        object[notification.id] = notification;
        return object;
      }, {});

    this.update({ notifications: { ...this.state.notifications, ...stateNotifications } }, true);
  }

  /**
   * Updates the status of the status of the specified notifications
   * once it is read by the user.
   *
   * @param viewedIds
   */
  updateViewed(viewedIds: viewedNotification): void {
    const stateNotifications = this.state.notifications;

    for (const id of Object.keys(stateNotifications)) {
      stateNotifications[(id as unknown) as number].isShown = viewedIds[(id as unknown) as number];
    }

    this.update({ notifications: stateNotifications }, true);
  }
}
