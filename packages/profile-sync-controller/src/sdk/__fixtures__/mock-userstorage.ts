import nock from 'nock';

import encryption, { createSHA256Hash } from '../../shared/encryption';
import { Env } from '../../shared/env';
import { USER_STORAGE_FEATURE_NAMES } from '../../shared/storage-schema';
import { STORAGE_URL } from '../user-storage';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

// Example mock notifications storage entry (wildcard)
const MOCK_STORAGE_URL = STORAGE_URL(
  Env.DEV,
  `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
);
const MOCK_STORAGE_URL_ALL_FEATURE_ENTRIES = STORAGE_URL(
  Env.DEV,
  USER_STORAGE_FEATURE_NAMES.notifications,
);

export const MOCK_STORAGE_KEY = createSHA256Hash('mockStorageKey');
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
export const MOCK_NOTIFICATIONS_DATA = '{ is_compact: false }';
export const MOCK_NOTIFICATIONS_DATA_ENCRYPTED = async (data?: string) =>
  await encryption.encryptString(
    data ?? MOCK_NOTIFICATIONS_DATA,
    MOCK_STORAGE_KEY,
  );

export const MOCK_STORAGE_RESPONSE = async (data?: string) => ({
  HashedKey: '8485d2c14c333ebca415140a276adaf546619b0efc204586b73a5d400a18a5e2',
  Data: await MOCK_NOTIFICATIONS_DATA_ENCRYPTED(data),
});

export const handleMockUserStorageGet = async (mockReply?: MockReply) => {
  const reply = mockReply ?? {
    status: 200,
    body: await MOCK_STORAGE_RESPONSE(),
  };
  const mockEndpoint = nock(MOCK_STORAGE_URL)
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
    .put(/.*/u)
    .reply(reply.status, async (uri, requestBody) => {
      return await callback?.(uri, requestBody);
    });

  return mockEndpoint;
};

export const handleMockUserStorageDelete = async (mockReply?: MockReply) => {
  const reply = mockReply ?? { status: 204 };
  const mockEndpoint = nock(MOCK_STORAGE_URL).delete(/.*/u).reply(reply.status);

  return mockEndpoint;
};

export const handleMockUserStorageDeleteAllFeatureEntries = async (
  mockReply?: MockReply,
) => {
  const reply = mockReply ?? { status: 204 };
  const mockEndpoint = nock(MOCK_STORAGE_URL_ALL_FEATURE_ENTRIES)
    .delete('')
    .reply(reply.status);

  return mockEndpoint;
};
