import {
  createSnapSignMessageRequest
} from "./chunk-NMIF3LSX.mjs";
import {
  getUserStorage,
  upsertUserStorage
} from "./chunk-FU7PSGFP.mjs";
import {
  createSHA256Hash
} from "./chunk-K5UKU454.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod
} from "./chunk-U5UIDVOO.mjs";

// src/controllers/user-storage/UserStorageController.ts
import { BaseController } from "@metamask/base-controller";
var controllerName = "UserStorageController";
var defaultState = {
  isProfileSyncingEnabled: true,
  isProfileSyncingUpdateLoading: false
};
var metadata = {
  isProfileSyncingEnabled: {
    persist: true,
    anonymous: true
  },
  isProfileSyncingUpdateLoading: {
    persist: false,
    anonymous: false
  }
};
var _auth, _notificationServices, _registerMessageHandlers, registerMessageHandlers_fn, _assertProfileSyncingEnabled, assertProfileSyncingEnabled_fn, _getStorageKeyAndBearerToken, getStorageKeyAndBearerToken_fn, _createStorageKey, createStorageKey_fn, __snapSignMessageCache, _snapSignMessage, snapSignMessage_fn, _setIsProfileSyncingUpdateLoading, setIsProfileSyncingUpdateLoading_fn;
var UserStorageController = class extends BaseController {
  constructor(params) {
    super({
      messenger: params.messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...params.state }
    });
    /**
     * Constructor helper for registering this controller's messaging system
     * actions.
     */
    __privateAdd(this, _registerMessageHandlers);
    __privateAdd(this, _assertProfileSyncingEnabled);
    /**
     * Utility to get the bearer token and storage key
     */
    __privateAdd(this, _getStorageKeyAndBearerToken);
    /**
     * Rather than storing the storage key, we can compute the storage key when needed.
     *
     * @returns the storage key
     */
    __privateAdd(this, _createStorageKey);
    /**
     * Signs a specific message using an underlying auth snap.
     *
     * @param message - A specific tagged message to sign.
     * @returns A Signature created by the snap.
     */
    __privateAdd(this, _snapSignMessage);
    __privateAdd(this, _setIsProfileSyncingUpdateLoading);
    __privateAdd(this, _auth, {
      getBearerToken: async () => {
        return await this.messagingSystem.call(
          "AuthenticationController:getBearerToken"
        );
      },
      getProfileId: async () => {
        const sessionProfile = await this.messagingSystem.call(
          "AuthenticationController:getSessionProfile"
        );
        return sessionProfile?.profileId;
      },
      isAuthEnabled: () => {
        return this.messagingSystem.call("AuthenticationController:isSignedIn");
      },
      signIn: async () => {
        return await this.messagingSystem.call(
          "AuthenticationController:performSignIn"
        );
      },
      signOut: async () => {
        return this.messagingSystem.call(
          "AuthenticationController:performSignOut"
        );
      }
    });
    __privateAdd(this, _notificationServices, {
      disableNotificationServices: async () => {
        return await this.messagingSystem.call(
          "NotificationServicesController:disableNotificationServices"
        );
      },
      selectIsNotificationServicesEnabled: async () => {
        return this.messagingSystem.call(
          "NotificationServicesController:selectIsNotificationServicesEnabled"
        );
      }
    });
    __privateAdd(this, __snapSignMessageCache, {});
    this.getMetaMetricsState = params.getMetaMetricsState;
    __privateMethod(this, _registerMessageHandlers, registerMessageHandlers_fn).call(this);
  }
  async enableProfileSyncing() {
    try {
      __privateMethod(this, _setIsProfileSyncingUpdateLoading, setIsProfileSyncingUpdateLoading_fn).call(this, true);
      const authEnabled = __privateGet(this, _auth).isAuthEnabled();
      if (!authEnabled) {
        await __privateGet(this, _auth).signIn();
      }
      this.update((state) => {
        state.isProfileSyncingEnabled = true;
      });
      __privateMethod(this, _setIsProfileSyncingUpdateLoading, setIsProfileSyncingUpdateLoading_fn).call(this, false);
    } catch (e) {
      __privateMethod(this, _setIsProfileSyncingUpdateLoading, setIsProfileSyncingUpdateLoading_fn).call(this, false);
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(
        `${controllerName} - failed to enable profile syncing - ${errorMessage}`
      );
    }
  }
  async setIsProfileSyncingEnabled(isProfileSyncingEnabled) {
    this.update((state) => {
      state.isProfileSyncingEnabled = isProfileSyncingEnabled;
    });
  }
  async disableProfileSyncing() {
    const isAlreadyDisabled = !this.state.isProfileSyncingEnabled;
    if (isAlreadyDisabled) {
      return;
    }
    try {
      __privateMethod(this, _setIsProfileSyncingUpdateLoading, setIsProfileSyncingUpdateLoading_fn).call(this, true);
      const isNotificationServicesEnabled = await __privateGet(this, _notificationServices).selectIsNotificationServicesEnabled();
      if (isNotificationServicesEnabled) {
        await __privateGet(this, _notificationServices).disableNotificationServices();
      }
      const isMetaMetricsParticipation = this.getMetaMetricsState();
      if (!isMetaMetricsParticipation) {
        this.messagingSystem.call("AuthenticationController:performSignOut");
      }
      __privateMethod(this, _setIsProfileSyncingUpdateLoading, setIsProfileSyncingUpdateLoading_fn).call(this, false);
      this.update((state) => {
        state.isProfileSyncingEnabled = false;
      });
    } catch (e) {
      __privateMethod(this, _setIsProfileSyncingUpdateLoading, setIsProfileSyncingUpdateLoading_fn).call(this, false);
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(
        `${controllerName} - failed to disable profile syncing - ${errorMessage}`
      );
    }
  }
  /**
   * Allows retrieval of stored data. Data stored is string formatted.
   * Developers can extend the entry path and entry name through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}.${key}` that matches schema
   * @returns the decrypted string contents found from user storage (or null if not found)
   */
  async performGetStorage(path) {
    __privateMethod(this, _assertProfileSyncingEnabled, assertProfileSyncingEnabled_fn).call(this);
    const { bearerToken, storageKey } = await __privateMethod(this, _getStorageKeyAndBearerToken, getStorageKeyAndBearerToken_fn).call(this);
    const result = await getUserStorage({
      path,
      bearerToken,
      storageKey
    });
    return result;
  }
  /**
   * Allows storage of user data. Data stored must be string formatted.
   * Developers can extend the entry path and entry name through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}.${key}` that matches schema
   * @param value - The string data you want to store.
   * @returns nothing. NOTE that an error is thrown if fails to store data.
   */
  async performSetStorage(path, value) {
    __privateMethod(this, _assertProfileSyncingEnabled, assertProfileSyncingEnabled_fn).call(this);
    const { bearerToken, storageKey } = await __privateMethod(this, _getStorageKeyAndBearerToken, getStorageKeyAndBearerToken_fn).call(this);
    await upsertUserStorage(value, {
      path,
      bearerToken,
      storageKey
    });
  }
  /**
   * Retrieves the storage key, for internal use only!
   *
   * @returns the storage key
   */
  async getStorageKey() {
    __privateMethod(this, _assertProfileSyncingEnabled, assertProfileSyncingEnabled_fn).call(this);
    const storageKey = await __privateMethod(this, _createStorageKey, createStorageKey_fn).call(this);
    return storageKey;
  }
};
_auth = new WeakMap();
_notificationServices = new WeakMap();
_registerMessageHandlers = new WeakSet();
registerMessageHandlers_fn = function() {
  this.messagingSystem.registerActionHandler(
    "UserStorageController:performGetStorage",
    this.performGetStorage.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    "UserStorageController:performSetStorage",
    this.performSetStorage.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    "UserStorageController:getStorageKey",
    this.getStorageKey.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    "UserStorageController:enableProfileSyncing",
    this.enableProfileSyncing.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    "UserStorageController:disableProfileSyncing",
    this.disableProfileSyncing.bind(this)
  );
};
_assertProfileSyncingEnabled = new WeakSet();
assertProfileSyncingEnabled_fn = function() {
  if (!this.state.isProfileSyncingEnabled) {
    throw new Error(
      `${controllerName}: Unable to call method, user is not authenticated`
    );
  }
};
_getStorageKeyAndBearerToken = new WeakSet();
getStorageKeyAndBearerToken_fn = async function() {
  const bearerToken = await __privateGet(this, _auth).getBearerToken();
  if (!bearerToken) {
    throw new Error("UserStorageController - unable to get bearer token");
  }
  const storageKey = await __privateMethod(this, _createStorageKey, createStorageKey_fn).call(this);
  return { bearerToken, storageKey };
};
_createStorageKey = new WeakSet();
createStorageKey_fn = async function() {
  const id = await __privateGet(this, _auth).getProfileId();
  if (!id) {
    throw new Error("UserStorageController - unable to create storage key");
  }
  const storageKeySignature = await __privateMethod(this, _snapSignMessage, snapSignMessage_fn).call(this, `metamask:${id}`);
  const storageKey = createSHA256Hash(storageKeySignature);
  return storageKey;
};
__snapSignMessageCache = new WeakMap();
_snapSignMessage = new WeakSet();
snapSignMessage_fn = async function(message) {
  if (__privateGet(this, __snapSignMessageCache)[message]) {
    return __privateGet(this, __snapSignMessageCache)[message];
  }
  const result = await this.messagingSystem.call(
    "SnapController:handleRequest",
    createSnapSignMessageRequest(message)
  );
  __privateGet(this, __snapSignMessageCache)[message] = result;
  return result;
};
_setIsProfileSyncingUpdateLoading = new WeakSet();
setIsProfileSyncingUpdateLoading_fn = function(isProfileSyncingUpdateLoading) {
  this.update((state) => {
    state.isProfileSyncingUpdateLoading = isProfileSyncingUpdateLoading;
  });
};

export {
  defaultState,
  UserStorageController
};
//# sourceMappingURL=chunk-RI4WLMSK.mjs.map