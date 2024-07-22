import {
  processors_exports
} from "./chunk-X42WN3FE.mjs";

// src/NotificationServicesPushController/services/push/push-web.ts
import { getApp, initializeApp } from "firebase/app";
import { getToken, deleteToken } from "firebase/messaging";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";
import log from "loglevel";
var createFirebaseApp = async (env) => {
  try {
    return getApp();
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
    return initializeApp(firebaseConfig);
  }
};
var getFirebaseMessaging = async (env) => {
  const app = await createFirebaseApp(env);
  return getMessaging(app);
};
async function createRegToken(env) {
  try {
    const messaging = await getFirebaseMessaging(env);
    const token = await getToken(messaging, {
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
    await deleteToken(messaging);
    return true;
  } catch (error) {
    return false;
  }
}
async function listenToPushNotificationsReceived(env, handler) {
  const messaging = await getFirebaseMessaging(env);
  const unsubscribePushNotifications = onBackgroundMessage(
    messaging,
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (payload) => {
      try {
        const notificationData = payload?.data?.data ? JSON.parse(payload?.data?.data) : void 0;
        if (!notificationData) {
          return;
        }
        const notification = processors_exports.processNotification(notificationData);
        await handler(notification);
      } catch (error) {
        log.error("Unable to send push notification:", {
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

export {
  createRegToken,
  deleteRegToken,
  listenToPushNotificationsReceived,
  listenToPushNotificationsClicked
};
//# sourceMappingURL=chunk-A5QFYBTR.mjs.map