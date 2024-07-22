import {
  AuthenticationController,
  defaultState
} from "./chunk-Y7P3UH26.mjs";
import {
  AUTH_LOGIN_ENDPOINT,
  AUTH_NONCE_ENDPOINT,
  OIDC_TOKENS_ENDPOINT
} from "./chunk-7SW3CC66.mjs";
import {
  __export
} from "./chunk-U5UIDVOO.mjs";

// src/controllers/authentication/index.ts
var authentication_exports = {};
__export(authentication_exports, {
  Controller: () => AuthenticationController,
  Mocks: () => fixtures_exports,
  defaultState: () => defaultState
});

// src/controllers/authentication/__fixtures__/index.ts
var fixtures_exports = {};
__export(fixtures_exports, {
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
    url: AUTH_NONCE_ENDPOINT,
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
    url: AUTH_LOGIN_ENDPOINT,
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
    url: OIDC_TOKENS_ENDPOINT,
    requestMethod: "POST",
    response: MOCK_OATH_TOKEN_RESPONSE
  };
};

export {
  fixtures_exports,
  authentication_exports
};
//# sourceMappingURL=chunk-LDEIUP6J.mjs.map