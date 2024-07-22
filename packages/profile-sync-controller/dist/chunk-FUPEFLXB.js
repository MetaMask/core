"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkSLHAVOTEjs = require('./chunk-SLHAVOTE.js');



var _chunkP4DUDLMYjs = require('./chunk-P4DUDLMY.js');


var _chunkSMKTWM6Ijs = require('./chunk-SMKTWM6I.js');



var _chunkMBTBE4P5js = require('./chunk-MBTBE4P5.js');



var _chunkIGY2S5BCjs = require('./chunk-IGY2S5BC.js');

// src/sdk/user-storage.ts
var STORAGE_URL = (env, encryptedPath) => `${_chunkSMKTWM6Ijs.getEnvUrls.call(void 0, env).userStorageApiUrl}/api/v1/userstorage/${encryptedPath}`;
var _upsertUserStorage, upsertUserStorage_fn, _getUserStorage, getUserStorage_fn, _createEntryKey, createEntryKey_fn, _getAuthorizationHeader, getAuthorizationHeader_fn;
var UserStorage = class {
  constructor(config, options) {
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _upsertUserStorage);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _getUserStorage);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _createEntryKey);
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _getAuthorizationHeader);
    this.env = config.env;
    this.config = config;
    this.options = options;
  }
  async setItem(path, value) {
    await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _upsertUserStorage, upsertUserStorage_fn).call(this, path, value);
  }
  async getItem(path) {
    return _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getUserStorage, getUserStorage_fn).call(this, path);
  }
  async getStorageKey() {
    const storageKey = await this.options.storage?.getStorageKey();
    if (storageKey) {
      return storageKey;
    }
    const userProfile = await this.config.auth.getUserProfile();
    const storageKeySignature = await this.config.auth.signMessage(
      `metamask:${userProfile.profileId}`
    );
    const hashedStorageKeySignature = _chunkP4DUDLMYjs.createSHA256Hash.call(void 0, storageKeySignature);
    await this.options.storage?.setStorageKey(hashedStorageKeySignature);
    return hashedStorageKeySignature;
  }
};
_upsertUserStorage = new WeakSet();
upsertUserStorage_fn = async function(path, data) {
  try {
    const headers = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getAuthorizationHeader, getAuthorizationHeader_fn).call(this);
    const storageKey = await this.getStorageKey();
    const encryptedData = _chunkP4DUDLMYjs.encryption_default.encryptString(data, storageKey);
    const encryptedPath = _chunkSLHAVOTEjs.createEntryPath.call(void 0, path, storageKey);
    const url = new URL(STORAGE_URL(this.env, encryptedPath));
    const response = await fetch(url.toString(), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify({ data: encryptedData })
    });
    if (!response.ok) {
      const responseBody = await response.json().catch(() => ({
        message: "unknown",
        error: "unknown"
      }));
      throw new Error(
        `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`
      );
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : JSON.stringify(e ?? "");
    throw new (0, _chunkMBTBE4P5js.UserStorageError)(
      `failed to upsert user storage for path '${path}'. ${errorMessage}`
    );
  }
};
_getUserStorage = new WeakSet();
getUserStorage_fn = async function(path) {
  try {
    const headers = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getAuthorizationHeader, getAuthorizationHeader_fn).call(this);
    const storageKey = await this.getStorageKey();
    const encryptedPath = _chunkSLHAVOTEjs.createEntryPath.call(void 0, path, storageKey);
    const url = new URL(STORAGE_URL(this.env, encryptedPath));
    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
        ...headers
      }
    });
    if (response.status === 404) {
      throw new (0, _chunkMBTBE4P5js.NotFoundError)(
        `feature/key set not found for path '${path}'.`
      );
    }
    if (!response.ok) {
      const responseBody = await response.json();
      throw new Error(
        `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`
      );
    }
    const { Data: encryptedData } = await response.json();
    return _chunkP4DUDLMYjs.encryption_default.decryptString(encryptedData, storageKey);
  } catch (e) {
    if (e instanceof _chunkMBTBE4P5js.NotFoundError) {
      throw e;
    }
    const errorMessage = e instanceof Error ? e.message : JSON.stringify(e ?? "");
    throw new (0, _chunkMBTBE4P5js.UserStorageError)(
      `failed to get user storage for path '${path}'. ${errorMessage}`
    );
  }
};
_createEntryKey = new WeakSet();
createEntryKey_fn = function(key, storageKey) {
  const hashedKey = _chunkP4DUDLMYjs.createSHA256Hash.call(void 0, key + storageKey);
  return hashedKey;
};
_getAuthorizationHeader = new WeakSet();
getAuthorizationHeader_fn = async function() {
  const accessToken = await this.config.auth.getAccessToken();
  return { Authorization: `Bearer ${accessToken}` };
};




exports.STORAGE_URL = STORAGE_URL; exports.UserStorage = UserStorage;
//# sourceMappingURL=chunk-FUPEFLXB.js.map