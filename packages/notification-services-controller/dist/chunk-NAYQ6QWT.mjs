import {
  types_exports
} from "./chunk-IOMDG67D.mjs";
import {
  utils_exports
} from "./chunk-DCADU5QI.mjs";
import {
  NotificationServicesPushController,
  defaultState
} from "./chunk-XVIUHFC3.mjs";
import {
  REGISTRATION_TOKENS_ENDPOINT
} from "./chunk-IKWNHNJQ.mjs";
import {
  __export
} from "./chunk-U5UIDVOO.mjs";

// src/NotificationServicesPushController/index.ts
var NotificationServicesPushController_exports = {};
__export(NotificationServicesPushController_exports, {
  Controller: () => NotificationServicesPushController,
  Mocks: () => fixtures_exports,
  Types: () => types_exports,
  Utils: () => utils_exports,
  defaultState: () => defaultState
});

// src/NotificationServicesPushController/__fixtures__/index.ts
var fixtures_exports = {};
__export(fixtures_exports, {
  MOCK_FCM_RESPONSE: () => MOCK_FCM_RESPONSE,
  MOCK_LINKS_RESPONSE: () => MOCK_LINKS_RESPONSE,
  MOCK_REG_TOKEN: () => MOCK_REG_TOKEN,
  getMockCreateFCMRegistrationTokenResponse: () => getMockCreateFCMRegistrationTokenResponse,
  getMockDeleteFCMRegistrationTokenResponse: () => getMockDeleteFCMRegistrationTokenResponse,
  getMockRetrievePushNotificationLinksResponse: () => getMockRetrievePushNotificationLinksResponse,
  getMockUpdatePushNotificationLinksResponse: () => getMockUpdatePushNotificationLinksResponse
});

// src/NotificationServicesPushController/__fixtures__/mockResponse.ts
var MOCK_REG_TOKEN = "REG_TOKEN";
var MOCK_LINKS_RESPONSE = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  trigger_ids: ["1", "2", "3"],
  // eslint-disable-next-line @typescript-eslint/naming-convention
  registration_tokens: [
    { token: "reg_token_1", platform: "portfolio" },
    { token: "reg_token_2", platform: "extension" }
  ]
};
var getMockRetrievePushNotificationLinksResponse = () => {
  return {
    url: REGISTRATION_TOKENS_ENDPOINT,
    requestMethod: "GET",
    response: MOCK_LINKS_RESPONSE
  };
};
var getMockUpdatePushNotificationLinksResponse = () => {
  return {
    url: REGISTRATION_TOKENS_ENDPOINT,
    requestMethod: "POST",
    response: null
  };
};
var MOCK_FCM_RESPONSE = {
  name: "",
  token: "fcm-token",
  web: {
    endpoint: "",
    p256dh: "",
    auth: "",
    applicationPubKey: ""
  }
};
var getMockCreateFCMRegistrationTokenResponse = () => {
  return {
    url: /^https:\/\/fcmregistrations\.googleapis\.com\/v1\/projects\/.*$/u,
    requestMethod: "POST",
    response: MOCK_FCM_RESPONSE
  };
};
var getMockDeleteFCMRegistrationTokenResponse = () => {
  return {
    url: /^https:\/\/fcmregistrations\.googleapis\.com\/v1\/projects\/.*$/u,
    requestMethod: "POST",
    response: {}
  };
};

export {
  fixtures_exports,
  NotificationServicesPushController_exports
};
//# sourceMappingURL=chunk-NAYQ6QWT.mjs.map