import {
  getEnvUrls,
  getOidcClientId
} from "./chunk-FQ5SDMRE.mjs";
import {
  NonceRetrievalError,
  PairError,
  SignInError,
  ValidationError
} from "./chunk-TFFQFIJV.mjs";

// src/sdk/authentication-jwt-bearer/services.ts
var NONCE_URL = (env) => `${getEnvUrls(env).authApiUrl}/api/v2/nonce`;
var PAIR_IDENTIFIERS = (env) => `${getEnvUrls(env).authApiUrl}/api/v2/identifiers/pair`;
var OIDC_TOKEN_URL = (env) => `${getEnvUrls(env).oidcApiUrl}/oauth2/token`;
var SRP_LOGIN_URL = (env) => `${getEnvUrls(env).authApiUrl}/api/v2/srp/login`;
var SIWE_LOGIN_URL = (env) => `${getEnvUrls(env).authApiUrl}/api/v2/siwe/login`;
var getAuthenticationUrl = (authType, env) => {
  switch (authType) {
    case "SRP" /* SRP */:
      return SRP_LOGIN_URL(env);
    case "SiWE" /* SiWE */:
      return SIWE_LOGIN_URL(env);
    default:
      throw new ValidationError(
        `Invalid AuthType: ${authType} - unable to create Auth URL`
      );
  }
};
async function pairIdentifiers(nonce, logins, accessToken, env) {
  const pairUrl = new URL(PAIR_IDENTIFIERS(env));
  try {
    const response = await fetch(pairUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        nonce,
        logins
      })
    });
    if (!response.ok) {
      const responseBody = await response.json();
      throw new Error(
        `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`
      );
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : JSON.stringify(e ?? "");
    throw new PairError(`unable to pair identifiers: ${errorMessage}`);
  }
}
async function getNonce(id, env) {
  const nonceUrl = new URL(NONCE_URL(env));
  nonceUrl.searchParams.set("identifier", id);
  try {
    const nonceResponse = await fetch(nonceUrl.toString());
    if (!nonceResponse.ok) {
      const responseBody = await nonceResponse.json();
      throw new Error(
        `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`
      );
    }
    const nonceJson = await nonceResponse.json();
    return {
      nonce: nonceJson.nonce,
      identifier: nonceJson.identifier,
      expiresIn: nonceJson.expires_in
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : JSON.stringify(e ?? "");
    throw new NonceRetrievalError(`failed to generate nonce: ${errorMessage}`);
  }
}
async function authorizeOIDC(jwtToken, env, platform) {
  const grantType = "urn:ietf:params:oauth:grant-type:jwt-bearer";
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded"
  });
  const urlEncodedBody = new URLSearchParams();
  urlEncodedBody.append("grant_type", grantType);
  urlEncodedBody.append("client_id", getOidcClientId(env, platform));
  urlEncodedBody.append("assertion", jwtToken);
  try {
    const response = await fetch(OIDC_TOKEN_URL(env), {
      method: "POST",
      headers,
      body: urlEncodedBody.toString()
    });
    if (!response.ok) {
      const responseBody = await response.json();
      throw new Error(
        `HTTP error: ${responseBody.error_description}, error code: ${responseBody.error}`
      );
    }
    const accessTokenResponse = await response.json();
    return {
      accessToken: accessTokenResponse.access_token,
      expiresIn: accessTokenResponse.expires_in,
      obtainedAt: Date.now()
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : JSON.stringify(e ?? "");
    throw new SignInError(`unable to get access token: ${errorMessage}`);
  }
}
async function authenticate(rawMessage, signature, authType, env) {
  const authenticationUrl = getAuthenticationUrl(authType, env);
  try {
    const response = await fetch(authenticationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        signature,
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        raw_message: rawMessage
      })
    });
    if (!response.ok) {
      const responseBody = await response.json();
      throw new Error(
        `${authType} login HTTP error: ${responseBody.message}, error code: ${responseBody.error}`
      );
    }
    const loginResponse = await response.json();
    return {
      token: loginResponse.token,
      expiresIn: loginResponse.expires_in,
      profile: {
        identifierId: loginResponse.profile.identifier_id,
        metaMetricsId: loginResponse.profile.metametrics_id,
        profileId: loginResponse.profile.profile_id
      }
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : JSON.stringify(e ?? "");
    throw new SignInError(`unable to perform SRP login: ${errorMessage}`);
  }
}

export {
  NONCE_URL,
  PAIR_IDENTIFIERS,
  OIDC_TOKEN_URL,
  SRP_LOGIN_URL,
  SIWE_LOGIN_URL,
  pairIdentifiers,
  getNonce,
  authorizeOIDC,
  authenticate
};
//# sourceMappingURL=chunk-WB6MUIML.mjs.map