import nock from 'nock';

import {
  MOCK_NONCE_RESPONSE,
  MOCK_NONCE_URL,
  MOCK_OIDC_TOKEN_RESPONSE,
  MOCK_OIDC_TOKEN_URL,
  MOCK_PAIR_IDENTIFIERS_URL,
  MOCK_PAIR_PROFILES_RESPONSE,
  MOCK_PAIR_PROFILES_URL,
  MOCK_PAIR_SOCIAL_IDENTIFIER_RESPONSE,
  MOCK_PAIR_SOCIAL_IDENTIFIER_URL,
  MOCK_PROFILE_LINEAGE_URL,
  MOCK_SIWE_LOGIN_RESPONSE,
  MOCK_SIWE_LOGIN_URL,
  MOCK_SRP_LOGIN_RESPONSE,
  MOCK_SRP_LOGIN_URL,
  MOCK_USER_PROFILE_LINEAGE_RESPONSE,
  MOCK_CUSTOMER_SERVICE_TOKEN_URL,
  MOCK_CUSTOMER_SERVICE_TOKEN_RESPONSE,
  MOCK_PARTNER_IDENTITY_TOKEN_URL,
  MOCK_PARTNER_IDENTITY_TOKEN_RESPONSE,
} from '../mocks/auth.js';

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

export const handleMockPairProfiles = (
  mockReply?: MockReply,
  delayMs?: number,
): nock.Scope => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_PAIR_PROFILES_RESPONSE,
  };
  const interceptor = nock(MOCK_PAIR_PROFILES_URL).persist().post('');
  if (delayMs !== undefined && delayMs > 0) {
    interceptor.delay(delayMs);
  }
  return interceptor.reply(reply.status, reply.body);
};

export const handleMockPairSocialIdentifier = (
  mockReply?: MockReply,
  onBody?: (body: unknown) => void,
): nock.Scope => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_PAIR_SOCIAL_IDENTIFIER_RESPONSE,
  };
  const mockPairSocialIdentifierEndpoint = nock(MOCK_PAIR_SOCIAL_IDENTIFIER_URL)
    .persist()
    .post('', (body) => {
      onBody?.(body);
      return true;
    })
    .reply(reply.status, reply.body);

  return mockPairSocialIdentifierEndpoint;
};

export const handleMockSrpLogin = (
  mockReply?: MockReply,
  onBody?: (body: unknown) => void,
): nock.Scope => {
  const reply = mockReply ?? { status: 200, body: MOCK_SRP_LOGIN_RESPONSE };
  const mockLoginEndpoint = nock(MOCK_SRP_LOGIN_URL)
    .persist()
    .post('', (body) => {
      onBody?.(body);
      return true;
    })
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

export const handleMockCustomerServiceToken = (
  mockReply?: MockReply,
): nock.Scope => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_CUSTOMER_SERVICE_TOKEN_RESPONSE,
  };
  const mockCustomerServiceTokenEndpoint = nock(MOCK_CUSTOMER_SERVICE_TOKEN_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockCustomerServiceTokenEndpoint;
};

export const handleMockOidcToken = (mockReply?: MockReply): nock.Scope => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_PARTNER_IDENTITY_TOKEN_RESPONSE,
  };
  const mockOidcTokenEndpoint = nock(MOCK_PARTNER_IDENTITY_TOKEN_URL)
    .persist()
    .post('')
    .reply(reply.status, reply.body);

  return mockOidcTokenEndpoint;
};

export const arrangeAuthAPIs = (options?: {
  mockNonceUrl?: MockReply;
  mockOAuth2TokenUrl?: MockReply;
  mockSrpLoginUrl?: MockReply;
  mockSiweLoginUrl?: MockReply;
  mockPairIdentifiers?: MockReply;
  mockPairProfiles?: MockReply;
  mockPairSocialIdentifier?: MockReply;
  mockUserProfileLineageUrl?: MockReply;
  mockCustomerServiceTokenUrl?: MockReply;
  mockOidcTokenUrl?: MockReply;
  onSrpLoginBody?: (body: unknown) => void;
  onPairSocialIdentifierBody?: (body: unknown) => void;
  mockPairProfilesDelayMs?: number;
}): {
  mockNonceUrl: nock.Scope;
  mockOAuth2TokenUrl: nock.Scope;
  mockSrpLoginUrl: nock.Scope;
  mockSiweLoginUrl: nock.Scope;
  mockPairIdentifiersUrl: nock.Scope;
  mockPairProfilesUrl: nock.Scope;
  mockPairSocialIdentifierUrl: nock.Scope;
  mockUserProfileLineageUrl: nock.Scope;
  mockCustomerServiceTokenUrl: nock.Scope;
  mockOidcTokenUrl: nock.Scope;
} => {
  const mockNonceUrl = handleMockNonce(options?.mockNonceUrl);
  const mockOAuth2TokenUrl = handleMockOAuth2Token(options?.mockOAuth2TokenUrl);
  const mockSrpLoginUrl = handleMockSrpLogin(
    options?.mockSrpLoginUrl,
    options?.onSrpLoginBody,
  );
  const mockSiweLoginUrl = handleMockSiweLogin(options?.mockSiweLoginUrl);
  const mockPairIdentifiersUrl = handleMockPairIdentifiers(
    options?.mockPairIdentifiers,
  );
  const mockPairProfilesUrl = handleMockPairProfiles(
    options?.mockPairProfiles,
    options?.mockPairProfilesDelayMs,
  );
  const mockPairSocialIdentifierUrl = handleMockPairSocialIdentifier(
    options?.mockPairSocialIdentifier,
    options?.onPairSocialIdentifierBody,
  );
  const mockUserProfileLineageUrl = handleMockUserProfileLineage(
    options?.mockUserProfileLineageUrl,
  );
  const mockCustomerServiceTokenUrl = handleMockCustomerServiceToken(
    options?.mockCustomerServiceTokenUrl,
  );
  const mockOidcTokenUrl = handleMockOidcToken(options?.mockOidcTokenUrl);

  return {
    mockNonceUrl,
    mockOAuth2TokenUrl,
    mockSrpLoginUrl,
    mockSiweLoginUrl,
    mockPairIdentifiersUrl,
    mockPairProfilesUrl,
    mockPairSocialIdentifierUrl,
    mockUserProfileLineageUrl,
    mockCustomerServiceTokenUrl,
    mockOidcTokenUrl,
  };
};
