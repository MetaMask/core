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
    response: MOCK_NONCE_RESPONSE,
  } satisfies MockResponse;
};

export const MOCK_LOGIN_RESPONSE = SDK_MOCK_SRP_LOGIN_RESPONSE;

export const getMockAuthLoginResponse = () => {
  return {
    url: MOCK_SRP_LOGIN_URL,
    requestMethod: 'POST',
    response: MOCK_LOGIN_RESPONSE,
  } satisfies MockResponse;
};

export const MOCK_OATH_TOKEN_RESPONSE = SDK_MOCK_OIDC_TOKEN_RESPONSE;

export const getMockAuthAccessTokenResponse = () => {
  return {
    url: MOCK_OIDC_TOKEN_URL,
    requestMethod: 'POST',
    response: MOCK_OATH_TOKEN_RESPONSE,
  } satisfies MockResponse;
};
