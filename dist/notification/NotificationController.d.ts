import type { Patch } from 'immer';
import { BaseController } from '../BaseControllerV2';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
/**
 * @typedef NotificationControllerState
 * @property notifications - Stores existing notifications to be shown in the UI
 */
export declare type NotificationControllerState = {
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
export declare type Notification = {
    id: string;
    origin: string;
    createdDate: number;
    readDate: number | null;
    message: string;
};
declare const name = "NotificationController";
export declare type NotificationControllerStateChange = {
    type: `${typeof name}:stateChange`;
    payload: [NotificationControllerState, Patch[]];
};
export declare type GetNotificationControllerState = {
    type: `${typeof name}:getState`;
    handler: () => NotificationControllerState;
};
export declare type ShowNotification = {
    type: `${typeof name}:show`;
    handler: NotificationController['show'];
};
export declare type DismissNotification = {
    type: `${typeof name}:dismiss`;
    handler: NotificationController['dismiss'];
};
export declare type MarkNotificationRead = {
    type: `${typeof name}:markRead`;
    handler: NotificationController['markRead'];
};
export declare type NotificationControllerActions = GetNotificationControllerState | ShowNotification | DismissNotification | MarkNotificationRead;
export declare type NotificationControllerMessenger = RestrictedControllerMessenger<typeof name, NotificationControllerActions, NotificationControllerStateChange, never, never>;
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
}
export {};
