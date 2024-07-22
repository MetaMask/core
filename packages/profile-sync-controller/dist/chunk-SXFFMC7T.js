"use strict";Object.defineProperty(exports, "__esModule", {value: true});


var _chunk3F2XTFPSjs = require('./chunk-3F2XTFPS.js');


var _chunk3TE6M5TVjs = require('./chunk-3TE6M5TV.js');


var _chunkSLHAVOTEjs = require('./chunk-SLHAVOTE.js');


var _chunkAK7OTIWAjs = require('./chunk-AK7OTIWA.js');



var _chunkT3FNDVE3js = require('./chunk-T3FNDVE3.js');


var _chunkIGY2S5BCjs = require('./chunk-IGY2S5BC.js');

// src/controllers/user-storage/index.ts
var user_storage_exports = {};
_chunkIGY2S5BCjs.__export.call(void 0, user_storage_exports, {
  Controller: () => _chunk3F2XTFPSjs.UserStorageController,
  Encryption: () => _chunkT3FNDVE3js.encryption_default,
  Mocks: () => fixtures_exports,
  createSHA256Hash: () => _chunkT3FNDVE3js.createSHA256Hash,
  defaultState: () => _chunk3F2XTFPSjs.defaultState
});

// src/controllers/user-storage/__fixtures__/index.ts
var fixtures_exports = {};
_chunkIGY2S5BCjs.__export.call(void 0, fixtures_exports, {
  MOCK_ENCRYPTED_STORAGE_DATA: () => MOCK_ENCRYPTED_STORAGE_DATA,
  MOCK_STORAGE_DATA: () => MOCK_STORAGE_DATA,
  MOCK_STORAGE_KEY: () => MOCK_STORAGE_KEY,
  MOCK_STORAGE_KEY_SIGNATURE: () => MOCK_STORAGE_KEY_SIGNATURE,
  MOCK_USER_STORAGE_NOTIFICATIONS_ENDPOINT: () => MOCK_USER_STORAGE_NOTIFICATIONS_ENDPOINT,
  getMockUserStorageGetResponse: () => getMockUserStorageGetResponse,
  getMockUserStoragePutResponse: () => getMockUserStoragePutResponse
});

// src/controllers/user-storage/__fixtures__/mockStorage.ts
var MOCK_STORAGE_KEY_SIGNATURE = "mockStorageKey";
var MOCK_STORAGE_KEY = _chunkT3FNDVE3js.createSHA256Hash.call(void 0, MOCK_STORAGE_KEY_SIGNATURE);
var MOCK_STORAGE_DATA = JSON.stringify({ hello: "world" });
var MOCK_ENCRYPTED_STORAGE_DATA = _chunkAK7OTIWAjs.encryption_default.encryptString(
  MOCK_STORAGE_DATA,
  MOCK_STORAGE_KEY
);

// src/controllers/user-storage/__fixtures__/mockResponses.ts
var MOCK_USER_STORAGE_NOTIFICATIONS_ENDPOINT = `${_chunk3TE6M5TVjs.USER_STORAGE_ENDPOINT}${_chunkSLHAVOTEjs.createEntryPath.call(void 0, 
  "notifications.notificationSettings",
  MOCK_STORAGE_KEY
)}`;
var MOCK_GET_USER_STORAGE_RESPONSE = {
  HashedKey: "HASHED_KEY",
  Data: MOCK_ENCRYPTED_STORAGE_DATA
};
var getMockUserStorageGetResponse = () => {
  return {
    url: MOCK_USER_STORAGE_NOTIFICATIONS_ENDPOINT,
    requestMethod: "GET",
    response: MOCK_GET_USER_STORAGE_RESPONSE
  };
};
var getMockUserStoragePutResponse = () => {
  return {
    url: MOCK_USER_STORAGE_NOTIFICATIONS_ENDPOINT,
    requestMethod: "PUT",
    response: null
  };
};




exports.fixtures_exports = fixtures_exports; exports.user_storage_exports = user_storage_exports;
//# sourceMappingURL=chunk-SXFFMC7T.js.map