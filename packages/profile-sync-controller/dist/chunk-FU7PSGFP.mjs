import {
  createEntryPath
} from "./chunk-ILIZJQ6X.mjs";
import {
  encryption_default
} from "./chunk-5TOWF6UW.mjs";
import {
  getEnvUrls
} from "./chunk-FQ5SDMRE.mjs";

// src/controllers/user-storage/services.ts
import log from "loglevel";
var ENV_URLS = getEnvUrls("prd" /* PRD */);
var USER_STORAGE_API = ENV_URLS.userStorageApiUrl;
var USER_STORAGE_ENDPOINT = `${USER_STORAGE_API}/api/v1/userstorage`;
async function getUserStorage(opts) {
  try {
    const { bearerToken, path, storageKey } = opts;
    const encryptedPath = createEntryPath(path, storageKey);
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
    const decryptedData = encryption_default.decryptString(
      encryptedData,
      opts.storageKey
    );
    return decryptedData;
  } catch (e) {
    log.error("Failed to get user storage", e);
    return null;
  }
}
async function upsertUserStorage(data, opts) {
  const { bearerToken, path, storageKey } = opts;
  const encryptedData = encryption_default.encryptString(data, opts.storageKey);
  const encryptedPath = createEntryPath(path, storageKey);
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

export {
  USER_STORAGE_API,
  USER_STORAGE_ENDPOINT,
  getUserStorage,
  upsertUserStorage
};
//# sourceMappingURL=chunk-FU7PSGFP.mjs.map