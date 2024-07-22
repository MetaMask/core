"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkYHGWG3EQjs = require('./chunk-YHGWG3EQ.js');



var _chunk3TE6M5TVjs = require('./chunk-3TE6M5TV.js');


var _chunkT3FNDVE3js = require('./chunk-T3FNDVE3.js');




var _chunkIGY2S5BCjs = require('./chunk-IGY2S5BC.js');

// src/controllers/user-storage/UserStorageController.ts
var _basecontroller = require('@metamask/base-controller');
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
var UserStorageController = class extends _basecontroller.BaseController {
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
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _registerMessageHandlers);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _assertProfileSyncingEnabled);
    /**
     * Utility to get the bearer token and storage key
     */
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _getStorageKeyAndBearerToken);
    /**
     * Rather than storing the storage key, we can compute the storage key when needed.
     *
     * @returns the storage key
     */
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _createStorageKey);
    /**
     * Signs a specific message using an underlying auth snap.
     *
     * @param message - A specific tagged message to sign.
     * @returns A Signature created by the snap.
     */
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _snapSignMessage);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _setIsProfileSyncingUpdateLoading);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _auth, {
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
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _notificationServices, {
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
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, __snapSignMessageCache, {});
    this.getMetaMetricsState = params.getMetaMetricsState;
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _registerMessageHandlers, registerMessageHandlers_fn).call(this);
  }
  async enableProfileSyncing() {
    try {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsProfileSyncingUpdateLoading, setIsProfileSyncingUpdateLoading_fn).call(this, true);
      const authEnabled = _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _auth).isAuthEnabled();
      if (!authEnabled) {
        await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _auth).signIn();
      }
      this.update((state) => {
        state.isProfileSyncingEnabled = true;
      });
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsProfileSyncingUpdateLoading, setIsProfileSyncingUpdateLoading_fn).call(this, false);
    } catch (e) {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsProfileSyncingUpdateLoading, setIsProfileSyncingUpdateLoading_fn).call(this, false);
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
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsProfileSyncingUpdateLoading, setIsProfileSyncingUpdateLoading_fn).call(this, true);
      const isNotificationServicesEnabled = await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _notificationServices).selectIsNotificationServicesEnabled();
      if (isNotificationServicesEnabled) {
        await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _notificationServices).disableNotificationServices();
      }
      const isMetaMetricsParticipation = this.getMetaMetricsState();
      if (!isMetaMetricsParticipation) {
        this.messagingSystem.call("AuthenticationController:performSignOut");
      }
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsProfileSyncingUpdateLoading, setIsProfileSyncingUpdateLoading_fn).call(this, false);
      this.update((state) => {
        state.isProfileSyncingEnabled = false;
      });
    } catch (e) {
      _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _setIsProfileSyncingUpdateLoading, setIsProfileSyncingUpdateLoading_fn).call(this, false);
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
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertProfileSyncingEnabled, assertProfileSyncingEnabled_fn).call(this);
    const { bearerToken, storageKey } = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getStorageKeyAndBearerToken, getStorageKeyAndBearerToken_fn).call(this);
    const result = await _chunk3TE6M5TVjs.getUserStorage.call(void 0, {
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
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertProfileSyncingEnabled, assertProfileSyncingEnabled_fn).call(this);
    const { bearerToken, storageKey } = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getStorageKeyAndBearerToken, getStorageKeyAndBearerToken_fn).call(this);
    await _chunk3TE6M5TVjs.upsertUserStorage.call(void 0, value, {
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
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertProfileSyncingEnabled, assertProfileSyncingEnabled_fn).call(this);
    const storageKey = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _createStorageKey, createStorageKey_fn).call(this);
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
  const bearerToken = await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _auth).getBearerToken();
  if (!bearerToken) {
    throw new Error("UserStorageController - unable to get bearer token");
  }
  const storageKey = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _createStorageKey, createStorageKey_fn).call(this);
  return { bearerToken, storageKey };
};
_createStorageKey = new WeakSet();
createStorageKey_fn = async function() {
  const id = await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _auth).getProfileId();
  if (!id) {
    throw new Error("UserStorageController - unable to create storage key");
  }
  const storageKeySignature = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _snapSignMessage, snapSignMessage_fn).call(this, `metamask:${id}`);
  const storageKey = _chunkT3FNDVE3js.createSHA256Hash.call(void 0, storageKeySignature);
  return storageKey;
};
__snapSignMessageCache = new WeakMap();
_snapSignMessage = new WeakSet();
snapSignMessage_fn = async function(message) {
  if (_chunkIGY2S5BCjs.__privateGet.call(void 0, this, __snapSignMessageCache)[message]) {
    return _chunkIGY2S5BCjs.__privateGet.call(void 0, this, __snapSignMessageCache)[message];
  }
  const result = await this.messagingSystem.call(
    "SnapController:handleRequest",
    _chunkYHGWG3EQjs.createSnapSignMessageRequest.call(void 0, message)
  );
  _chunkIGY2S5BCjs.__privateGet.call(void 0, this, __snapSignMessageCache)[message] = result;
  return result;
};
_setIsProfileSyncingUpdateLoading = new WeakSet();
setIsProfileSyncingUpdateLoading_fn = function(isProfileSyncingUpdateLoading) {
  this.update((state) => {
    state.isProfileSyncingUpdateLoading = isProfileSyncingUpdateLoading;
  });
};




exports.defaultState = defaultState; exports.UserStorageController = UserStorageController;
//# sourceMappingURL=chunk-3F2XTFPS.js.map