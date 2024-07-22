import {
  createLoginRawMessage,
  getAccessToken,
  getNonce,
  login
} from "./chunk-7SW3CC66.mjs";
import {
  createSnapPublicKeyRequest,
  createSnapSignMessageRequest
} from "./chunk-NMIF3LSX.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-U5UIDVOO.mjs";

// src/controllers/authentication/AuthenticationController.ts
import { BaseController } from "@metamask/base-controller";
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
var AuthenticationController = class extends BaseController {
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
    __privateAdd(this, _registerMessageHandlers);
    __privateAdd(this, _assertLoggedIn);
    __privateAdd(this, _performAuthenticationFlow);
    __privateAdd(this, _hasValidSession);
    /**
     * Returns the auth snap public key.
     *
     * @returns The snap public key.
     */
    __privateAdd(this, _snapGetPublicKey);
    /**
     * Signs a specific message using an underlying auth snap.
     *
     * @param message - A specific tagged message to sign.
     * @returns A Signature created by the snap.
     */
    __privateAdd(this, _snapSignMessage);
    __privateAdd(this, _metametrics, void 0);
    __privateAdd(this, __snapPublicKeyCache, void 0);
    __privateAdd(this, __snapSignMessageCache, {});
    if (!metametrics) {
      throw new Error("`metametrics` field is required");
    }
    __privateSet(this, _metametrics, metametrics);
    __privateMethod(this, _registerMessageHandlers, registerMessageHandlers_fn).call(this);
  }
  async performSignIn() {
    const { accessToken } = await __privateMethod(this, _performAuthenticationFlow, performAuthenticationFlow_fn).call(this);
    return accessToken;
  }
  performSignOut() {
    __privateMethod(this, _assertLoggedIn, assertLoggedIn_fn).call(this);
    this.update((state) => {
      state.isSignedIn = false;
      state.sessionData = void 0;
    });
  }
  async getBearerToken() {
    __privateMethod(this, _assertLoggedIn, assertLoggedIn_fn).call(this);
    if (__privateMethod(this, _hasValidSession, hasValidSession_fn).call(this, this.state.sessionData)) {
      return this.state.sessionData.accessToken;
    }
    const { accessToken } = await __privateMethod(this, _performAuthenticationFlow, performAuthenticationFlow_fn).call(this);
    return accessToken;
  }
  /**
   * Will return a session profile.
   * Throws if a user is not logged in.
   *
   * @returns profile for the session.
   */
  async getSessionProfile() {
    __privateMethod(this, _assertLoggedIn, assertLoggedIn_fn).call(this);
    if (__privateMethod(this, _hasValidSession, hasValidSession_fn).call(this, this.state.sessionData)) {
      return this.state.sessionData.profile;
    }
    const { profile } = await __privateMethod(this, _performAuthenticationFlow, performAuthenticationFlow_fn).call(this);
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
    const publicKey = await __privateMethod(this, _snapGetPublicKey, snapGetPublicKey_fn).call(this);
    const nonce = await getNonce(publicKey);
    if (!nonce) {
      throw new Error(`Unable to get nonce`);
    }
    const rawMessage = createLoginRawMessage(nonce, publicKey);
    const signature = await __privateMethod(this, _snapSignMessage, snapSignMessage_fn).call(this, rawMessage);
    const loginResponse = await login(rawMessage, signature, {
      metametricsId: await __privateGet(this, _metametrics).getMetaMetricsId(),
      agent: __privateGet(this, _metametrics).agent
    });
    if (!loginResponse?.token) {
      throw new Error(`Unable to login`);
    }
    const profile = {
      identifierId: loginResponse.profile.identifier_id,
      profileId: loginResponse.profile.profile_id
    };
    const accessToken = await getAccessToken(
      loginResponse.token,
      __privateGet(this, _metametrics).agent
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
  if (__privateGet(this, __snapPublicKeyCache)) {
    return __privateGet(this, __snapPublicKeyCache);
  }
  const result = await this.messagingSystem.call(
    "SnapController:handleRequest",
    createSnapPublicKeyRequest()
  );
  __privateSet(this, __snapPublicKeyCache, result);
  return result;
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

export {
  defaultState,
  AuthenticationController
};
//# sourceMappingURL=chunk-Y7P3UH26.mjs.map