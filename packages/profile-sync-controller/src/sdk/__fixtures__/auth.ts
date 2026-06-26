import nock from 'nock';

import {
  MOCK_NONCE_RESPONSE,
  MOCK_NONCE_URL,
  MOCK_OIDC_TOKEN_RESPONSE,
  MOCK_OIDC_TOKEN_URL,
  MOCK_PAIR_IDENTIFIERS_URL,
  MOCK_PAIR_PROFILES_RESPONSE,
  MOCK_PAIR_PROFILES_URL,
  MOCK_PROFILE_LINEAGE_URL,
  MOCK_SIWE_LOGIN_RESPONSE,
  MOCK_SIWE_LOGIN_URL,
  MOCK_SRP_LOGIN_RESPONSE,
  MOCK_SRP_LOGIN_URL,
  MOCK_USER_PROFILE_LINEAGE_RESPONSE,
} from '../mocks/auth';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const handleMockNonce = (mockReply?: MockReply): nock.Scope => {
  const reply = mockReply ?? { status: 200, body: MOCK_NONCE_RESPONSE };

  const mockNonceEndpoint = nock(MOCK_NONCE_URL)
    .persist()
    .get('')
    .query(true)
    .reply(reply.status, reply.body);

  return mockNonceEndpoint;
};

export const handleMockSiweLogin = (mockReply?: MockReply): nock.Scope => {
  const reply = mockReply ?? { status: 200, body: MOCK_SIWE_LOGIN_RESPONSE };
  const mockLoginEndpoint = nock(MOCK_SIWE_LOGIN_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockLoginEndpoint;
};

export const handleMockPairIdentifiers = (
  mockReply?: MockReply,
): nock.Scope => {
  const reply = mockReply ?? { status: 204 };
  const mockPairIdentifiersEndpoint = nock(MOCK_PAIR_IDENTIFIERS_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockPairIdentifiersEndpoint;
};

export const handleMockPairProfiles = (mockReply?: MockReply): nock.Scope => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_PAIR_PROFILES_RESPONSE,
  };
  const mockPairProfilesEndpoint = nock(MOCK_PAIR_PROFILES_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockPairProfilesEndpoint;
};

export const handleMockSrpLogin = (mockReply?: MockReply): nock.Scope => {
  const reply = mockReply ?? { status: 200, body: MOCK_SRP_LOGIN_RESPONSE };
  const mockLoginEndpoint = nock(MOCK_SRP_LOGIN_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockLoginEndpoint;
};

export const handleMockOAuth2Token = (mockReply?: MockReply): nock.Scope => {
  const reply = mockReply ?? { status: 200, body: MOCK_OIDC_TOKEN_RESPONSE };
  const mockTokenEndpoint = nock(MOCK_OIDC_TOKEN_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockTokenEndpoint;
};

export const handleMockUserProfileLineage = (
  mockReply?: MockReply,
): nock.Scope => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_USER_PROFILE_LINEAGE_RESPONSE,
  };
  const mockUserProfileLineageEndpoint = nock(MOCK_PROFILE_LINEAGE_URL)
    .persist()
    .get('')
    .query(true)
    .reply(reply.status, reply.body);

  return mockUserProfileLineageEndpoint;
};

export const arrangeAuthAPIs = (options?: {
  mockNonceUrl?: MockReply;
  mockOAuth2TokenUrl?: MockReply;
  mockSrpLoginUrl?: MockReply;
  mockSiweLoginUrl?: MockReply;
  mockPairIdentifiers?: MockReply;
  mockPairProfiles?: MockReply;
  mockUserProfileLineageUrl?: MockReply;
}): {
  mockNonceUrl: nock.Scope;
  mockOAuth2TokenUrl: nock.Scope;
  mockSrpLoginUrl: nock.Scope;
  mockSiweLoginUrl: nock.Scope;
  mockPairIdentifiersUrl: nock.Scope;
  mockPairProfilesUrl: nock.Scope;
  mockUserProfileLineageUrl: nock.Scope;
} => {
  const mockNonceUrl = handleMockNonce(options?.mockNonceUrl);
  const mockOAuth2TokenUrl = handleMockOAuth2Token(options?.mockOAuth2TokenUrl);
  const mockSrpLoginUrl = handleMockSrpLogin(options?.mockSrpLoginUrl);
  const mockSiweLoginUrl = handleMockSiweLogin(options?.mockSiweLoginUrl);
  const mockPairIdentifiersUrl = handleMockPairIdentifiers(
    options?.mockPairIdentifiers,
  );
  const mockPairProfilesUrl = handleMockPairProfiles(options?.mockPairProfiles);
  const mockUserProfileLineageUrl = handleMockUserProfileLineage(
    options?.mockUserProfileLineageUrl,
  );

  return {
    mockNonceUrl,
    mockOAuth2TokenUrl,
    mockSrpLoginUrl,
    mockSiweLoginUrl,
    mockPairIdentifiersUrl,
    mockPairProfilesUrl,
    mockUserProfileLineageUrl,
  };
};
