"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _chunkSLHAVOTEjs = require('./chunk-SLHAVOTE.js');


var _chunkAK7OTIWAjs = require('./chunk-AK7OTIWA.js');


var _chunkSMKTWM6Ijs = require('./chunk-SMKTWM6I.js');

// src/controllers/user-storage/services.ts
var _loglevel = require('loglevel'); var _loglevel2 = _interopRequireDefault(_loglevel);
var ENV_URLS = _chunkSMKTWM6Ijs.getEnvUrls.call(void 0, "prd" /* PRD */);
var USER_STORAGE_API = ENV_URLS.userStorageApiUrl;
var USER_STORAGE_ENDPOINT = `${USER_STORAGE_API}/api/v1/userstorage`;
async function getUserStorage(opts) {
  try {
    const { bearerToken, path, storageKey } = opts;
    const encryptedPath = _chunkSLHAVOTEjs.createEntryPath.call(void 0, path, storageKey);
    const url = new URL(`${USER_STORAGE_ENDPOINT}${encryptedPath}`);
    const userStorageResponse = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`
      }
    });
    if (userStorageResponse.status === 404) {
      return null;
    }
    if (userStorageResponse.status !== 200) {
      throw new Error("Unable to get User Storage");
    }
    const userStorage = await userStorageResponse.json();
    const encryptedData = userStorage?.Data ?? null;
    if (!encryptedData) {
      return null;
    }
    const decryptedData = _chunkAK7OTIWAjs.encryption_default.decryptString(
      encryptedData,
      opts.storageKey
    );
    return decryptedData;
  } catch (e) {
    _loglevel2.default.error("Failed to get user storage", e);
    return null;
  }
}
async function upsertUserStorage(data, opts) {
  const { bearerToken, path, storageKey } = opts;
  const encryptedData = _chunkAK7OTIWAjs.encryption_default.encryptString(data, opts.storageKey);
  const encryptedPath = _chunkSLHAVOTEjs.createEntryPath.call(void 0, path, storageKey);
  const url = new URL(`${USER_STORAGE_ENDPOINT}${encryptedPath}`);
  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`
    },
    body: JSON.stringify({ data: encryptedData })
  });
  if (!res.ok) {
    throw new Error("user-storage - unable to upsert data");
  }
}






exports.USER_STORAGE_API = USER_STORAGE_API; exports.USER_STORAGE_ENDPOINT = USER_STORAGE_ENDPOINT; exports.getUserStorage = getUserStorage; exports.upsertUserStorage = upsertUserStorage;
//# sourceMappingURL=chunk-3TE6M5TV.js.map