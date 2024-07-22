"use strict";Object.defineProperty(exports, "__esModule", {value: true});


var _chunkDHKZ2NEFjs = require('./chunk-DHKZ2NEF.js');




var _chunk5C53GKTUjs = require('./chunk-5C53GKTU.js');


var _chunkIGY2S5BCjs = require('./chunk-IGY2S5BC.js');

// src/controllers/authentication/index.ts
var authentication_exports = {};
_chunkIGY2S5BCjs.__export.call(void 0, authentication_exports, {
  Controller: () => _chunkDHKZ2NEFjs.AuthenticationController,
  Mocks: () => fixtures_exports,
  defaultState: () => _chunkDHKZ2NEFjs.defaultState
});

// src/controllers/authentication/__fixtures__/index.ts
var fixtures_exports = {};
_chunkIGY2S5BCjs.__export.call(void 0, fixtures_exports, {
  MOCK_ACCESS_TOKEN: () => MOCK_ACCESS_TOKEN,
  MOCK_JWT: () => MOCK_JWT,
  MOCK_LOGIN_RESPONSE: () => MOCK_LOGIN_RESPONSE,
  MOCK_NONCE: () => MOCK_NONCE,
  MOCK_NONCE_RESPONSE: () => MOCK_NONCE_RESPONSE,
  MOCK_OATH_TOKEN_RESPONSE: () => MOCK_OATH_TOKEN_RESPONSE,
  getMockAuthAccessTokenResponse: () => getMockAuthAccessTokenResponse,
  getMockAuthLoginResponse: () => getMockAuthLoginResponse,
  getMockAuthNonceResponse: () => getMockAuthNonceResponse
});

// src/controllers/authentication/__fixtures__/mockResponses.ts
var MOCK_NONCE = "4cbfqzoQpcNxVImGv";
var MOCK_NONCE_RESPONSE = {
  nonce: MOCK_NONCE
};
var getMockAuthNonceResponse = () => {
  return {
    url: _chunk5C53GKTUjs.AUTH_NONCE_ENDPOINT,
    requestMethod: "GET",
    response: MOCK_NONCE_RESPONSE
  };
};
var MOCK_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
var MOCK_LOGIN_RESPONSE = {
  token: MOCK_JWT,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  expires_in: (/* @__PURE__ */ new Date()).toString(),
  profile: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    identifier_id: "MOCK_IDENTIFIER",
    // eslint-disable-next-line @typescript-eslint/naming-convention
    profile_id: "MOCK_PROFILE_ID"
  }
};
var getMockAuthLoginResponse = () => {
  return {
    url: _chunk5C53GKTUjs.AUTH_LOGIN_ENDPOINT,
    requestMethod: "POST",
    response: MOCK_LOGIN_RESPONSE
  };
};
var MOCK_ACCESS_TOKEN = `MOCK_ACCESS_TOKEN-${MOCK_JWT}`;
var MOCK_OATH_TOKEN_RESPONSE = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  access_token: MOCK_ACCESS_TOKEN,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  expires_in: (/* @__PURE__ */ new Date()).getTime()
};
var getMockAuthAccessTokenResponse = () => {
  return {
    url: _chunk5C53GKTUjs.OIDC_TOKENS_ENDPOINT,
    requestMethod: "POST",
    response: MOCK_OATH_TOKEN_RESPONSE
  };
};




exports.fixtures_exports = fixtures_exports; exports.authentication_exports = authentication_exports;
//# sourceMappingURL=chunk-BXPL7ZFX.js.map