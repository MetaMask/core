import nock from 'nock';

import {
  MOCK_STORAGE_RESPONSE,
  MOCK_STORAGE_URL,
  MOCK_STORAGE_URL_ALL_FEATURE_ENTRIES,
} from '../mocks/userstorage';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const handleMockUserStorageGet = async (mockReply?: MockReply) => {
  const reply = mockReply ?? {
    status: 200,
    body: await MOCK_STORAGE_RESPONSE(),
  };
  const mockEndpoint = nock(MOCK_STORAGE_URL)
    .persist()
    .get(/.*/u)
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const handleMockUserStorageGetAllFeatureEntries = async (
  mockReply?: MockReply,
) => {
  const reply = mockReply ?? {
    status: 200,
    body: [await MOCK_STORAGE_RESPONSE()],
  };
  const mockEndpoint = nock(MOCK_STORAGE_URL_ALL_FEATURE_ENTRIES)
    .persist()
    .get('')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const handleMockUserStoragePut = (
  mockReply?: MockReply,
  callback?: (uri: string, requestBody: nock.Body) => Promise<void>,
) => {
  const reply = mockReply ?? { status: 204 };
  const mockEndpoint = nock(MOCK_STORAGE_URL)
    .persist()
    .put(/.*/u)
    .reply(reply.status, async (uri, requestBody) => {
      return await callback?.(uri, requestBody);
    });

  return mockEndpoint;
};

export const handleMockUserStorageBatchDelete = (
  mockReply?: MockReply,
  callback?: (uri: string, requestBody: nock.Body) => Promise<void>,
) => {
  const reply = mockReply ?? { status: 204 };
  const mockEndpoint = nock(MOCK_STORAGE_URL)
    .persist()
    .put(/.*/u)
    .reply(reply.status, async (uri, requestBody) => {
      return await callback?.(uri, requestBody);
    });

  return mockEndpoint;
};

export const handleMockUserStorageDelete = async (mockReply?: MockReply) => {
  const reply = mockReply ?? { status: 204 };
  const mockEndpoint = nock(MOCK_STORAGE_URL)
    .persist()
    .delete(/.*/u)
    .reply(reply.status);

  return mockEndpoint;
};

export const handleMockUserStorageDeleteAllFeatureEntries = async (
  mockReply?: MockReply,
) => {
  const reply = mockReply ?? { status: 204 };
  const mockEndpoint = nock(MOCK_STORAGE_URL_ALL_FEATURE_ENTRIES)
    .persist()
    .delete('')
    .reply(reply.status);

  return mockEndpoint;
};
