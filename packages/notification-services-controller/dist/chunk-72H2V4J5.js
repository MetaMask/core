"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _chunkKWTSMLNDjs = require('./chunk-KWTSMLND.js');

// src/NotificationServicesPushController/services/push/push-web.ts
var _app = require('firebase/app');
var _messaging = require('firebase/messaging');
var _sw = require('firebase/messaging/sw');
var _loglevel = require('loglevel'); var _loglevel2 = _interopRequireDefault(_loglevel);
var createFirebaseApp = async (env) => {
  try {
    return _app.getApp.call(void 0, );
  } catch {
    const firebaseConfig = {
      apiKey: env.apiKey,
      authDomain: env.authDomain,
      storageBucket: env.storageBucket,
      projectId: env.projectId,
      messagingSenderId: env.messagingSenderId,
      appId: env.appId,
      measurementId: env.measurementId
    };
    return _app.initializeApp.call(void 0, firebaseConfig);
  }
};
var getFirebaseMessaging = async (env) => {
  const app = await createFirebaseApp(env);
  return _sw.getMessaging.call(void 0, app);
};
async function createRegToken(env) {
  try {
    const messaging = await getFirebaseMessaging(env);
    const token = await _messaging.getToken.call(void 0, messaging, {
      serviceWorkerRegistration: self.registration,
      vapidKey: env.vapidKey
    });
    return token;
  } catch {
    return null;
  }
}
async function deleteRegToken(env) {
  try {
    const messaging = await getFirebaseMessaging(env);
    await _messaging.deleteToken.call(void 0, messaging);
    return true;
  } catch (error) {
    return false;
  }
}
async function listenToPushNotificationsReceived(env, handler) {
  const messaging = await getFirebaseMessaging(env);
  const unsubscribePushNotifications = _sw.onBackgroundMessage.call(void 0, 
    messaging,
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (payload) => {
      try {
        const notificationData = payload?.data?.data ? JSON.parse(payload?.data?.data) : void 0;
        if (!notificationData) {
          return;
        }
        const notification = _chunkKWTSMLNDjs.processors_exports.processNotification(notificationData);
        await handler(notification);
      } catch (error) {
        _loglevel2.default.error("Unable to send push notification:", {
          notification: payload?.data?.data,
          error
        });
        throw new Error("Unable to send push notification");
      }
    }
  );
  const unsubscribe = () => unsubscribePushNotifications();
  return unsubscribe;
}
function listenToPushNotificationsClicked(handler) {
  const clickHandler = (event) => {
    const data = event?.notification?.data;
    handler(event, data);
  };
  self.addEventListener("notificationclick", clickHandler);
  const unsubscribe = () => self.removeEventListener("notificationclick", clickHandler);
  return unsubscribe;
}






exports.createRegToken = createRegToken; exports.deleteRegToken = deleteRegToken; exports.listenToPushNotificationsReceived = listenToPushNotificationsReceived; exports.listenToPushNotificationsClicked = listenToPushNotificationsClicked;
//# sourceMappingURL=chunk-72H2V4J5.js.map