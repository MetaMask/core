"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationController = void 0;
const nanoid_1 = require("nanoid");
const util_1 = require("../util");
const BaseControllerV2_1 = require("../BaseControllerV2");
const name = 'NotificationController';
const metadata = {
    notifications: { persist: true, anonymous: false },
};
const defaultState = {
    notifications: {},
};
/**
 * Controller that handles storing notifications and showing them to the user
 */
class NotificationController extends BaseControllerV2_1.BaseController {
    /**
     * Creates a NotificationController instance.
     *
     * @param options - Constructor options.
     * @param options.messenger - A reference to the messaging system.
     * @param options.state - Initial state to set on this controller.
     */
    constructor({ messenger, state, }) {
        super({
            name,
            metadata,
            messenger,
            state: Object.assign(Object.assign({}, defaultState), state),
        });
        this.messagingSystem.registerActionHandler(`${name}:show`, (origin, message) => this.show(origin, message));
        this.messagingSystem.registerActionHandler(`${name}:dismiss`, (ids) => this.dismiss(ids));
        this.messagingSystem.registerActionHandler(`${name}:markRead`, (ids) => this.markRead(ids));
    }
    /**
     * Shows a notification.
     *
     * @param origin - The origin trying to send a notification
     * @param message - A message to show on the notification
     */
    show(origin, message) {
        const id = (0, nanoid_1.nanoid)();
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
    dismiss(ids) {
        this.update((state) => {
            for (const id of ids) {
                if ((0, util_1.hasProperty)(state.notifications, id)) {
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
    markRead(ids) {
        this.update((state) => {
            for (const id of ids) {
                if ((0, util_1.hasProperty)(state.notifications, id)) {
                    state.notifications[id].readDate = Date.now();
                }
            }
        });
    }
}
exports.NotificationController = NotificationController;
//# sourceMappingURL=NotificationController.js.map