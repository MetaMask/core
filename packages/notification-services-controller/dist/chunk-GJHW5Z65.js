"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }


var _chunk72H2V4J5js = require('./chunk-72H2V4J5.js');


var _chunkB25TJ7KSjs = require('./chunk-B25TJ7KS.js');

// src/NotificationServicesPushController/services/services.ts
var _loglevel = require('loglevel'); var _loglevel2 = _interopRequireDefault(_loglevel);
async function getPushNotificationLinks(bearerToken) {
  try {
    const response = await fetch(_chunkB25TJ7KSjs.REGISTRATION_TOKENS_ENDPOINT, {
      headers: { Authorization: `Bearer ${bearerToken}` }
    });
    if (!response.ok) {
      _loglevel2.default.error("Failed to fetch the push notification links");
      throw new Error("Failed to fetch the push notification links");
    }
    return response.json();
  } catch (error) {
    _loglevel2.default.error("Failed to fetch the push notification links", error);
    return null;
  }
}
async function updateLinksAPI(bearerToken, triggers, regTokens) {
  try {
    const body = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      trigger_ids: triggers,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      registration_tokens: regTokens
    };
    const response = await fetch(_chunkB25TJ7KSjs.REGISTRATION_TOKENS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    return response.status === 200;
  } catch {
    return false;
  }
}
async function activatePushNotifications(params) {
  const { bearerToken, triggers, env, createRegToken, platform } = params;
  const notificationLinks = await getPushNotificationLinks(bearerToken);
  if (!notificationLinks) {
    return null;
  }
  const regToken = await createRegToken(env).catch(() => null);
  if (!regToken) {
    return null;
  }
  const newRegTokens = new Set(notificationLinks.registration_tokens);
  newRegTokens.add({ token: regToken, platform });
  await updateLinksAPI(bearerToken, triggers, Array.from(newRegTokens));
  return regToken;
}
async function deactivatePushNotifications(params) {
  const { regToken, bearerToken, triggers, env, deleteRegToken } = params;
  if (!regToken) {
    return true;
  }
  const notificationLinks = await getPushNotificationLinks(bearerToken);
  if (!notificationLinks) {
    return false;
  }
  const filteredRegTokens = notificationLinks.registration_tokens.filter(
    (r) => r.token !== regToken
  );
  const isTokenRemovedFromAPI = await updateLinksAPI(
    bearerToken,
    triggers,
    filteredRegTokens
  );
  if (!isTokenRemovedFromAPI) {
    return false;
  }
  const isTokenRemovedFromFCM = await deleteRegToken(env);
  if (!isTokenRemovedFromFCM) {
    return false;
  }
  return true;
}
async function updateTriggerPushNotifications(params) {
  const {
    bearerToken,
    regToken,
    triggers,
    createRegToken,
    platform,
    deleteRegToken,
    env
  } = params;
  const notificationLinks = await getPushNotificationLinks(bearerToken);
  if (!notificationLinks) {
    return { isTriggersLinkedToPushNotifications: false };
  }
  const hasRegToken = Boolean(
    regToken && notificationLinks.registration_tokens.some((r) => r.token === regToken)
  );
  let newRegToken = null;
  if (!hasRegToken) {
    await deleteRegToken(env);
    newRegToken = await createRegToken(env);
    if (!newRegToken) {
      throw new Error("Failed to create a new registration token");
    }
    notificationLinks.registration_tokens.push({
      token: newRegToken,
      platform
    });
  }
  const isTriggersLinkedToPushNotifications = await updateLinksAPI(
    bearerToken,
    triggers,
    notificationLinks.registration_tokens
  );
  return {
    isTriggersLinkedToPushNotifications,
    fcmToken: newRegToken ?? null
  };
}
async function listenToPushNotifications(params) {
  const { env, listenToPushReceived, listenToPushClicked } = params;
  const unsubscribePushNotifications = await _chunk72H2V4J5js.listenToPushNotificationsReceived.call(void 0, 
    env,
    listenToPushReceived
  );
  const unsubscribeNotificationClicks = _chunk72H2V4J5js.listenToPushNotificationsClicked.call(void 0, listenToPushClicked);
  const unsubscribe = () => {
    unsubscribePushNotifications();
    unsubscribeNotificationClicks();
  };
  return unsubscribe;
}








exports.getPushNotificationLinks = getPushNotificationLinks; exports.updateLinksAPI = updateLinksAPI; exports.activatePushNotifications = activatePushNotifications; exports.deactivatePushNotifications = deactivatePushNotifications; exports.updateTriggerPushNotifications = updateTriggerPushNotifications; exports.listenToPushNotifications = listenToPushNotifications;
//# sourceMappingURL=chunk-GJHW5Z65.js.map