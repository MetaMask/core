import type {
  AccessToken,
  ErrorMessage,
  UserProfile,
  UserProfileLineage,
} from './types';
import { AuthType } from './types';
import type { Env, Platform } from '../../shared/env';
import { getEnvUrls, getOidcClientId } from '../../shared/env';
import type { MetaMetricsAuth } from '../../shared/types/services';
import { HTTP_STATUS_CODES } from '../constants';
import {
  NonceRetrievalError,
  PairError,
  SignInError,
  ValidationError,
  RateLimitedError,
} from '../errors';

/**
 * Parse Retry-After header into milliseconds if possible.
 * Supports seconds or HTTP-date formats.
 *
 * @param retryAfterHeader - The Retry-After header value (seconds or HTTP-date)
 * @returns The retry delay in milliseconds, or null if parsing fails
 */
function parseRetryAfter(retryAfterHeader: string | null): number | null {
  if (!retryAfterHeader) {
    return null;
  }
  const seconds = Number(retryAfterHeader);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }
  const date = Date.parse(retryAfterHeader);
  if (!Number.isNaN(date)) {
    const diff = date - Date.now();
    return diff > 0 ? diff : null;
  }
  return null;
}

/**
 * Handle HTTP error responses with rate limiting support.
 *
 * @param response - The HTTP response object
 * @param errorPrefix - Optional prefix for the error message
 * @throws RateLimitedError for 429 responses
 * @throws Error for other error responses
 */
async function handleErrorResponse(
  response: Response,
  errorPrefix?: string,
): Promise<never> {
  const { status } = response;
  const retryAfterHeader = response.headers.get('Retry-After');
  const retryAfterMs = parseRetryAfter(retryAfterHeader);

  const responseBody = (await response.json()) as
    | ErrorMessage
    | { error_description: string; error: string };

  const message =
    'message' in responseBody
      ? responseBody.message
      : responseBody.error_description;
  const { error } = responseBody;

  if (status === HTTP_STATUS_CODES.TOO_MANY_REQUESTS) {
    throw new RateLimitedError(
      `HTTP ${HTTP_STATUS_CODES.TOO_MANY_REQUESTS}: ${message} (error: ${error})`,
      retryAfterMs ?? undefined,
    );
  }

  const prefix = errorPrefix ? `${errorPrefix} ` : '';
  throw new Error(`${prefix}HTTP ${status} error: ${message}, error: ${error}`);
}

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

export const PROFILE_LINEAGE_URL = (env: Env) =>
  `${getEnvUrls(env).authApiUrl}/api/v2/profile/lineage`;

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
      await handleErrorResponse(response);
    }
  } catch (e) {
    // Re-throw RateLimitedError to preserve 429 status and retry metadata
    if (RateLimitedError.isRateLimitError(e)) {
      throw e;
    }
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
      await handleErrorResponse(nonceResponse);
    }

    const nonceJson = await nonceResponse.json();
    return {
      nonce: nonceJson.nonce,
      identifier: nonceJson.identifier,
      expiresIn: nonceJson.expires_in,
    };
  } catch (e) {
    // Re-throw RateLimitedError to preserve 429 status and retry metadata
    if (RateLimitedError.isRateLimitError(e)) {
      throw e;
    }
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
      await handleErrorResponse(response);
    }

    const accessTokenResponse = await response.json();
    return {
      accessToken: accessTokenResponse.access_token,
      expiresIn: accessTokenResponse.expires_in,
      obtainedAt: Date.now(),
    };
  } catch (e) {
    // Re-throw RateLimitedError to preserve 429 status and retry metadata
    if (RateLimitedError.isRateLimitError(e)) {
      throw e;
    }
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
 * @param metametrics - optional metametrics
 * @returns Authentication Token
 */
export async function authenticate(
  rawMessage: string,
  signature: string,
  authType: AuthType,
  env: Env,
  metametrics?: MetaMetricsAuth,
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
        ...(metametrics
          ? {
              metametrics: {
                metametrics_id: await metametrics.getMetaMetricsId(),
                agent: metametrics.agent,
              },
            }
          : {}),
      }),
    });

    if (!response.ok) {
      await handleErrorResponse(response, `${authType} login`);
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
    // Re-throw RateLimitedError to preserve 429 status and retry metadata
    if (RateLimitedError.isRateLimitError(e)) {
      throw e;
    }
    /* istanbul ignore next */
    const errorMessage =
      e instanceof Error ? e.message : JSON.stringify(e ?? '');
    throw new SignInError(`unable to perform SRP login: ${errorMessage}`);
  }
}

/**
 * Service to get the Profile Lineage
 *
 * @param env - server environment
 * @param accessToken - JWT access token used to access protected resources
 * @returns Profile Lineage information.
 */
export async function getUserProfileLineage(
  env: Env,
  accessToken: string,
): Promise<UserProfileLineage> {
  const profileLineageUrl = new URL(PROFILE_LINEAGE_URL(env));

  try {
    const response = await fetch(profileLineageUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      await handleErrorResponse(response, 'profile lineage');
    }

    const profileJson: UserProfileLineage = await response.json();

    return profileJson;
  } catch (e) {
    // Re-throw RateLimitedError to preserve 429 status and retry metadata
    if (RateLimitedError.isRateLimitError(e)) {
      throw e;
    }
    /* istanbul ignore next */
    const errorMessage =
      e instanceof Error ? e.message : JSON.stringify(e ?? '');
    throw new SignInError(`failed to get profile lineage: ${errorMessage}`);
  }
}
