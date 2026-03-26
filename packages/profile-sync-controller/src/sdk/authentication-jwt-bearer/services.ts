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
 * Extracts error details from a Response object.
 *
 * @param response - The HTTP response object
 * @returns Formatted error message with HTTP status and response body
 */
async function getResponseErrorMessage(response: Response): Promise<string> {
  const { status } = response;
  const clonedResponse = response.clone();

  let message = 'Unknown error';
  let error = 'unknown';

  try {
    const responseBody = (await response.json()) as
      | ErrorMessage
      // eslint-disable-next-line @typescript-eslint/naming-convention
      | { error_description: string; error: string };

    message =
      'message' in responseBody
        ? responseBody.message
        : responseBody.error_description;
    error = responseBody.error ?? 'unknown';
  } catch {
    try {
      const textContent = await clonedResponse.text();
      message = textContent
        ? textContent.slice(0, 150)
        : 'Non-JSON error response';
      error = 'non_json_response';
    } catch {
      message = 'Unable to parse error response';
      error = 'unparseable_response';
    }
  }

  return `HTTP ${status} - ${message} (error: ${error})`;
}

/**
 * Type guard to check if an object is a Response-like object.
 *
 * @param obj - The object to check
 * @returns True if the object is a Response-like object, false otherwise
 */
const isErrorResponse = (obj: unknown): obj is Response =>
  typeof obj === 'object' &&
  obj !== null &&
  'status' in obj &&
  'headers' in obj;

/**
 * Throws a domain-specific error for service failures.
 * Handles both HTTP error responses and regular errors (network failures, etc.).
 * For HTTP 429, throws RateLimitedError with Retry-After header parsing.
 *
 * @param error - The error (Response object or caught error)
 * @param errorPrefix - Context prefix for the error message
 * @param ErrorClass - The domain-specific error class to throw
 * @throws RateLimitedError for 429, otherwise ErrorClass
 */
async function throwServiceError(
  error: unknown,
  errorPrefix: string,
  ErrorClass: new (message: string) => Error,
): Promise<never> {
  // Re-throw RateLimitedError or matching ErrorClass as-is (don't double-wrap)
  if (error instanceof RateLimitedError || error instanceof ErrorClass) {
    throw error;
  }

  // Not a Response-like object - handle as regular error
  if (!isErrorResponse(error)) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ErrorClass(`${errorPrefix}: ${errorMessage}`);
  }

  // Handle HTTP error response
  const response = error;
  const { status } = response;
  const responseMessage = await getResponseErrorMessage(response);

  if (status === HTTP_STATUS_CODES.TOO_MANY_REQUESTS) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterMs = parseRetryAfter(retryAfterHeader);
    throw new RateLimitedError(
      `${errorPrefix}: ${responseMessage}`,
      retryAfterMs ?? undefined,
    );
  }

  throw new ErrorClass(`${errorPrefix}: ${responseMessage}`);
}

export const NONCE_URL = (env: Env): string =>
  `${getEnvUrls(env).authApiUrl}/api/v2/nonce`;

export const PAIR_IDENTIFIERS = (env: Env): string =>
  `${getEnvUrls(env).authApiUrl}/api/v2/identifiers/pair`;

export const OIDC_TOKEN_URL = (env: Env): string =>
  `${getEnvUrls(env).oidcApiUrl}/oauth2/token`;

export const SRP_LOGIN_URL = (env: Env): string =>
  `${getEnvUrls(env).authApiUrl}/api/v2/srp/login`;

export const SIWE_LOGIN_URL = (env: Env): string =>
  `${getEnvUrls(env).authApiUrl}/api/v2/siwe/login`;

export const PROFILE_LINEAGE_URL = (env: Env): string =>
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  raw_message: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  encrypted_storage_key: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
      return await throwServiceError(
        response,
        'Failed to pair identifiers',
        PairError,
      );
    }
    return undefined;
  } catch (error) {
    return await throwServiceError(
      error,
      'Failed to pair identifiers',
      PairError,
    );
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
      return await throwServiceError(
        nonceResponse,
        'Failed to get nonce',
        NonceRetrievalError,
      );
    }

    const nonceJson = await nonceResponse.json();
    return {
      nonce: nonceJson.nonce,
      identifier: nonceJson.identifier,
      expiresIn: nonceJson.expires_in,
    };
  } catch (error) {
    return await throwServiceError(
      error,
      'Failed to get nonce',
      NonceRetrievalError,
    );
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
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

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
      return await throwServiceError(
        response,
        'Failed to get access token',
        SignInError,
      );
    }

    const accessTokenResponse = await response.json();
    return {
      accessToken: accessTokenResponse.access_token,
      expiresIn: accessTokenResponse.expires_in,
      obtainedAt: Date.now(),
    };
  } catch (error) {
    return await throwServiceError(
      error,
      'Failed to get access token',
      SignInError,
    );
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
      return await throwServiceError(
        response,
        `Failed to login with ${authType}`,
        SignInError,
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
  } catch (error) {
    return await throwServiceError(
      error,
      `Failed to login with ${authType}`,
      SignInError,
    );
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
      return await throwServiceError(
        response,
        'Failed to get profile lineage',
        SignInError,
      );
    }

    const profileJson: UserProfileLineage = await response.json();
    return profileJson;
  } catch (error) {
    return await throwServiceError(
      error,
      'Failed to get profile lineage',
      SignInError,
    );
  }
}
