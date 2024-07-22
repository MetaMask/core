"use strict";Object.defineProperty(exports, "__esModule", {value: true});



var _chunkBOET676Pjs = require('./chunk-BOET676P.js');


var _chunkRG4II6WHjs = require('./chunk-RG4II6WH.js');


var _chunkPQ5T4GHYjs = require('./chunk-PQ5T4GHY.js');


var _chunkDRB2MN4Tjs = require('./chunk-DRB2MN4T.js');


var _chunkMBTBE4P5js = require('./chunk-MBTBE4P5.js');





var _chunkIGY2S5BCjs = require('./chunk-IGY2S5BC.js');

// src/sdk/authentication-jwt-bearer/flow-srp.ts
var defaultEIP6963SigningOptions = {
  getIdentifier: async () => {
    const provider = await _chunkRG4II6WHjs.getMetaMaskProviderEIP6963.call(void 0, );
    if (!provider) {
      throw new (0, _chunkMBTBE4P5js.ValidationError)("No MetaMask wallet connected");
    }
    return await _chunkPQ5T4GHYjs.MESSAGE_SIGNING_SNAP.getPublicKey(provider);
  },
  signMessage: async (message) => {
    const provider = await _chunkRG4II6WHjs.getMetaMaskProviderEIP6963.call(void 0, );
    if (!provider) {
      throw new (0, _chunkMBTBE4P5js.ValidationError)("No MetaMask wallet connected");
    }
    if (!message.startsWith("metamask:")) {
      throw new (0, _chunkMBTBE4P5js.ValidationError)('message must start with "metamask:"');
    }
    const formattedMessage = message;
    return await _chunkPQ5T4GHYjs.MESSAGE_SIGNING_SNAP.signMessage(provider, formattedMessage);
  }
};
var _config, _options, _getAuthSession, getAuthSession_fn, _login, login_fn, _createSrpLoginRawMessage, createSrpLoginRawMessage_fn;
var SRPJwtBearerAuth = class {
  constructor(config, options) {
    // convert expiresIn from seconds to milliseconds and use 90% of expiresIn
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _getAuthSession);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _login);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _createSrpLoginRawMessage);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _config, void 0);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _options, void 0);
    _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _config, config);
    _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _options, {
      storage: options.storage,
      signing: options.signing ?? defaultEIP6963SigningOptions
    });
  }
  async getAccessToken() {
    const session = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getAuthSession, getAuthSession_fn).call(this);
    if (session) {
      return session.token.accessToken;
    }
    const loginResponse = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _login, login_fn).call(this);
    return loginResponse.token.accessToken;
  }
  async getUserProfile() {
    const session = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _getAuthSession, getAuthSession_fn).call(this);
    if (session) {
      return session.profile;
    }
    const loginResponse = await _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _login, login_fn).call(this);
    return loginResponse.profile;
  }
  async getIdentifier() {
    return await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _options).signing.getIdentifier();
  }
  async signMessage(message) {
    return await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _options).signing.signMessage(message);
  }
};
_config = new WeakMap();
_options = new WeakMap();
_getAuthSession = new WeakSet();
getAuthSession_fn = async function() {
  const auth = await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _options).storage.getLoginResponse();
  if (!_chunkDRB2MN4Tjs.validateLoginResponse.call(void 0, auth)) {
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
  const nonceRes = await _chunkBOET676Pjs.getNonce.call(void 0, address, _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _config).env);
  const publicKey = await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _options).signing.getIdentifier();
  const rawMessage = _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _createSrpLoginRawMessage, createSrpLoginRawMessage_fn).call(this, nonceRes.nonce, publicKey);
  const signature = await this.signMessage(rawMessage);
  const authResponse = await _chunkBOET676Pjs.authenticate.call(void 0, 
    rawMessage,
    signature,
    _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _config).type,
    _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _config).env
  );
  const tokenResponse = await _chunkBOET676Pjs.authorizeOIDC.call(void 0, 
    authResponse.token,
    _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _config).env,
    _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _config).platform
  );
  const result = {
    profile: authResponse.profile,
    token: tokenResponse
  };
  await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _options).storage.setLoginResponse(result);
  return result;
};
_createSrpLoginRawMessage = new WeakSet();
createSrpLoginRawMessage_fn = function(nonce, publicKey) {
  return `metamask:${nonce}:${publicKey}`;
};



exports.SRPJwtBearerAuth = SRPJwtBearerAuth;
//# sourceMappingURL=chunk-VD2IGTS3.js.map