import {
  getEnvUrls,
  getOidcClientId
} from "./chunk-FQ5SDMRE.mjs";

// src/controllers/authentication/services.ts
var ENV_URLS = getEnvUrls("prd" /* PRD */);
var AUTH_ENDPOINT = ENV_URLS.authApiUrl;
var AUTH_NONCE_ENDPOINT = `${AUTH_ENDPOINT}/api/v2/nonce`;
var AUTH_LOGIN_ENDPOINT = `${AUTH_ENDPOINT}/api/v2/srp/login`;
var OIDC_ENDPOINT = ENV_URLS.oidcApiUrl || "";
var OIDC_TOKENS_ENDPOINT = `${OIDC_ENDPOINT}/oauth2/token`;
var OIDC_CLIENT_ID = (platform) => {
  if (platform === "extension") {
    return getOidcClientId("prd" /* PRD */, "extension" /* EXTENSION */);
  }
  if (platform === "mobile") {
    return getOidcClientId("prd" /* PRD */, "mobile" /* MOBILE */);
  }
  throw new Error(`Unsupported platform - ${platform}`);
};
var OIDC_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";
async function getNonce(publicKey) {
  const nonceUrl = new URL(AUTH_NONCE_ENDPOINT);
  nonceUrl.searchParams.set("identifier", publicKey);
  try {
    const nonceResponse = await fetch(nonceUrl.toString());
    if (!nonceResponse.ok) {
      return null;
    }
    const nonceJson = await nonceResponse.json();
    return nonceJson?.nonce ?? null;
  } catch (e) {
    console.error("authentication-controller/services: unable to get nonce", e);
    return null;
  }
}
async function login(rawMessage, signature, clientMetaMetrics) {
  try {
    const response = await fetch(AUTH_LOGIN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        signature,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        raw_message: rawMessage,
        metametrics: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          metametrics_id: clientMetaMetrics.metametricsId,
          agent: clientMetaMetrics.agent
        }
      })
    });
    if (!response.ok) {
      return null;
    }
    const loginResponse = await response.json();
    return loginResponse ?? null;
  } catch (e) {
    console.error("authentication-controller/services: unable to login", e);
    return null;
  }
}
async function getAccessToken(jwtToken, platform) {
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded"
  });
  const urlEncodedBody = new URLSearchParams();
  urlEncodedBody.append("grant_type", OIDC_GRANT_TYPE);
  urlEncodedBody.append("client_id", OIDC_CLIENT_ID(platform));
  urlEncodedBody.append("assertion", jwtToken);
  try {
    const response = await fetch(OIDC_TOKENS_ENDPOINT, {
      method: "POST",
      headers,
      body: urlEncodedBody.toString()
    });
    if (!response.ok) {
      return null;
    }
    const accessTokenResponse = await response.json();
    return accessTokenResponse?.access_token ?? null;
  } catch (e) {
    console.error(
      "authentication-controller/services: unable to get access token",
      e
    );
    return null;
  }
}
function createLoginRawMessage(nonce, publicKey) {
  return `metamask:${nonce}:${publicKey}`;
}

export {
  AUTH_NONCE_ENDPOINT,
  AUTH_LOGIN_ENDPOINT,
  OIDC_TOKENS_ENDPOINT,
  getNonce,
  login,
  getAccessToken,
  createLoginRawMessage
};
//# sourceMappingURL=chunk-7SW3CC66.mjs.map