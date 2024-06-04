/* eslint-disable jsdoc/require-returns */
/* eslint-disable jsdoc/require-description */
/* eslint-disable jsdoc/require-jsdoc */
import nock from 'nock';

import { createEntryPath } from '../../src/schema';
import { Env, getEnvUrls } from '../../src/sdk/env';
import type { GetUserStorageResponse } from '../../src/services';
import { MOCK_ENCRYPTED_STORAGE_DATA, MOCK_STORAGE_KEY } from './mockStorage';

export const MOCK_USER_STORAGE_NOTIFICATIONS_ENDPOINT = `${
  getEnvUrls(Env.DEV).userStorageApiUrl
}/api/v1/userstorage/${createEntryPath(
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

export function mockEndpointUpsertUserStorage(
  mockReply?: Pick<MockReply, 'status'>,
) {
  const mockEndpoint = nock(MOCK_USER_STORAGE_NOTIFICATIONS_ENDPOINT)
    .put('')
    .reply(mockReply?.status ?? 204);
  return mockEndpoint;
}
