import {
  authenticate,
  authorizeOIDC,
  getNonce
} from "./chunk-WB6MUIML.mjs";
import {
  getMetaMaskProviderEIP6963
} from "./chunk-5XSXZTED.mjs";
import {
  MESSAGE_SIGNING_SNAP
} from "./chunk-5EBUFNAN.mjs";
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

// src/sdk/authentication-jwt-bearer/flow-srp.ts
var defaultEIP6963SigningOptions = {
  getIdentifier: async () => {
    const provider = await getMetaMaskProviderEIP6963();
    if (!provider) {
      throw new ValidationError("No MetaMask wallet connected");
    }
    return await MESSAGE_SIGNING_SNAP.getPublicKey(provider);
  },
  signMessage: async (message) => {
    const provider = await getMetaMaskProviderEIP6963();
    if (!provider) {
      throw new ValidationError("No MetaMask wallet connected");
    }
    if (!message.startsWith("metamask:")) {
      throw new ValidationError('message must start with "metamask:"');
    }
    const formattedMessage = message;
    return await MESSAGE_SIGNING_SNAP.signMessage(provider, formattedMessage);
  }
};
var _config, _options, _getAuthSession, getAuthSession_fn, _login, login_fn, _createSrpLoginRawMessage, createSrpLoginRawMessage_fn;
var SRPJwtBearerAuth = class {
  constructor(config, options) {
    // convert expiresIn from seconds to milliseconds and use 90% of expiresIn
    __privateAdd(this, _getAuthSession);
    __privateAdd(this, _login);
    __privateAdd(this, _createSrpLoginRawMessage);
    __privateAdd(this, _config, void 0);
    __privateAdd(this, _options, void 0);
    __privateSet(this, _config, config);
    __privateSet(this, _options, {
      storage: options.storage,
      signing: options.signing ?? defaultEIP6963SigningOptions
    });
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
    return await __privateGet(this, _options).signing.getIdentifier();
  }
  async signMessage(message) {
    return await __privateGet(this, _options).signing.signMessage(message);
  }
};
_config = new WeakMap();
_options = new WeakMap();
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
  const address = await this.getIdentifier();
  const nonceRes = await getNonce(address, __privateGet(this, _config).env);
  const publicKey = await __privateGet(this, _options).signing.getIdentifier();
  const rawMessage = __privateMethod(this, _createSrpLoginRawMessage, createSrpLoginRawMessage_fn).call(this, nonceRes.nonce, publicKey);
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
_createSrpLoginRawMessage = new WeakSet();
createSrpLoginRawMessage_fn = function(nonce, publicKey) {
  return `metamask:${nonce}:${publicKey}`;
};

export {
  SRPJwtBearerAuth
};
//# sourceMappingURL=chunk-DRD22DR5.mjs.map