"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }




var _chunkGJHW5Z65js = require('./chunk-GJHW5Z65.js');



var _chunk72H2V4J5js = require('./chunk-72H2V4J5.js');





var _chunkIGY2S5BCjs = require('./chunk-IGY2S5BC.js');

// src/NotificationServicesPushController/NotificationServicesPushController.ts
var _basecontroller = require('@metamask/base-controller');
var _loglevel = require('loglevel'); var _loglevel2 = _interopRequireDefault(_loglevel);
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
var NotificationServicesPushController = class extends _basecontroller.BaseController {
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
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _registerMessageHandlers);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _getAndAssertBearerToken);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _pushListenerUnsubscribe, void 0);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _env, void 0);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _config, void 0);
    _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _env, env);
    _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _config, config);
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _registerMessageHandlers, registerMessageHandlers_fn).call(this);
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
    if (!_chunkIGY2S5BCjs.__privateGet.call(void 0, this, _config).isPushEnabled) {
      return;
    }
    const bearerToken = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getAndAssertBearerToken, getAndAssertBearerToken_fn).call(this);
    try {
      const regToken = await _chunkGJHW5Z65js.activatePushNotifications.call(void 0, {
        bearerToken,
        triggers: UUIDs,
        env: _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _env),
        createRegToken: _chunk72H2V4J5js.createRegToken,
        platform: _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _config).platform
      });
      if (!regToken) {
        return;
      }
      _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _pushListenerUnsubscribe, await _chunkGJHW5Z65js.listenToPushNotifications.call(void 0, {
        env: _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _env),
        listenToPushReceived: async (n) => {
          this.messagingSystem.publish(
            "NotificationServicesPushController:onNewNotifications",
            n
          );
          await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _config).onPushNotificationReceived(n);
        },
        listenToPushClicked: (e, n) => {
          if (n) {
            this.messagingSystem.publish(
              "NotificationServicesPushController:pushNotificationClicked",
              n
            );
          }
          _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _config).onPushNotificationClicked(e);
        }
      }));
      this.update((state) => {
        state.fcmToken = regToken;
      });
    } catch (error) {
      _loglevel2.default.error("Failed to enable push notifications:", error);
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
    if (!_chunkIGY2S5BCjs.__privateGet.call(void 0, this, _config).isPushEnabled) {
      return;
    }
    const bearerToken = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getAndAssertBearerToken, getAndAssertBearerToken_fn).call(this);
    let isPushNotificationsDisabled;
    try {
      isPushNotificationsDisabled = await _chunkGJHW5Z65js.deactivatePushNotifications.call(void 0, {
        bearerToken,
        triggers: UUIDs,
        env: _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _env),
        deleteRegToken: _chunk72H2V4J5js.deleteRegToken,
        regToken: this.state.fcmToken
      });
    } catch (error) {
      const errorMessage = `Failed to disable push notifications: ${error}`;
      _loglevel2.default.error(errorMessage);
      throw new Error(errorMessage);
    }
    if (!isPushNotificationsDisabled) {
      return;
    }
    (_a = _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _pushListenerUnsubscribe)) == null ? void 0 : _a.call(this);
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
    if (!_chunkIGY2S5BCjs.__privateGet.call(void 0, this, _config).isPushEnabled) {
      return;
    }
    const bearerToken = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getAndAssertBearerToken, getAndAssertBearerToken_fn).call(this);
    try {
      const { fcmToken } = await _chunkGJHW5Z65js.updateTriggerPushNotifications.call(void 0, {
        bearerToken,
        triggers: UUIDs,
        env: _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _env),
        createRegToken: _chunk72H2V4J5js.createRegToken,
        deleteRegToken: _chunk72H2V4J5js.deleteRegToken,
        platform: _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _config).platform,
        regToken: this.state.fcmToken
      });
      if (fcmToken) {
        this.update((state) => {
          state.fcmToken = fcmToken;
        });
      }
    } catch (error) {
      const errorMessage = `Failed to update triggers for push notifications: ${error}`;
      _loglevel2.default.error(errorMessage);
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
    _loglevel2.default.error(
      "Failed to enable push notifications: BearerToken token is missing."
    );
    throw new Error("BearerToken token is missing");
  }
  return bearerToken;
};




exports.defaultState = defaultState; exports.NotificationServicesPushController = NotificationServicesPushController;
//# sourceMappingURL=chunk-5TUHE2FM.js.map