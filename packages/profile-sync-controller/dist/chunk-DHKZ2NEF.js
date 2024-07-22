"use strict";Object.defineProperty(exports, "__esModule", {value: true});




var _chunk5C53GKTUjs = require('./chunk-5C53GKTU.js');



var _chunkYHGWG3EQjs = require('./chunk-YHGWG3EQ.js');





var _chunkIGY2S5BCjs = require('./chunk-IGY2S5BC.js');

// src/controllers/authentication/AuthenticationController.ts
var _basecontroller = require('@metamask/base-controller');
var THIRTY_MIN_MS = 1e3 * 60 * 30;
var controllerName = "AuthenticationController";
var defaultState = {
  isSignedIn: false
};
var metadata = {
  isSignedIn: {
    persist: true,
    anonymous: true
  },
  sessionData: {
    persist: true,
    anonymous: false
  }
};
var _metametrics, _registerMessageHandlers, registerMessageHandlers_fn, _assertLoggedIn, assertLoggedIn_fn, _performAuthenticationFlow, performAuthenticationFlow_fn, _hasValidSession, hasValidSession_fn, __snapPublicKeyCache, _snapGetPublicKey, snapGetPublicKey_fn, __snapSignMessageCache, _snapSignMessage, snapSignMessage_fn;
var AuthenticationController = class extends _basecontroller.BaseController {
  constructor({
    messenger,
    state,
    metametrics
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state }
    });
    /**
     * Constructor helper for registering this controller's messaging system
     * actions.
     */
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _registerMessageHandlers);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _assertLoggedIn);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _performAuthenticationFlow);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _hasValidSession);
    /**
     * Returns the auth snap public key.
     *
     * @returns The snap public key.
     */
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _snapGetPublicKey);
    /**
     * Signs a specific message using an underlying auth snap.
     *
     * @param message - A specific tagged message to sign.
     * @returns A Signature created by the snap.
     */
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _snapSignMessage);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _metametrics, void 0);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, __snapPublicKeyCache, void 0);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, __snapSignMessageCache, {});
    if (!metametrics) {
      throw new Error("`metametrics` field is required");
    }
    _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _metametrics, metametrics);
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _registerMessageHandlers, registerMessageHandlers_fn).call(this);
  }
  async performSignIn() {
    const { accessToken } = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _performAuthenticationFlow, performAuthenticationFlow_fn).call(this);
    return accessToken;
  }
  performSignOut() {
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertLoggedIn, assertLoggedIn_fn).call(this);
    this.update((state) => {
      state.isSignedIn = false;
      state.sessionData = void 0;
    });
  }
  async getBearerToken() {
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertLoggedIn, assertLoggedIn_fn).call(this);
    if (_chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _hasValidSession, hasValidSession_fn).call(this, this.state.sessionData)) {
      return this.state.sessionData.accessToken;
    }
    const { accessToken } = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _performAuthenticationFlow, performAuthenticationFlow_fn).call(this);
    return accessToken;
  }
  /**
   * Will return a session profile.
   * Throws if a user is not logged in.
   *
   * @returns profile for the session.
   */
  async getSessionProfile() {
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertLoggedIn, assertLoggedIn_fn).call(this);
    if (_chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _hasValidSession, hasValidSession_fn).call(this, this.state.sessionData)) {
      return this.state.sessionData.profile;
    }
    const { profile } = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _performAuthenticationFlow, performAuthenticationFlow_fn).call(this);
    return profile;
  }
  isSignedIn() {
    return this.state.isSignedIn;
  }
};
_metametrics = new WeakMap();
_registerMessageHandlers = new WeakSet();
registerMessageHandlers_fn = function() {
  this.messagingSystem.registerActionHandler(
    "AuthenticationController:getBearerToken",
    this.getBearerToken.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    "AuthenticationController:getSessionProfile",
    this.getSessionProfile.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    "AuthenticationController:isSignedIn",
    this.isSignedIn.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    "AuthenticationController:performSignIn",
    this.performSignIn.bind(this)
  );
  this.messagingSystem.registerActionHandler(
    "AuthenticationController:performSignOut",
    this.performSignOut.bind(this)
  );
};
_assertLoggedIn = new WeakSet();
assertLoggedIn_fn = function() {
  if (!this.state.isSignedIn) {
    throw new Error(
      `${controllerName}: Unable to call method, user is not authenticated`
    );
  }
};
_performAuthenticationFlow = new WeakSet();
performAuthenticationFlow_fn = async function() {
  try {
    const publicKey = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _snapGetPublicKey, snapGetPublicKey_fn).call(this);
    const nonce = await _chunk5C53GKTUjs.getNonce.call(void 0, publicKey);
    if (!nonce) {
      throw new Error(`Unable to get nonce`);
    }
    const rawMessage = _chunk5C53GKTUjs.createLoginRawMessage.call(void 0, nonce, publicKey);
    const signature = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _snapSignMessage, snapSignMessage_fn).call(this, rawMessage);
    const loginResponse = await _chunk5C53GKTUjs.login.call(void 0, rawMessage, signature, {
      metametricsId: await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _metametrics).getMetaMetricsId(),
      agent: _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _metametrics).agent
    });
    if (!loginResponse?.token) {
      throw new Error(`Unable to login`);
    }
    const profile = {
      identifierId: loginResponse.profile.identifier_id,
      profileId: loginResponse.profile.profile_id
    };
    const accessToken = await _chunk5C53GKTUjs.getAccessToken.call(void 0, 
      loginResponse.token,
      _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _metametrics).agent
    );
    if (!accessToken) {
      throw new Error(`Unable to get Access Token`);
    }
    this.update((state) => {
      state.isSignedIn = true;
      const expiresIn = /* @__PURE__ */ new Date();
      expiresIn.setTime(expiresIn.getTime() + THIRTY_MIN_MS);
      state.sessionData = {
        profile,
        accessToken,
        expiresIn: expiresIn.toString()
      };
    });
    return {
      profile,
      accessToken
    };
  } catch (e) {
    console.error("Failed to authenticate", e);
    const errorMessage = e instanceof Error ? e.message : JSON.stringify(e ?? "");
    throw new Error(
      `${controllerName}: Failed to authenticate - ${errorMessage}`
    );
  }
};
_hasValidSession = new WeakSet();
hasValidSession_fn = function(sessionData) {
  if (!sessionData) {
    return false;
  }
  const prevDate = Date.parse(sessionData.expiresIn);
  if (isNaN(prevDate)) {
    return false;
  }
  const currentDate = /* @__PURE__ */ new Date();
  const diffMs = Math.abs(currentDate.getTime() - prevDate);
  return THIRTY_MIN_MS > diffMs;
};
__snapPublicKeyCache = new WeakMap();
_snapGetPublicKey = new WeakSet();
snapGetPublicKey_fn = async function() {
  if (_chunkIGY2S5BCjs.__privateGet.call(void 0, this, __snapPublicKeyCache)) {
    return _chunkIGY2S5BCjs.__privateGet.call(void 0, this, __snapPublicKeyCache);
  }
  const result = await this.messagingSystem.call(
    "SnapController:handleRequest",
    _chunkYHGWG3EQjs.createSnapPublicKeyRequest.call(void 0, )
  );
  _chunkIGY2S5BCjs.__privateSet.call(void 0, this, __snapPublicKeyCache, result);
  return result;
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




exports.defaultState = defaultState; exports.AuthenticationController = AuthenticationController;
//# sourceMappingURL=chunk-DHKZ2NEF.js.map