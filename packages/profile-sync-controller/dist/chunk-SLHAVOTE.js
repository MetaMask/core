"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkT3FNDVE3js = require('./chunk-T3FNDVE3.js');

// src/controllers/user-storage/schema.ts
var USER_STORAGE_SCHEMA = {
  notifications: ["notificationSettings"]
};
var getFeatureAndKeyFromPath = (path) => {
  const pathRegex = /^\w+\.\w+$/u;
  if (!pathRegex.test(path)) {
    throw new Error(
      `user-storage - path is not in the correct format. Correct format: 'feature.key'`
    );
  }
  const [feature, key] = path.split(".");
  if (!(feature in USER_STORAGE_SCHEMA)) {
    throw new Error(`user-storage - invalid feature provided: ${feature}`);
  }
  const validFeature = USER_STORAGE_SCHEMA[feature];
  if (!validFeature.includes(key)) {
    const validKeys = USER_STORAGE_SCHEMA[feature].join(", ");
    throw new Error(
      `user-storage - invalid key provided for this feature: ${key}. Valid keys: ${validKeys}`
    );
  }
  return { feature, key };
};
function createEntryPath(path, storageKey) {
  const { feature, key } = getFeatureAndKeyFromPath(path);
  const hashedKey = _chunkT3FNDVE3js.createSHA256Hash.call(void 0, key + storageKey);
  return `/${feature}/${hashedKey}`;
}





exports.USER_STORAGE_SCHEMA = USER_STORAGE_SCHEMA; exports.getFeatureAndKeyFromPath = getFeatureAndKeyFromPath; exports.createEntryPath = createEntryPath;
//# sourceMappingURL=chunk-SLHAVOTE.js.map