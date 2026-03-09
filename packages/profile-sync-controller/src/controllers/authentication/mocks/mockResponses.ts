import {
  MOCK_NONCE_RESPONSE as SDK_MOCK_NONCE_RESPONSE,
  MOCK_JWT as SDK_MOCK_JWT,
  MOCK_SRP_LOGIN_RESPONSE as SDK_MOCK_SRP_LOGIN_RESPONSE,
  MOCK_OIDC_TOKEN_RESPONSE as SDK_MOCK_OIDC_TOKEN_RESPONSE,
  MOCK_NONCE_URL,
  MOCK_SRP_LOGIN_URL,
  MOCK_OIDC_TOKEN_URL,
} from '../../../sdk/mocks/auth';

type MockResponse = {
  url: string;
  requestMethod: 'GET' | 'POST' | 'PUT';
  response: unknown;
};

export const MOCK_NONCE_RESPONSE = SDK_MOCK_NONCE_RESPONSE;
export const MOCK_NONCE = MOCK_NONCE_RESPONSE.nonce;
export const MOCK_JWT = SDK_MOCK_JWT;

export const getMockAuthNonceResponse = () => {
  return {
    url: MOCK_NONCE_URL,
    requestMethod: 'GET',
    response: (
      _?: unknown,
      path?: string,
      getE2ESrpIdentifierForPublicKey?: (publicKey: string) => string,
    ) => {
      // The goal here is to have this identifier bubble all the way up to being the access token
      // That way, we can use it to segregate data in the test environment
      const identifier = path?.split('?identifier=')[1];
      const e2eIdentifier = getE2ESrpIdentifierForPublicKey?.(identifier ?? '');

      return {
        ...MOCK_NONCE_RESPONSE,
        nonce: e2eIdentifier ?? MOCK_NONCE_RESPONSE.nonce,
        identifier: MOCK_NONCE_RESPONSE.identifier,
      };
    },
  } satisfies MockResponse;
};

export const MOCK_LOGIN_RESPONSE = SDK_MOCK_SRP_LOGIN_RESPONSE;

export const getMockAuthLoginResponse = () => {
  return {
    url: MOCK_SRP_LOGIN_URL,
    requestMethod: 'POST',
    // In case this mock is used in an E2E test, we populate token, profile_id and identifier_id with the e2eIdentifier
    // to make it easier to segregate data in the test environment.
    response: (requestJsonBody?: { raw_message: string }) => {
      const splittedRawMessage = requestJsonBody?.raw_message.split(':');
      const e2eIdentifier = splittedRawMessage?.[splittedRawMessage.length - 2];

      return {
        ...MOCK_LOGIN_RESPONSE,
        token: e2eIdentifier ?? MOCK_LOGIN_RESPONSE.token,
        profile: {
          ...MOCK_LOGIN_RESPONSE.profile,
          profile_id: e2eIdentifier ?? MOCK_LOGIN_RESPONSE.profile.profile_id,
          identifier_id:
            e2eIdentifier ?? MOCK_LOGIN_RESPONSE.profile.identifier_id,
        },
      };
    },
  } satisfies MockResponse;
};

export const MOCK_OATH_TOKEN_RESPONSE = SDK_MOCK_OIDC_TOKEN_RESPONSE;

const MOCK_JWT_FAR_FUTURE_EXP = 4102444800; // 2100-01-01

/**
 * Wraps a plain-text identifier in a minimal JWT so that client-side
 * JWT validation (exp check) passes in E2E tests. The identifier is
 * stored in the `sub` claim and can be extracted via {@link getE2EIdentifierFromJwt}.
 *
 * @param identifier - The plain-text E2E identifier to wrap.
 * @returns A JWT-shaped string containing the identifier.
 */
const wrapInMockJwt = (identifier: string): string => {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({ sub: identifier, exp: MOCK_JWT_FAR_FUTURE_EXP }),
  );
  return `${header}.${payload}.mock`;
};

/**
 * Extracts the E2E identifier (`sub` claim) from a mock JWT created
 * by {@link wrapInMockJwt}. Falls back to returning the raw token if
 * decoding fails (backward compatibility with raw-identifier headers).
 *
 * @param token - A bearer token string (JWT or raw identifier).
 * @returns The decoded identifier, or the original token as-is.
 */
export const getE2EIdentifierFromJwt = (token: string): string => {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const { sub } = JSON.parse(atob(parts[1]));
      if (typeof sub === 'string' && sub.length > 0) {
        return sub;
      }
    }
  } catch {
    // not a JWT — fall through
  }
  return token;
};

export const getMockAuthAccessTokenResponse = () => {
  return {
    url: MOCK_OIDC_TOKEN_URL,
    requestMethod: 'POST',
    response: (requestJsonBody?: string) => {
      // We wrap the e2eIdentifier in a JWT so client-side JWT validation passes.
      // The mock server extracts the identifier back via getE2EIdentifierFromJwt.
      const e2eIdentifier = new URLSearchParams(requestJsonBody).get(
        'assertion',
      );

      return {
        ...MOCK_OATH_TOKEN_RESPONSE,
        access_token: e2eIdentifier
          ? wrapInMockJwt(e2eIdentifier)
          : MOCK_OATH_TOKEN_RESPONSE.access_token,
      };
    },
  } satisfies MockResponse;
};
