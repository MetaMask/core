import nock from 'nock';

import type { UserStoragePath } from '../schema';
import {
  getMockUserStorageGetResponse,
  getMockUserStoragePutResponse,
} from './mockResponses';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const mockEndpointGetUserStorage = (
  path: UserStoragePath = 'notifications.notificationSettings',
  mockReply?: MockReply,
) => {
  const mockResponse = getMockUserStorageGetResponse(path);
  const reply = mockReply ?? {
    status: 200,
    body: mockResponse.response,
  };

  const mockEndpoint = nock(mockResponse.url)
    .get('')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const mockEndpointUpsertUserStorage = (
  path: UserStoragePath = 'notifications.notificationSettings',
  mockReply?: Pick<MockReply, 'status'>,
) => {
  const mockResponse = getMockUserStoragePutResponse(path);
  const mockEndpoint = nock(mockResponse.url)
    .put('')
    .reply(mockReply?.status ?? 204);
  return mockEndpoint;
};
