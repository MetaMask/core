import {
  NONCE_URL,
  OIDC_TOKEN_URL,
  PAIR_SOCIAL_IDENTIFIER,
  SRP_LOGIN_URL,
} from '../../../sdk/authentication-jwt-bearer/services';
import {
  MOCK_JWT as SDK_MOCK_JWT,
  MOCK_NONCE_RESPONSE as SDK_MOCK_NONCE_RESPONSE,
  MOCK_OIDC_TOKEN_RESPONSE as SDK_MOCK_OIDC_TOKEN_RESPONSE,
  MOCK_SRP_LOGIN_RESPONSE as SDK_MOCK_SRP_LOGIN_RESPONSE,
} from '../../../sdk/mocks/auth';
import { Env } from '../../../shared/env';

type MockResponse = {
  url: string;
  requestMethod: 'GET' | 'POST' | 'PUT';
  response: unknown;
  statusCode?: number;
};

export const MOCK_NONCE_RESPONSE = SDK_MOCK_NONCE_RESPONSE;
export const MOCK_NONCE = MOCK_NONCE_RESPONSE.nonce;
export const MOCK_JWT = SDK_MOCK_JWT;

export const getMockAuthNonceResponse = (env: Env = Env.PRD) => {
  return {
    url: NONCE_URL(env),
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
        nonce: e2eIdentifier ?? MOCK_NONCE,
        identifier: MOCK_NONCE_RESPONSE.identifier,
      };
    },
  } satisfies MockResponse;
};

export const MOCK_LOGIN_RESPONSE = SDK_MOCK_SRP_LOGIN_RESPONSE;

export const getMockAuthLoginResponse = (env: Env = Env.PRD) => {
  return {
    url: SRP_LOGIN_URL(env),
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

export const getMockAuthAccessTokenResponse = (env: Env = Env.PRD) => {
  return {
    url: OIDC_TOKEN_URL(env),
    requestMethod: 'POST',
    response: (requestJsonBody?: string) => {
      // We end up setting the access token to the e2eIdentifier in the test environment
      // This is then attached to every request's Authorization header
      // and used to segregate data in the test environment
      const e2eIdentifier = new URLSearchParams(requestJsonBody).get(
        'assertion',
      );

      return {
        ...MOCK_OATH_TOKEN_RESPONSE,
        access_token: e2eIdentifier ?? MOCK_OATH_TOKEN_RESPONSE.access_token,
      };
    },
  } satisfies MockResponse;
};

export const getMockPairSocialTokenResponse = (env: Env = Env.PRD) => {
  return {
    url: PAIR_SOCIAL_IDENTIFIER(env),
    requestMethod: 'POST',
    response: () => {
      return 'OK';
    },
    statusCode: 204,
  } satisfies MockResponse;
};
