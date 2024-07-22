"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunk7LWR54U7js = require('./chunk-7LWR54U7.js');


var _chunkENRKCWJ6js = require('./chunk-ENRKCWJ6.js');



var _chunk5TUHE2FMjs = require('./chunk-5TUHE2FM.js');


var _chunkB25TJ7KSjs = require('./chunk-B25TJ7KS.js');


var _chunkIGY2S5BCjs = require('./chunk-IGY2S5BC.js');

// src/NotificationServicesPushController/index.ts
var NotificationServicesPushController_exports = {};
_chunkIGY2S5BCjs.__export.call(void 0, NotificationServicesPushController_exports, {
  Controller: () => _chunk5TUHE2FMjs.NotificationServicesPushController,
  Mocks: () => fixtures_exports,
  Types: () => _chunk7LWR54U7js.types_exports,
  Utils: () => _chunkENRKCWJ6js.utils_exports,
  defaultState: () => _chunk5TUHE2FMjs.defaultState
});

// src/NotificationServicesPushController/__fixtures__/index.ts
var fixtures_exports = {};
_chunkIGY2S5BCjs.__export.call(void 0, fixtures_exports, {
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
    url: _chunkB25TJ7KSjs.REGISTRATION_TOKENS_ENDPOINT,
    requestMethod: "GET",
    response: MOCK_LINKS_RESPONSE
  };
};
var getMockUpdatePushNotificationLinksResponse = () => {
  return {
    url: _chunkB25TJ7KSjs.REGISTRATION_TOKENS_ENDPOINT,
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




exports.fixtures_exports = fixtures_exports; exports.NotificationServicesPushController_exports = NotificationServicesPushController_exports;
//# sourceMappingURL=chunk-MQG2T6H4.js.map