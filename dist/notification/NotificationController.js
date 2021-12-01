"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationController = void 0;
const BaseController_1 = require("../BaseController");
const defaultState = {
    notifications: {},
};
/**
 * Controller for managing in-app announcement notifications.
 */
class NotificationController extends BaseController_1.BaseController {
    /**
     * Creates a NotificationController instance.
     *
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor(config, state) {
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
    _addNotifications() {
        const newNotifications = {};
        const { allNotifications } = this.config;
        Object.values(allNotifications).forEach((notification) => {
            newNotifications[notification.id] = this.state.notifications[notification.id]
                ? this.state.notifications[notification.id]
                : Object.assign(Object.assign({}, notification), { isShown: false });
        });
        this.update({ notifications: newNotifications });
    }
    /**
     * Updates the status of the status of the specified notifications
     * once it is read by the user.
     *
     * @param viewedIds - The notification IDs to mark as viewed.
     */
    updateViewed(viewedIds) {
        const stateNotifications = this.state.notifications;
        for (const id of Object.keys(viewedIds).map(Number)) {
            stateNotifications[id].isShown = viewedIds[id];
        }
        this.update({ notifications: stateNotifications }, true);
    }
}
exports.NotificationController = NotificationController;
//# sourceMappingURL=NotificationController.js.map