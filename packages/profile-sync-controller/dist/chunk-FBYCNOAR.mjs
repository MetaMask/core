import {
  UserStorageController,
  defaultState
} from "./chunk-RI4WLMSK.mjs";
import {
  USER_STORAGE_ENDPOINT
} from "./chunk-FU7PSGFP.mjs";
import {
  createEntryPath
} from "./chunk-ILIZJQ6X.mjs";
import {
  encryption_default as encryption_default2
} from "./chunk-5TOWF6UW.mjs";
import {
  createSHA256Hash,
  encryption_default
} from "./chunk-K5UKU454.mjs";
import {
  __export
} from "./chunk-U5UIDVOO.mjs";

// src/controllers/user-storage/index.ts
var user_storage_exports = {};
__export(user_storage_exports, {
  Controller: () => UserStorageController,
  Encryption: () => encryption_default,
  Mocks: () => fixtures_exports,
  createSHA256Hash: () => createSHA256Hash,
  defaultState: () => defaultState
});

// src/controllers/user-storage/__fixtures__/index.ts
var fixtures_exports = {};
__export(fixtures_exports, {
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
var MOCK_STORAGE_KEY = createSHA256Hash(MOCK_STORAGE_KEY_SIGNATURE);
var MOCK_STORAGE_DATA = JSON.stringify({ hello: "world" });
var MOCK_ENCRYPTED_STORAGE_DATA = encryption_default2.encryptString(
  MOCK_STORAGE_DATA,
  MOCK_STORAGE_KEY
);

// src/controllers/user-storage/__fixtures__/mockResponses.ts
var MOCK_USER_STORAGE_NOTIFICATIONS_ENDPOINT = `${USER_STORAGE_ENDPOINT}${createEntryPath(
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

export {
  fixtures_exports,
  user_storage_exports
};
//# sourceMappingURL=chunk-FBYCNOAR.mjs.map