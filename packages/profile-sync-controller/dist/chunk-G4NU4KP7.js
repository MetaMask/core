"use strict";Object.defineProperty(exports, "__esModule", {value: true});




var _chunkBOET676Pjs = require('./chunk-BOET676P.js');


var _chunkDRB2MN4Tjs = require('./chunk-DRB2MN4T.js');


var _chunkMBTBE4P5js = require('./chunk-MBTBE4P5.js');





var _chunkIGY2S5BCjs = require('./chunk-IGY2S5BC.js');

// src/sdk/authentication-jwt-bearer/flow-siwe.ts
var _siwe = require('siwe');
var _config, _options, _signer, _getAuthSession, getAuthSession_fn, _login, login_fn, _createSiWELoginRawMessage, createSiWELoginRawMessage_fn, _assertSigner, assertSigner_fn;
var SIWEJwtBearerAuth = class {
  constructor(config, options) {
    // convert expiresIn from seconds to milliseconds and use 90% of expiresIn
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _getAuthSession);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _login);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _createSiWELoginRawMessage);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _assertSigner);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _config, void 0);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _options, void 0);
    _chunkIGY2S5BCjs.__privateAdd.call(void 0, this, _signer, void 0);
    _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _config, config);
    _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _options, options);
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
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertSigner, assertSigner_fn).call(this, _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _signer));
    return _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _signer).address;
  }
  async signMessage(message) {
    _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertSigner, assertSigner_fn).call(this, _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _signer));
    return await _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _signer).signMessage(message);
  }
  prepare(signer) {
    _chunkIGY2S5BCjs.__privateSet.call(void 0, this, _signer, signer);
  }
};
_config = new WeakMap();
_options = new WeakMap();
_signer = new WeakMap();
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
  _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertSigner, assertSigner_fn).call(this, _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _signer));
  const address = await this.getIdentifier();
  const nonceRes = await _chunkBOET676Pjs.getNonce.call(void 0, address, _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _config).env);
  const rawMessage = _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _createSiWELoginRawMessage, createSiWELoginRawMessage_fn).call(this, nonceRes.nonce);
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
_createSiWELoginRawMessage = new WeakSet();
createSiWELoginRawMessage_fn = function(nonce) {
  _chunkIGY2S5BCjs.__privateMethod.call(void 0, this, _assertSigner, assertSigner_fn).call(this, _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _signer));
  return new (0, _siwe.SiweMessage)({
    domain: _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _signer)?.domain,
    address: _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _signer)?.address,
    uri: _chunkBOET676Pjs.SIWE_LOGIN_URL.call(void 0, _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _config).env),
    version: "1",
    chainId: _chunkIGY2S5BCjs.__privateGet.call(void 0, this, _signer)?.chainId,
    nonce,
    issuedAt: (/* @__PURE__ */ new Date()).toISOString()
  }).prepareMessage();
};
_assertSigner = new WeakSet();
assertSigner_fn = function(signer) {
  if (!signer) {
    throw new (0, _chunkMBTBE4P5js.ValidationError)(`you must call 'prepare()' before logging in`);
  }
};



exports.SIWEJwtBearerAuth = SIWEJwtBearerAuth;
//# sourceMappingURL=chunk-G4NU4KP7.js.map