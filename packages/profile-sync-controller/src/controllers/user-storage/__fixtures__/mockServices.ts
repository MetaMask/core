import nock from 'nock';

import type {
  UserStoragePathWithFeatureAndKey,
  UserStoragePathWithFeatureOnly,
} from '../../../shared/storage-schema';
import {
  getMockUserStorageGetResponse,
  getMockUserStoragePutResponse,
  getMockUserStorageAllFeatureEntriesResponse,
} from './mockResponses';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const mockEndpointGetUserStorageAllFeatureEntries = async (
  path: UserStoragePathWithFeatureOnly = 'notifications',
  mockReply?: MockReply,
) => {
  const mockResponse = await getMockUserStorageAllFeatureEntriesResponse(path);
  const reply = mockReply ?? {
    status: 200,
    body: mockResponse.response,
  };

  const mockEndpoint = nock(mockResponse.url)
    .get('')
    .reply(reply.status, reply.body);

  return mockEndpoint;
};

export const mockEndpointGetUserStorage = async (
  path: UserStoragePathWithFeatureAndKey = 'notifications.notification_settings',
  mockReply?: MockReply,
) => {
  const mockResponse = await getMockUserStorageGetResponse(path);
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
  path: UserStoragePathWithFeatureAndKey = 'notifications.notification_settings',
  mockReply?: Pick<MockReply, 'status'>,
) => {
  const mockResponse = getMockUserStoragePutResponse(path);
  const mockEndpoint = nock(mockResponse.url)
    .put('')
    .reply(mockReply?.status ?? 204);
  return mockEndpoint;
};
