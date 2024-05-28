import nock from 'nock';

import { createEntryPath } from '../schema';
import { USER_STORAGE_ENDPOINT } from '../user-storage-controller/src/constants';
import type { GetUserStorageResponse } from '../user-storage-controller-services';
import { MOCK_ENCRYPTED_STORAGE_DATA, MOCK_STORAGE_KEY } from './mockStorage';

export const MOCK_USER_STORAGE_NOTIFICATIONS_ENDPOINT = `${USER_STORAGE_ENDPOINT}${createEntryPath(
  'notification_settings',
  MOCK_STORAGE_KEY,
)}`;

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

const MOCK_GET_USER_STORAGE_RESPONSE: GetUserStorageResponse = {
  HashedKey: 'HASHED_KEY',
  Data: MOCK_ENCRYPTED_STORAGE_DATA,
};
/**
 *
 * @param mockReply
 */
export function mockEndpointGetUserStorage(mockReply?: MockReply) {
  const reply = mockReply ?? {
    status: 200,
    body: MOCK_GET_USER_STORAGE_RESPONSE,
  };

  const mockEndpoint = nock(MOCK_USER_STORAGE_NOTIFICATIONS_ENDPOINT)
    .get('')
    .reply(reply.status, reply.body);

  return mockEndpoint;
}

/**
 *
 * @param mockReply
 */
export function mockEndpointUpsertUserStorage(
  mockReply?: Pick<MockReply, 'status'>,
) {
  const mockEndpoint = nock(MOCK_USER_STORAGE_NOTIFICATIONS_ENDPOINT)
    .put('')
    .reply(mockReply?.status ?? 204);
  return mockEndpoint;
}
