import type { ControllerGetStateAction, ControllerStateChangeEvent, RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
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
declare const name = "NotificationController";
export type NotificationControllerStateChange = ControllerStateChangeEvent<typeof name, NotificationControllerState>;
export type GetNotificationControllerState = ControllerGetStateAction<typeof name, NotificationControllerState>;
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
export type NotificationControllerActions = GetNotificationControllerState | ShowNotification | DismissNotification | MarkNotificationRead | ClearNotifications;
export type NotificationControllerMessenger = RestrictedControllerMessenger<typeof name, NotificationControllerActions, NotificationControllerStateChange, never, never>;
/**
 * Controller that handles storing notifications and showing them to the user
 */
export declare class NotificationController extends BaseController<typeof name, NotificationControllerState, NotificationControllerMessenger> {
    /**
     * Creates a NotificationController instance.
     *
     * @param options - Constructor options.
     * @param options.messenger - A reference to the messaging system.
     * @param options.state - Initial state to set on this controller.
     */
    constructor({ messenger, state, }: {
        messenger: NotificationControllerMessenger;
        state?: Partial<NotificationControllerState>;
    });
    /**
     * Shows a notification.
     *
     * @param origin - The origin trying to send a notification
     * @param message - A message to show on the notification
     */
    show(origin: string, message: string): void;
    /**
     * Dimisses a list of notifications.
     *
     * @param ids - A list of notification IDs
     */
    dismiss(ids: string[]): void;
    /**
     * Marks a list of notifications as read.
     *
     * @param ids - A list of notification IDs
     */
    markRead(ids: string[]): void;
    /**
     * Clears the state of the controller, removing all notifications.
     *
     */
    clear(): void;
}
export {};
//# sourceMappingURL=NotificationController.d.ts.map