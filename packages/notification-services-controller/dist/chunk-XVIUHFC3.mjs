import {
  activatePushNotifications,
  deactivatePushNotifications,
  listenToPushNotifications,
  updateTriggerPushNotifications
} from "./chunk-ADYRLXWY.mjs";
import {
  createRegToken,
  deleteRegToken
} from "./chunk-A5QFYBTR.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-U5UIDVOO.mjs";

// src/NotificationServicesPushController/NotificationServicesPushController.ts
import { BaseController } from "@metamask/base-controller";
import log from "loglevel";
var controllerName = "NotificationServicesPushController";
var defaultState = {
  fcmToken: ""
};
var metadata = {
  fcmToken: {
    persist: true,
    anonymous: true
  }
};
var _pushListenerUnsubscribe, _env, _config, _registerMessageHandlers, registerMessageHandlers_fn, _getAndAssertBearerToken, getAndAssertBearerToken_fn;
var NotificationServicesPushController = class extends BaseController {
  constructor({
    messenger,
    state,
    env,
    config
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state }
    });
    __privateAdd(this, _registerMessageHandlers);
    __privateAdd(this, _getAndAssertBearerToken);
    __privateAdd(this, _pushListenerUnsubscribe, void 0);
    __privateAdd(this, _env, void 0);
    __privateAdd(this, _config, void 0);
    __privateSet(this, _env, env);
    __privateSet(this, _config, config);
    __privateMethod(this, _registerMessageHandlers, registerMessageHandlers_fn).call(this);
  }
  /**
   * Enables push notifications for the application.
   *
   * This method sets up the necessary infrastructure for handling push notifications by:
   * 1. Registering the service worker to listen for messages.
   * 2. Fetching the Firebase Cloud Messaging (FCM) token from Firebase.
   * 3. Sending the FCM token to the server responsible for sending notifications, to register the device.
   *
   * @param UUIDs - An array of UUIDs to enable push notifications for.
   */
  async enablePushNotifications(UUIDs) {
    if (!__privateGet(this, _config).isPushEnabled) {
      return;
    }
    const bearerToken = await __privateMethod(this, _getAndAssertBearerToken, getAndAssertBearerToken_fn).call(this);
    try {
      const regToken = await activatePushNotifications({
        bearerToken,
        triggers: UUIDs,
        env: __privateGet(this, _env),
        createRegToken,
        platform: __privateGet(this, _config).platform
      });
      if (!regToken) {
        return;
      }
      __privateSet(this, _pushListenerUnsubscribe, await listenToPushNotifications({
        env: __privateGet(this, _env),
        listenToPushReceived: async (n) => {
          this.messagingSystem.publish(
            "NotificationServicesPushController:onNewNotifications",
            n
          );
          await __privateGet(this, _config).onPushNotificationReceived(n);
        },
        listenToPushClicked: (e, n) => {
          if (n) {
            this.messagingSystem.publish(
              "NotificationServicesPushController:pushNotificationClicked",
              n
            );
          }
          __privateGet(this, _config).onPushNotificationClicked(e);
        }
      }));
      this.update((state) => {
        state.fcmToken = regToken;
      });
    } catch (error) {
      log.error("Failed to enable push notifications:", error);
      throw new Error("Failed to enable push notifications");
    }
  }
  /**
   * Disables push notifications for the application.
   * This method handles the process of disabling push notifications by:
   * 1. Unregistering the service worker to stop listening for messages.
   * 2. Sending a request to the server to unregister the device using the FCM token.
   * 3. Removing the FCM token from the state to complete the process.
   *
   * @param UUIDs - An array of UUIDs for which push notifications should be disabled.
   */
  async disablePushNotifications(UUIDs) {
    var _a;
    if (!__privateGet(this, _config).isPushEnabled) {
      return;
    }
    const bearerToken = await __privateMethod(this, _getAndAssertBearerToken, getAndAssertBearerToken_fn).call(this);
    let isPushNotificationsDisabled;
    try {
      isPushNotificationsDisabled = await deactivatePushNotifications({
        bearerToken,
        triggers: UUIDs,
        env: __privateGet(this, _env),
        deleteRegToken,
        regToken: this.state.fcmToken
      });
    } catch (error) {
      const errorMessage = `Failed to disable push notifications: ${error}`;
      log.error(errorMessage);
      throw new Error(errorMessage);
    }
    if (!isPushNotificationsDisabled) {
      return;
    }
    (_a = __privateGet(this, _pushListenerUnsubscribe)) == null ? void 0 : _a.call(this);
    if (isPushNotificationsDisabled) {
      this.update((state) => {
        state.fcmToken = "";
      });
    }
  }
  /**
   * Updates the triggers for push notifications.
   * This method is responsible for updating the server with the new set of UUIDs that should trigger push notifications.
   * It uses the current FCM token and a BearerToken for authentication.
   *
   * @param UUIDs - An array of UUIDs that should trigger push notifications.
   */
  async updateTriggerPushNotifications(UUIDs) {
    if (!__privateGet(this, _config).isPushEnabled) {
      return;
    }
    const bearerToken = await __privateMethod(this, _getAndAssertBearerToken, getAndAssertBearerToken_fn).call(this);
    try {
      const { fcmToken } = await updateTriggerPushNotifications({
        bearerToken,
        triggers: UUIDs,
        env: __privateGet(this, _env),
        createRegToken,
        deleteRegToken,
        platform: __privateGet(this, _config).platform,
        regToken: this.state.fcmToken
      });
      if (fcmToken) {
        this.update((state) => {
          state.fcmToken = fcmToken;
        });
      }
    } catch (error) {
      const errorMessage = `Failed to update triggers for push notifications: ${error}`;
      log.error(errorMessage);
      throw new Error(errorMessage);
    }
  }
};
_pushListenerUnsubscribe = new WeakMap();
_env = new WeakMap();
_config = new WeakMap();
_registerMessageHandlers = new WeakSet();
registerMessageHandlers_fn = function() {
  this.messagingSystem.registerActionHandler(
    "NotificationServicesPushController:enablePushNotifications",
    this.enablePushNotifications.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    "NotificationServicesPushController:disablePushNotifications",
    this.disablePushNotifications.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    "NotificationServicesPushController:updateTriggerPushNotifications",
    this.updateTriggerPushNotifications.bind(this)
  );
};
_getAndAssertBearerToken = new WeakSet();
getAndAssertBearerToken_fn = async function() {
  const bearerToken = await this.messagingSystem.call(
    "AuthenticationController:getBearerToken"
  );
  if (!bearerToken) {
    log.error(
      "Failed to enable push notifications: BearerToken token is missing."
    );
    throw new Error("BearerToken token is missing");
  }
  return bearerToken;
};

export {
  defaultState,
  NotificationServicesPushController
};
//# sourceMappingURL=chunk-XVIUHFC3.mjs.map