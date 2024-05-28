import type { Env, Platform } from '../env';
import { getEnvUrls, getOidcClientId } from '../env';
import {
  NonceRetrievalError,
  PairError,
  SignInError,
  ValidationError,
} from '../errors';
import type { AccessToken, ErrorMessage, UserProfile } from './types';
import { AuthType } from './types';

export const NONCE_URL = (env: Env) =>
  `${getEnvUrls(env).authApiUrl}/api/v2/nonce`;

export const PAIR_IDENTIFIERS = (env: Env) =>
  `${getEnvUrls(env).authApiUrl}/api/v2/identifiers/pair`;

export const OIDC_TOKEN_URL = (env: Env) =>
  `${getEnvUrls(env).oidcApiUrl}/oauth2/token`;

export const SRP_LOGIN_URL = (env: Env) =>
  `${getEnvUrls(env).authApiUrl}/api/v2/srp/login`;

export const SIWE_LOGIN_URL = (env: Env) =>
  `${getEnvUrls(env).authApiUrl}/api/v2/siwe/login`;

const getAuthenticationUrl = (authType: AuthType, env: Env): string => {
  switch (authType) {
    case AuthType.SRP:
      return SRP_LOGIN_URL(env);
    case AuthType.SiWE:
      return SIWE_LOGIN_URL(env);
    /* istanbul ignore next */
    default:
      throw new ValidationError(
        `Invalid AuthType: ${authType as number} - unable to create Auth URL`,
      );
  }
};

type NonceResponse = {
  nonce: string;
  identifier: string;
  expiresIn: number;
};

type PairRequest = {
  signature: string;
  raw_message: string;
  encrypted_storage_key: string;
  identifier_type: 'SIWE' | 'SRP';
};

/**
 * Pair multiple identifiers under a single profile
 *
 * @param nonce - session nonce
 * @param logins - pairing request payload
 * @param accessToken - JWT access token used to access protected resources
 * @param env - server environment
 * @returns void.
 */
export async function pairIdentifiers(
  nonce: string,
  logins: PairRequest[],
  accessToken: string,
  env: Env,
): Promise<void> {
  const pairUrl = new URL(PAIR_IDENTIFIERS(env));

  try {
    const response = await fetch(pairUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        nonce,
        logins,
      }),
    });

    if (!response.ok) {
      const responseBody = (await response.json()) as ErrorMessage;
      throw new Error(
        `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
      );
    }
  } catch (e) {
    /* istanbul ignore next */
    const errorMessage =
      e instanceof Error ? e.message : JSON.stringify(e ?? '');
    throw new PairError(`unable to pair identifiers: ${errorMessage}`);
  }
}

/**
 * Service to Get Nonce for JWT Bearer Flow
 *
 * @param id - identifier ID
 * @param env - server environment
 * @returns the nonce.
 */
export async function getNonce(id: string, env: Env): Promise<NonceResponse> {
  const nonceUrl = new URL(NONCE_URL(env));
  nonceUrl.searchParams.set('identifier', id);

  try {
    const nonceResponse = await fetch(nonceUrl.toString());
    if (!nonceResponse.ok) {
      const responseBody = (await nonceResponse.json()) as ErrorMessage;
      throw new Error(
        `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
      );
    }

    const nonceJson = await nonceResponse.json();
    return {
      nonce: nonceJson.nonce,
      identifier: nonceJson.identifier,
      expiresIn: nonceJson.expires_in,
    };
  } catch (e) {
    /* istanbul ignore next */
    const errorMessage =
      e instanceof Error ? e.message : JSON.stringify(e ?? '');
    throw new NonceRetrievalError(`failed to generate nonce: ${errorMessage}`);
  }
}

/**
 * Service to Authorize And perform OIDC Flow to get the Access Token
 *
 * @param jwtToken - The original token received from Authentication. This is traded for the Access Token. (the authentication token is single-use)
 * @param env - server environment
 * @param platform - SDK platform
 * @returns Access Token from Authorization server
 */
export async function authorizeOIDC(
  jwtToken: string,
  env: Env,
  platform: Platform,
): Promise<AccessToken> {
  const grantType = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
  const headers = new Headers({
    'Content-Type': 'application/x-www-form-urlencoded',
  });

  const urlEncodedBody = new URLSearchParams();
  urlEncodedBody.append('grant_type', grantType);
  urlEncodedBody.append('client_id', getOidcClientId(env, platform));
  urlEncodedBody.append('assertion', jwtToken);

  try {
    const response = await fetch(OIDC_TOKEN_URL(env), {
      method: 'POST',
      headers,
      body: urlEncodedBody.toString(),
    });

    if (!response.ok) {
      const responseBody = (await response.json()) as {
        error_description: string;
        error: string;
      };
      throw new Error(
        `HTTP error: ${responseBody.error_description}, error code: ${responseBody.error}`,
      );
    }

    const accessTokenResponse = await response.json();
    return {
      accessToken: accessTokenResponse.access_token,
      expiresIn: accessTokenResponse.expires_in,
      obtainedAt: Date.now(),
    };
  } catch (e) {
    /* istanbul ignore next */
    const errorMessage =
      e instanceof Error ? e.message : JSON.stringify(e ?? '');
    throw new SignInError(`unable to get access token: ${errorMessage}`);
  }
}

type Authentication = {
  token: string;
  expiresIn: number;
  profile: UserProfile;
};
/**
 * Service to Authenticate/Login a user via SIWE or SRP derived key.
 *
 * @param rawMessage - raw message for validation when authenticating
 * @param signature - signed raw message
 * @param authType - authentication type/flow used
 * @param env - server environment
 * @returns Authentication Token
 */
export async function authenticate(
  rawMessage: string,
  signature: string,
  authType: AuthType,
  env: Env,
): Promise<Authentication> {
  const authenticationUrl = getAuthenticationUrl(authType, env);

  try {
    const response = await fetch(authenticationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signature,
        raw_message: rawMessage,
      }),
    });

    if (!response.ok) {
      const responseBody = (await response.json()) as ErrorMessage;
      throw new Error(
        `${authType} login HTTP error: ${responseBody.message}, error code: ${responseBody.error}`,
      );
    }

    const loginResponse = await response.json();
    return {
      token: loginResponse.token,
      expiresIn: loginResponse.expires_in,
      profile: {
        identifierId: loginResponse.profile.identifier_id,
        metaMetricsId: loginResponse.profile.metametrics_id,
        profileId: loginResponse.profile.profile_id,
      },
    };
  } catch (e) {
    /* istanbul ignore next */
    const errorMessage =
      e instanceof Error ? e.message : JSON.stringify(e ?? '');
    throw new SignInError(`unable to perform SRP login: ${errorMessage}`);
  }
}
