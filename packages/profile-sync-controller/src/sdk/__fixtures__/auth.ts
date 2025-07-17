import nock from 'nock';

import {
  MOCK_NONCE_RESPONSE,
  MOCK_NONCE_URL,
  MOCK_OIDC_TOKEN_RESPONSE,
  MOCK_OIDC_TOKEN_URL,
  MOCK_PAIR_IDENTIFIERS_URL,
  MOCK_PAIR_SOCIAL_IDENTIFIER_URL,
  MOCK_PROFILE_METAMETRICS_URL,
  MOCK_SIWE_LOGIN_RESPONSE,
  MOCK_SIWE_LOGIN_URL,
  MOCK_SRP_LOGIN_RESPONSE,
  MOCK_SRP_LOGIN_URL,
  MOCK_USER_PROFILE_METAMETRICS_RESPONSE,
} from '../mocks/auth';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const handleMockNonce = (mockReply?: MockReply) => {
  const reply = mockReply ?? { status: 200, body: MOCK_NONCE_RESPONSE };

  const mockNonceEndpoint = nock(MOCK_NONCE_URL)
    .persist()
    .get('')
    .query(true)
    .reply(reply.status, reply.body);

  return mockNonceEndpoint;
};

export const handleMockSiweLogin = (mockReply?: MockReply) => {
  const reply = mockReply ?? { status: 200, body: MOCK_SIWE_LOGIN_RESPONSE };
  const mockLoginEndpoint = nock(MOCK_SIWE_LOGIN_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockLoginEndpoint;
};

export const handleMockPairIdentifiers = (mockReply?: MockReply) => {
  const reply = mockReply ?? { status: 204 };
  const mockPairIdentifiersEndpoint = nock(MOCK_PAIR_IDENTIFIERS_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockPairIdentifiersEndpoint;
};

export const handleMockPairSocialIdentifier = (mockReply?: MockReply) => {
  const reply = mockReply ?? { status: 200 };
  const mockPairSocialIdentifierEndpoint = nock(MOCK_PAIR_SOCIAL_IDENTIFIER_URL)
    .post('')
    .reply(reply.status, reply.body);

  return mockPairSocialIdentifierEndpoint;
};

export const handleMockSrpLogin = (mockReply?: MockReply) => {
  const reply = mockReply ?? { status: 200, body: MOCK_SRP_LOGIN_RESPONSE };
  const mockLoginEndpoint = nock(MOCK_SRP_LOGIN_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockLoginEndpoint;
};

export const handleMockOAuth2Token = (mockReply?: MockReply) => {
  const reply = mockReply ?? { status: 200, body: MOCK_OIDC_TOKEN_RESPONSE };
  const mockTokenEndpoint = nock(MOCK_OIDC_TOKEN_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockTokenEndpoint;
};

export const handleMockUserProfileMetaMetrics = (mockReply?: MockReply) => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_USER_PROFILE_METAMETRICS_RESPONSE,
  };
  const mockUserProfileMetaMetricsEndpoint = nock(MOCK_PROFILE_METAMETRICS_URL)
    .persist()
    .get('')
    .query(true)
    .reply(reply.status, reply.body);

  return mockUserProfileMetaMetricsEndpoint;
};

export const arrangeAuthAPIs = (options?: {
  mockNonceUrl?: MockReply;
  mockOAuth2TokenUrl?: MockReply;
  mockSrpLoginUrl?: MockReply;
  mockSiweLoginUrl?: MockReply;
  mockPairIdentifiers?: MockReply;
  mockPairSocialIdentifier?: MockReply;
  mockUserProfileMetaMetrics?: MockReply;
}) => {
  const mockNonceUrl = handleMockNonce(options?.mockNonceUrl);
  const mockOAuth2TokenUrl = handleMockOAuth2Token(options?.mockOAuth2TokenUrl);
  const mockSrpLoginUrl = handleMockSrpLogin(options?.mockSrpLoginUrl);
  const mockSiweLoginUrl = handleMockSiweLogin(options?.mockSiweLoginUrl);
  const mockPairIdentifiersUrl = handleMockPairIdentifiers(
    options?.mockPairIdentifiers,
  );
  const mockPairSocialIdentifierUrl = handleMockPairSocialIdentifier(
    options?.mockPairSocialIdentifier,
  );
  const mockUserProfileMetaMetricsUrl = handleMockUserProfileMetaMetrics(
    options?.mockUserProfileMetaMetrics,
  );

  return {
    mockNonceUrl,
    mockOAuth2TokenUrl,
    mockSrpLoginUrl,
    mockSiweLoginUrl,
    mockPairIdentifiersUrl,
    mockPairSocialIdentifierUrl,
    mockUserProfileMetaMetricsUrl,
  };
};
