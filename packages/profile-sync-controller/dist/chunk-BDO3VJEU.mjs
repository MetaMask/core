import {
  SIWE_LOGIN_URL,
  authenticate,
  authorizeOIDC,
  getNonce
} from "./chunk-WB6MUIML.mjs";
import {
  validateLoginResponse
} from "./chunk-QDGLIUUS.mjs";
import {
  ValidationError
} from "./chunk-TFFQFIJV.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-U5UIDVOO.mjs";

// src/sdk/authentication-jwt-bearer/flow-siwe.ts
import { SiweMessage } from "siwe";
var _config, _options, _signer, _getAuthSession, getAuthSession_fn, _login, login_fn, _createSiWELoginRawMessage, createSiWELoginRawMessage_fn, _assertSigner, assertSigner_fn;
var SIWEJwtBearerAuth = class {
  constructor(config, options) {
    // convert expiresIn from seconds to milliseconds and use 90% of expiresIn
    __privateAdd(this, _getAuthSession);
    __privateAdd(this, _login);
    __privateAdd(this, _createSiWELoginRawMessage);
    __privateAdd(this, _assertSigner);
    __privateAdd(this, _config, void 0);
    __privateAdd(this, _options, void 0);
    __privateAdd(this, _signer, void 0);
    __privateSet(this, _config, config);
    __privateSet(this, _options, options);
  }
  async getAccessToken() {
    const session = await __privateMethod(this, _getAuthSession, getAuthSession_fn).call(this);
    if (session) {
      return session.token.accessToken;
    }
    const loginResponse = await __privateMethod(this, _login, login_fn).call(this);
    return loginResponse.token.accessToken;
  }
  async getUserProfile() {
    const session = await __privateMethod(this, _getAuthSession, getAuthSession_fn).call(this);
    if (session) {
      return session.profile;
    }
    const loginResponse = await __privateMethod(this, _login, login_fn).call(this);
    return loginResponse.profile;
  }
  async getIdentifier() {
    __privateMethod(this, _assertSigner, assertSigner_fn).call(this, __privateGet(this, _signer));
    return __privateGet(this, _signer).address;
  }
  async signMessage(message) {
    __privateMethod(this, _assertSigner, assertSigner_fn).call(this, __privateGet(this, _signer));
    return await __privateGet(this, _signer).signMessage(message);
  }
  prepare(signer) {
    __privateSet(this, _signer, signer);
  }
};
_config = new WeakMap();
_options = new WeakMap();
_signer = new WeakMap();
_getAuthSession = new WeakSet();
getAuthSession_fn = async function() {
  const auth = await __privateGet(this, _options).storage.getLoginResponse();
  if (!validateLoginResponse(auth)) {
    return null;
  }
  const currentTime = Date.now();
  const sessionAge = currentTime - auth.token.obtainedAt;
  const refreshThreshold = auth.token.expiresIn * 1e3 * 0.9;
  if (sessionAge < refreshThreshold) {
    return auth;
  }
  return null;
};
_login = new WeakSet();
login_fn = async function() {
  __privateMethod(this, _assertSigner, assertSigner_fn).call(this, __privateGet(this, _signer));
  const address = await this.getIdentifier();
  const nonceRes = await getNonce(address, __privateGet(this, _config).env);
  const rawMessage = __privateMethod(this, _createSiWELoginRawMessage, createSiWELoginRawMessage_fn).call(this, nonceRes.nonce);
  const signature = await this.signMessage(rawMessage);
  const authResponse = await authenticate(
    rawMessage,
    signature,
    __privateGet(this, _config).type,
    __privateGet(this, _config).env
  );
  const tokenResponse = await authorizeOIDC(
    authResponse.token,
    __privateGet(this, _config).env,
    __privateGet(this, _config).platform
  );
  const result = {
    profile: authResponse.profile,
    token: tokenResponse
  };
  await __privateGet(this, _options).storage.setLoginResponse(result);
  return result;
};
_createSiWELoginRawMessage = new WeakSet();
createSiWELoginRawMessage_fn = function(nonce) {
  __privateMethod(this, _assertSigner, assertSigner_fn).call(this, __privateGet(this, _signer));
  return new SiweMessage({
    domain: __privateGet(this, _signer)?.domain,
    address: __privateGet(this, _signer)?.address,
    uri: SIWE_LOGIN_URL(__privateGet(this, _config).env),
    version: "1",
    chainId: __privateGet(this, _signer)?.chainId,
    nonce,
    issuedAt: (/* @__PURE__ */ new Date()).toISOString()
  }).prepareMessage();
};
_assertSigner = new WeakSet();
assertSigner_fn = function(signer) {
  if (!signer) {
    throw new ValidationError(`you must call 'prepare()' before logging in`);
  }
};

export {
  SIWEJwtBearerAuth
};
//# sourceMappingURL=chunk-BDO3VJEU.mjs.map