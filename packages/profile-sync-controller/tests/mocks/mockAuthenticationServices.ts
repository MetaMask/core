/* eslint-disable jsdoc/require-returns */
/* eslint-disable jsdoc/require-description */
/* eslint-disable jsdoc/require-jsdoc */
import nock from 'nock';

import type { Env } from '../../src/sdk/env';
import { getEnvUrls } from '../../src/sdk/env';
import type {
  LoginResponse,
  NonceResponse,
  OAuthTokenResponse,
} from '../../src/services/authentication-controller';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const MOCK_NONCE = '4cbfqzoQpcNxVImGv';
const MOCK_NONCE_RESPONSE: NonceResponse = {
  nonce: MOCK_NONCE,
};
/**
 * Mocks the endpoint for getting a nonce.
 *
 * @param env - The environment DEV | UAT | PRD.
 * @param [mockReply] - The mock reply object.
 * @param [mockReply.status] - The status code to be used in the mock reply. Defaults to 200.
 * @param [mockReply.body] - The body of the mock reply. Defaults to MOCK_NONCE_RESPONSE.
 * @returns The mocked nonce endpoint.
 */
export function mockEndpointGetNonce(env: Env, mockReply?: MockReply) {
  const reply = mockReply ?? { status: 200, body: MOCK_NONCE_RESPONSE };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockNonceEndpoint = `${getEnvUrls(env).authApiUrl}/api/v2/nonce` as any;
  mockNonceEndpoint.get('').query(true).reply(reply.status, reply.body);

  return mockNonceEndpoint;
}

export const MOCK_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
export const MOCK_LOGIN_RESPONSE: LoginResponse = {
  token: MOCK_JWT,
  expires_in: new Date().toString(),
  profile: {
    identifier_id: 'MOCK_IDENTIFIER',
    profile_id: 'MOCK_PROFILE_ID',
  },
};
/**
 * Mocks the login endpoint for testing purposes.
 *
 * @param env - The environment DEV | UAT | PRD.
 * @param [mockReply] - The optional mock reply object.
 * @param [mockReply.status] - The status code to be used in the mock reply. Defaults to 200.
 * @param [mockReply.body] - The body of the mock reply. Defaults to MOCK_LOGIN_RESPONSE.
 * @returns The mocked login endpoint.
 */
export function mockEndpointLogin(env: Env, mockReply?: MockReply) {
  const reply = mockReply ?? { status: 200, body: MOCK_LOGIN_RESPONSE };
  const mockLoginEndpoint = nock(
    `${getEnvUrls(env).authApiUrl}/api/v2/srp/login`,
  )
    .post('')
    .reply(reply.status, reply.body);

  return mockLoginEndpoint;
}

export const MOCK_ACCESS_TOKEN = `MOCK_ACCESS_TOKEN-${MOCK_JWT}`;
const MOCK_OATH_TOKEN_RESPONSE: OAuthTokenResponse = {
  access_token: MOCK_ACCESS_TOKEN,
  expires_in: new Date().getTime(),
};
/**
 * Mocks the endpoint for getting an OAuth access token.
 *
 * @param env - The environment DEV | UAT | PRD.
 * @param [mockReply] - Optional mock reply object.
 * @param [mockReply.status] - The status code to be used in the mock reply. Defaults to 200.
 * @param [mockReply.body] - The body of the mock reply. Defaults to MOCK_OATH_TOKEN_RESPONSE.
 * @returns The mocked OAuth tokens endpoint.
 */
export function mockEndpointAccessToken(env: Env, mockReply?: MockReply) {
  const reply = mockReply ?? { status: 200, body: MOCK_OATH_TOKEN_RESPONSE };
  const mockOidcTokensEndpoint = nock(
    `${getEnvUrls(env).oidcApiUrl}/oauth2/token`,
  )
    .post('')
    .reply(reply.status, reply.body);

  return mockOidcTokensEndpoint;
}
