import nock from 'nock';

import {
  MOCK_ACQUIRE_METADATA_LOCK_RESPONSE,
  MOCK_BATCH_SECRET_DATA_ADD_RESPONSE,
  MOCK_RELEASE_METADATA_LOCK_RESPONSE,
  MOCK_SECRET_DATA_ADD_RESPONSE,
  MOCK_SECRET_DATA_GET_RESPONSE,
  MOCK_TOPRF_AUTHENTICATION_RESPONSE,
  MOCK_TOPRF_COMMITMENT_RESPONSE,
  TOPRF_BASE_URL,
} from '../mocks/toprf';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const handleMockCommitment = (mockReply?: MockReply) => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_TOPRF_COMMITMENT_RESPONSE,
  };

  const mockEndpoint = nock(TOPRF_BASE_URL)
    .persist()
    .post('/sss/jrpc')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const handleMockAuthenticate = (mockReply?: MockReply) => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_TOPRF_AUTHENTICATION_RESPONSE,
  };
  const mockEndpoint = nock(TOPRF_BASE_URL)
    .persist()
    .post('/sss/jrpc')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const handleMockSecretDataAdd = (mockReply?: MockReply) => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_SECRET_DATA_ADD_RESPONSE,
  };
  const mockEndpoint = nock(TOPRF_BASE_URL)
    .post('/metadata/enc_account_data/set')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const handleMockBatchSecretDataAdd = (mockReply?: MockReply) => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_BATCH_SECRET_DATA_ADD_RESPONSE,
  };
  const mockEndpoint = nock(TOPRF_BASE_URL)
    .post('/metadata/enc_account_data/batch_set')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const handleMockSecretDataGet = (mockReply?: MockReply) => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_SECRET_DATA_GET_RESPONSE,
  };
  const mockEndpoint = nock(TOPRF_BASE_URL)
    .post('/metadata/enc_account_data/get')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const handleMockAcquireMetadataLock = (mockReply?: MockReply) => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_ACQUIRE_METADATA_LOCK_RESPONSE,
  };
  const mockEndpoint = nock(TOPRF_BASE_URL)
    .post('/metadata/acquireLock')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const handleMockReleaseMetadataLock = (mockReply?: MockReply) => {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_RELEASE_METADATA_LOCK_RESPONSE,
  };
  const mockEndpoint = nock(TOPRF_BASE_URL)
    .post('/metadata/releaseLock')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};
