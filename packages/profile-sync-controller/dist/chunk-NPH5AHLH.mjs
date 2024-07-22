import {
  createEntryPath
} from "./chunk-ILIZJQ6X.mjs";
import {
  createSHA256Hash,
  encryption_default
} from "./chunk-B5DBQDB3.mjs";
import {
  getEnvUrls
} from "./chunk-FQ5SDMRE.mjs";
import {
  NotFoundError,
  UserStorageError
} from "./chunk-TFFQFIJV.mjs";
import {
  __privateAdd,
  __privateMethod
} from "./chunk-U5UIDVOO.mjs";

// src/sdk/user-storage.ts
var STORAGE_URL = (env, encryptedPath) => `${getEnvUrls(env).userStorageApiUrl}/api/v1/userstorage/${encryptedPath}`;
var _upsertUserStorage, upsertUserStorage_fn, _getUserStorage, getUserStorage_fn, _createEntryKey, createEntryKey_fn, _getAuthorizationHeader, getAuthorizationHeader_fn;
var UserStorage = class {
  constructor(config, options) {
    __privateAdd(this, _upsertUserStorage);
    __privateAdd(this, _getUserStorage);
    __privateAdd(this, _createEntryKey);
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __privateAdd(this, _getAuthorizationHeader);
    this.env = config.env;
    this.config = config;
    this.options = options;
  }
  async setItem(path, value) {
    await __privateMethod(this, _upsertUserStorage, upsertUserStorage_fn).call(this, path, value);
  }
  async getItem(path) {
    return __privateMethod(this, _getUserStorage, getUserStorage_fn).call(this, path);
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
    const hashedStorageKeySignature = createSHA256Hash(storageKeySignature);
    await this.options.storage?.setStorageKey(hashedStorageKeySignature);
    return hashedStorageKeySignature;
  }
};
_upsertUserStorage = new WeakSet();
upsertUserStorage_fn = async function(path, data) {
  try {
    const headers = await __privateMethod(this, _getAuthorizationHeader, getAuthorizationHeader_fn).call(this);
    const storageKey = await this.getStorageKey();
    const encryptedData = encryption_default.encryptString(data, storageKey);
    const encryptedPath = createEntryPath(path, storageKey);
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
    throw new UserStorageError(
      `failed to upsert user storage for path '${path}'. ${errorMessage}`
    );
  }
};
_getUserStorage = new WeakSet();
getUserStorage_fn = async function(path) {
  try {
    const headers = await __privateMethod(this, _getAuthorizationHeader, getAuthorizationHeader_fn).call(this);
    const storageKey = await this.getStorageKey();
    const encryptedPath = createEntryPath(path, storageKey);
    const url = new URL(STORAGE_URL(this.env, encryptedPath));
    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
        ...headers
      }
    });
    if (response.status === 404) {
      throw new NotFoundError(
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
    return encryption_default.decryptString(encryptedData, storageKey);
  } catch (e) {
    if (e instanceof NotFoundError) {
      throw e;
    }
    const errorMessage = e instanceof Error ? e.message : JSON.stringify(e ?? "");
    throw new UserStorageError(
      `failed to get user storage for path '${path}'. ${errorMessage}`
    );
  }
};
_createEntryKey = new WeakSet();
createEntryKey_fn = function(key, storageKey) {
  const hashedKey = createSHA256Hash(key + storageKey);
  return hashedKey;
};
_getAuthorizationHeader = new WeakSet();
getAuthorizationHeader_fn = async function() {
  const accessToken = await this.config.auth.getAccessToken();
  return { Authorization: `Bearer ${accessToken}` };
};

export {
  STORAGE_URL,
  UserStorage
};
//# sourceMappingURL=chunk-NPH5AHLH.mjs.map