import nock from 'nock';

import {
  MOCK_MFA_CREDENTIALS_RESPONSE,
  MOCK_MFA_CREDENTIALS_URL,
  MOCK_MFA_ENROLL_COMPLETE_RESPONSE,
  MOCK_MFA_ENROLL_COMPLETE_URL,
  MOCK_MFA_ENROLL_PASSKEY_RESPONSE,
  MOCK_MFA_ENROLL_URL,
  MOCK_MFA_VERIFY_COMPLETE_RESPONSE,
  MOCK_MFA_VERIFY_COMPLETE_URL,
  MOCK_MFA_VERIFY_PASSKEY_RESPONSE,
  MOCK_MFA_VERIFY_URL,
} from '../../../sdk/mocks/auth.js';
import {
  getMockAuthAccessTokenResponse,
  getMockAuthLoginResponse,
  getMockAuthNonceResponse,
} from '../mocks/mockResponses.js';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const mockEndpointGetNonce = (mockReply?: MockReply): nock.Scope => {
  const mockResponse = getMockAuthNonceResponse();
  const reply = mockReply ?? { status: 200, body: mockResponse.response };
  const mockNonceEndpoint = nock(mockResponse.url)
    .persist()
    .get('')
    .query(true)
    .reply(reply.status, reply.body);

  return mockNonceEndpoint;
};

export const mockEndpointLogin = (mockReply?: MockReply): nock.Scope => {
  const mockResponse = getMockAuthLoginResponse();
  const reply = mockReply ?? { status: 200, body: mockResponse.response };
  const mockLoginEndpoint = nock(mockResponse.url)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockLoginEndpoint;
};

export const mockEndpointAccessToken = (mockReply?: MockReply): nock.Scope => {
  const mockResponse = getMockAuthAccessTokenResponse();
  const reply = mockReply ?? { status: 200, body: mockResponse.response };
  const mockOidcTokensEndpoint = nock(mockResponse.url)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockOidcTokensEndpoint;
};

export const mockEndpointMfaEnroll = (mockReply?: MockReply): nock.Scope => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_MFA_ENROLL_PASSKEY_RESPONSE,
  };
  return nock(MOCK_MFA_ENROLL_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);
};

export const mockEndpointMfaEnrollComplete = (
  mockReply?: MockReply,
): nock.Scope => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_MFA_ENROLL_COMPLETE_RESPONSE,
  };
  return nock(MOCK_MFA_ENROLL_COMPLETE_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);
};

export const mockEndpointMfaVerify = (mockReply?: MockReply): nock.Scope => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_MFA_VERIFY_PASSKEY_RESPONSE,
  };
  return nock(MOCK_MFA_VERIFY_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);
};

export const mockEndpointMfaVerifyComplete = (
  mockReply?: MockReply,
): nock.Scope => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_MFA_VERIFY_COMPLETE_RESPONSE,
  };
  return nock(MOCK_MFA_VERIFY_COMPLETE_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);
};

export const mockEndpointMfaCredentials = (
  mockReply?: MockReply,
): nock.Scope => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_MFA_CREDENTIALS_RESPONSE,
  };
  return nock(MOCK_MFA_CREDENTIALS_URL)
    .persist()
    .get('')
    .reply(reply.status, reply.body);
};
