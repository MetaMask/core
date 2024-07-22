"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/NotificationController.ts
var _basecontroller = require('@metamask/base-controller');
var _utils = require('@metamask/utils');
var _nanoid = require('nanoid');
var name = "NotificationController";
var metadata = {
  notifications: { persist: true, anonymous: false }
};
var defaultState = {
  notifications: {}
};
var NotificationController = class extends _basecontroller.BaseController {
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
    const id = _nanoid.nanoid.call(void 0, );
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
        if (_utils.hasProperty.call(void 0, state.notifications, id)) {
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
        if (_utils.hasProperty.call(void 0, state.notifications, id)) {
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



exports.NotificationController = NotificationController;
//# sourceMappingURL=chunk-DR374FE2.js.map