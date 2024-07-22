var __accessCheck = (obj, member, msg) => {
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

// src/AbstractPollingController.ts
import stringify from "fast-json-stable-stringify";
import { v4 as random } from "uuid";
var getKey = (networkClientId, options) => `${networkClientId}:${stringify(options)}`;
function AbstractPollingControllerBaseMixin(Base) {
  var _pollingTokenSets, _callbacks;
  class AbstractPollingControllerBase extends Base {
    constructor() {
      super(...arguments);
      __privateAdd(this, _pollingTokenSets, /* @__PURE__ */ new Map());
      __privateAdd(this, _callbacks, /* @__PURE__ */ new Map());
    }
    startPollingByNetworkClientId(networkClientId, options = {}) {
      const pollToken = random();
      const key = getKey(networkClientId, options);
      const pollingTokenSet = __privateGet(this, _pollingTokenSets).get(key) ?? /* @__PURE__ */ new Set();
      pollingTokenSet.add(pollToken);
      __privateGet(this, _pollingTokenSets).set(key, pollingTokenSet);
      if (pollingTokenSet.size === 1) {
        this._startPollingByNetworkClientId(networkClientId, options);
      }
      return pollToken;
    }
    stopAllPolling() {
      __privateGet(this, _pollingTokenSets).forEach((tokenSet, _key) => {
        tokenSet.forEach((token) => {
          this.stopPollingByPollingToken(token);
        });
      });
    }
    stopPollingByPollingToken(pollingToken) {
      if (!pollingToken) {
        throw new Error("pollingToken required");
      }
      let keyToDelete = null;
      for (const [key, tokenSet] of __privateGet(this, _pollingTokenSets)) {
        if (tokenSet.delete(pollingToken)) {
          if (tokenSet.size === 0) {
            keyToDelete = key;
          }
          break;
        }
      }
      if (keyToDelete) {
        this._stopPollingByPollingTokenSetId(keyToDelete);
        __privateGet(this, _pollingTokenSets).delete(keyToDelete);
        const callbacks = __privateGet(this, _callbacks).get(keyToDelete);
        if (callbacks) {
          for (const callback of callbacks) {
            callback(keyToDelete);
          }
          callbacks.clear();
        }
      }
    }
    onPollingCompleteByNetworkClientId(networkClientId, callback, options = {}) {
      const key = getKey(networkClientId, options);
      const callbacks = __privateGet(this, _callbacks).get(key) ?? /* @__PURE__ */ new Set();
      callbacks.add(callback);
      __privateGet(this, _callbacks).set(key, callbacks);
    }
  }
  _pollingTokenSets = new WeakMap();
  _callbacks = new WeakMap();
  return AbstractPollingControllerBase;
}

export {
  __privateGet,
  __privateAdd,
  __privateSet,
  getKey,
  AbstractPollingControllerBaseMixin
};
//# sourceMappingURL=chunk-E2WT3D73.mjs.map