// src/NotificationController.ts
import { BaseController } from "@metamask/base-controller";
import { hasProperty } from "@metamask/utils";
import { nanoid } from "nanoid";
var name = "NotificationController";
var metadata = {
  notifications: { persist: true, anonymous: false }
};
var defaultState = {
  notifications: {}
};
var NotificationController = class extends BaseController {
  /**
   * Creates a NotificationController instance.
   *
   * @param options - Constructor options.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   */
  constructor({
    messenger,
    state
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state }
    });
    this.messagingSystem.registerActionHandler(
      `${name}:show`,
      (origin, message) => this.show(origin, message)
    );
    this.messagingSystem.registerActionHandler(
      `${name}:dismiss`,
      (ids) => this.dismiss(ids)
    );
    this.messagingSystem.registerActionHandler(
      `${name}:markRead`,
      (ids) => this.markRead(ids)
    );
    this.messagingSystem.registerActionHandler(
      `${name}:clear`,
      () => this.clear()
    );
  }
  /**
   * Shows a notification.
   *
   * @param origin - The origin trying to send a notification
   * @param message - A message to show on the notification
   */
  show(origin, message) {
    const id = nanoid();
    const notification = {
      id,
      origin,
      createdDate: Date.now(),
      readDate: null,
      message
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
  markRead(ids) {
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
};

export {
  NotificationController
};
//# sourceMappingURL=chunk-P7RBEAU6.mjs.map