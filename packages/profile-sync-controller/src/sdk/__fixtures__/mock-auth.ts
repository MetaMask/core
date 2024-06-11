import nock from 'nock';

import {
  NONCE_URL,
  SIWE_LOGIN_URL,
  SRP_LOGIN_URL,
  OIDC_TOKEN_URL,
  PAIR_IDENTIFIERS,
} from '../authentication-jwt-bearer/services';
import { Env } from '../env';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

const MOCK_NONCE_URL = NONCE_URL(Env.DEV);
const MOCK_SIWE_LOGIN_URL = SIWE_LOGIN_URL(Env.DEV);
const MOCK_PAIR_IDENTIFIERS_URL = PAIR_IDENTIFIERS(Env.DEV);
const MOCK_SRP_LOGIN_URL = SRP_LOGIN_URL(Env.DEV);
const MOCK_OIDC_TOKEN_URL = OIDC_TOKEN_URL(Env.DEV);

export const MOCK_JWT =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImIwNzE2N2U2LWJjNWUtNDgyZC1hNjRhLWU1MjQ0MjY2MGU3NyJ9.eyJzdWIiOiI1MzE0ODc5YWM2NDU1OGI3OTQ5ZmI4NWIzMjg2ZjZjNjUwODAzYmFiMTY0Y2QyOWNmMmM3YzdmMjMzMWMwZTRlIiwiaWF0IjoxNzA2MTEzMDYyLCJleHAiOjE3NjkxODUwNjMsImlzcyI6ImF1dGgubWV0YW1hc2suaW8iLCJhdWQiOiJwb3J0Zm9saW8ubWV0YW1hc2suaW8ifQ.E5UL6oABNweS8t5a6IBTqTf7NLOJbrhJSmEcsr7kwLp4bGvcENJzACwnsHDkA6PlzfDV09ZhAGU_F3hlS0j-erbY0k0AFR-GAtyS7E9N02D8RgUDz5oDR65CKmzM8JilgFA8UvruJ6OJGogroaOSOqzRES_s8MjHpP47RJ9lXrUesajsbOudXbuksXWg5QmWip6LLvjwr8UUzcJzNQilyIhiEpo4WdzWM4R3VtTwr4rHnWEvtYnYCov1jmI2w3YQ48y0M-3Y9IOO0ov_vlITRrOnR7Y7fRUGLUFmU5msD8mNWRywjQFLHfJJ1yNP5aJ8TkuCK3sC6kcUH335IVvukQ';

export const MOCK_ACCESS_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

const MOCK_NONCE_RESPONSE = {
  nonce: 'xGMm9SoihEKeAEfV',
  identifier: '0xd8641601Cb79a94FD872fE42d5b4a067A44a7e88',
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  expires_in: 300,
};

const MOCK_SIWE_LOGIN_RESPONSE = {
  token: MOCK_JWT,
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  expires_in: 3600,
  profile: {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    profile_id: 'fa2bbf82-bd9a-4e6b-aabc-9ca0d0319b6e',
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    metametrics_id: 'de742679-4960-4977-a415-4718b5f8e86c',
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    identifier_id:
      'ec9a4e9906836497efad2fd4d4290b34d2c6a2c0d93eb174aa3cd88a133adbaf',
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    identifier_type: 'SIWE',
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    encrypted_storage_key: '2c6a2c0d93eb174aa3cd88a133adbaf',
  },
};

export const MOCK_SRP_LOGIN_RESPONSE = {
  token: MOCK_JWT,
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  expires_in: 3600,
  profile: {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    profile_id: 'f88227bd-b615-41a3-b0be-467dd781a4ad',
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    metametrics_id: '561ec651-a844-4b36-a451-04d6eac35740',
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    identifier_id:
      'da9a9fc7b09edde9cc23cec9b7e11a71fb0ab4d2ddd8af8af905306f3e1456fb',
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    identifier_type: 'SRP',
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    encrypted_storage_key: 'd2ddd8af8af905306f3e1456fb',
  },
};

export const MOCK_OIDC_TOKEN_RESPONSE = {
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  access_token: MOCK_ACCESS_JWT,
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  expires_in: 3600,
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

export const arrangeAuthAPIs = (options?: {
  mockNonceUrl?: MockReply;
  mockOAuth2TokenUrl?: MockReply;
  mockSrpLoginUrl?: MockReply;
  mockSiweLoginUrl?: MockReply;
  mockPairIdentifiers?: MockReply;
}) => {
  const mockNonceUrl = handleMockNonce(options?.mockNonceUrl);
  const mockOAuth2TokenUrl = handleMockOAuth2Token(options?.mockOAuth2TokenUrl);
  const mockSrpLoginUrl = handleMockSrpLogin(options?.mockSrpLoginUrl);
  const mockSiweLoginUrl = handleMockSiweLogin(options?.mockSiweLoginUrl);
  const mockPairIdentifiersUrl = handleMockPairIdentifiers(
    options?.mockPairIdentifiers,
  );

  return {
    mockNonceUrl,
    mockOAuth2TokenUrl,
    mockSrpLoginUrl,
    mockSiweLoginUrl,
    mockPairIdentifiersUrl,
  };
};
