import nock from 'nock';

import encryption from '../encryption';
import { Env } from '../env';
import { STORAGE_URL } from '../user-storage';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

// Example mock notifications storage entry (wildcard)
const MOCK_STORAGE_URL = STORAGE_URL(Env.DEV, 'notifications', '');

export const MOCK_STORAGE_KEY = 'MOCK_STORAGE_KEY';
export const MOCK_NOTIFICATIONS_DATA = { is_compact: false };
export const MOCK_NOTIFICATIONS_DATA_ENCRYPTED = encryption.encryptString(
  JSON.stringify(MOCK_NOTIFICATIONS_DATA),
  MOCK_STORAGE_KEY,
);

export const MOCK_STORAGE_RESPONSE = {
  HashedKey: '8485d2c14c333ebca415140a276adaf546619b0efc204586b73a5d400a18a5e2',
  Data: MOCK_NOTIFICATIONS_DATA_ENCRYPTED,
};

export const handleMockUserStorageGet = (mockReply?: MockReply) => {
  const reply = mockReply ?? { status: 200, body: MOCK_STORAGE_RESPONSE };
  const mockEndpoint = nock(MOCK_STORAGE_URL)
    .persist()
    .get(/.*/u)
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const handleMockUserStoragePut = (mockReply?: MockReply) => {
  const reply = mockReply ?? { status: 204 };
  const mockEndpoint = nock(MOCK_STORAGE_URL)
    .persist()
    .put(/.*/u)
    .reply(reply.status);

  return mockEndpoint;
};
