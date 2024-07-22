import {
  base64ToByteArray,
  byteArrayToBase64
} from "./chunk-76VRE4BI.mjs";

// src/controllers/user-storage/encryption/cache.ts
var MAX_PASSWORD_CACHES = 3;
var MAX_SALT_CACHES = 10;
var inMemCachedKDF = {};
var getPasswordCache = (hashedPassword) => {
  inMemCachedKDF[hashedPassword] ?? (inMemCachedKDF[hashedPassword] = /* @__PURE__ */ new Map());
  return inMemCachedKDF[hashedPassword];
};
function getCachedKeyBySalt(hashedPassword, salt) {
  const cache = getPasswordCache(hashedPassword);
  const base64Salt = byteArrayToBase64(salt);
  const cachedKey = cache.get(base64Salt);
  if (!cachedKey) {
    return void 0;
  }
  return {
    salt,
    base64Salt,
    key: cachedKey
  };
}
function getAnyCachedKey(hashedPassword) {
  const cache = getPasswordCache(hashedPassword);
  const cachedEntry = cache.entries().next().value;
  if (!cachedEntry) {
    return void 0;
  }
  const base64Salt = cachedEntry[0];
  const bytesSalt = base64ToByteArray(base64Salt);
  return {
    salt: bytesSalt,
    base64Salt,
    key: cachedEntry[1]
  };
}
function setCachedKey(hashedPassword, salt, key) {
  if (Object.keys(inMemCachedKDF).length > MAX_PASSWORD_CACHES) {
    inMemCachedKDF = {};
  }
  const cache = getPasswordCache(hashedPassword);
  const base64Salt = byteArrayToBase64(salt);
  if (cache.size > MAX_SALT_CACHES) {
    cache.clear();
  }
  cache.set(base64Salt, key);
}

export {
  getCachedKeyBySalt,
  getAnyCachedKey,
  setCachedKey
};
//# sourceMappingURL=chunk-H25EBXG5.mjs.map