"use strict";Object.defineProperty(exports, "__esModule", {value: true});var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// src/enums.ts
var WALLET_PREFIX = "wallet_";
var CAVEAT_TYPES = Object.freeze({
  restrictReturnedAccounts: "restrictReturnedAccounts"
});
var LOG_IGNORE_METHODS = [
  "wallet_registerOnboarding",
  "wallet_watchAsset"
];
var LOG_METHOD_TYPES = /* @__PURE__ */ ((LOG_METHOD_TYPES2) => {
  LOG_METHOD_TYPES2["restricted"] = "restricted";
  LOG_METHOD_TYPES2["internal"] = "internal";
  return LOG_METHOD_TYPES2;
})(LOG_METHOD_TYPES || {});
var LOG_LIMIT = 100;











exports.__privateGet = __privateGet; exports.__privateAdd = __privateAdd; exports.__privateSet = __privateSet; exports.__privateMethod = __privateMethod; exports.WALLET_PREFIX = WALLET_PREFIX; exports.CAVEAT_TYPES = CAVEAT_TYPES; exports.LOG_IGNORE_METHODS = LOG_IGNORE_METHODS; exports.LOG_METHOD_TYPES = LOG_METHOD_TYPES; exports.LOG_LIMIT = LOG_LIMIT;
//# sourceMappingURL=chunk-MF2HNE3K.js.map