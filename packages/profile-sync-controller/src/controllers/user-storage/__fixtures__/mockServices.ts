import nock from 'nock';

import type {
  UserStoragePathWithFeatureAndKey,
  UserStoragePathWithFeatureOnly,
} from '../../../shared/storage-schema';
import {
  getMockUserStorageGetResponse,
  getMockUserStoragePutResponse,
  getMockUserStorageAllFeatureEntriesResponse,
  getMockUserStorageBatchPutResponse,
  deleteMockUserStorageAllFeatureEntriesResponse,
  deleteMockUserStorageResponse,
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
  expectCallback?: (requestBody: nock.Body) => Promise<void>,
) => {
  const mockResponse = getMockUserStoragePutResponse(path);
  const mockEndpoint = nock(mockResponse.url)
    .put('')
    .reply(mockReply?.status ?? 204, async (_, requestBody) => {
      await expectCallback?.(requestBody);
    });
  return mockEndpoint;
};

export const mockEndpointBatchUpsertUserStorage = (
  path: UserStoragePathWithFeatureOnly = 'notifications',
  mockReply?: Pick<MockReply, 'status'>,
  callback?: (uri: string, requestBody: nock.Body) => Promise<void>,
) => {
  const mockResponse = getMockUserStorageBatchPutResponse(path);
  const mockEndpoint = nock(mockResponse.url)
    .put('')
    .reply(mockReply?.status ?? 204, async (uri, requestBody) => {
      return await callback?.(uri, requestBody);
    });
  return mockEndpoint;
};

export const mockEndpointDeleteUserStorage = (
  path: UserStoragePathWithFeatureAndKey = 'notifications.notification_settings',
  mockReply?: MockReply,
) => {
  const mockResponse = deleteMockUserStorageResponse(path);
  const reply = mockReply ?? {
    status: 200,
  };

  const mockEndpoint = nock(mockResponse.url).delete('').reply(reply.status);

  return mockEndpoint;
};

export const mockEndpointDeleteUserStorageAllFeatureEntries = (
  path: UserStoragePathWithFeatureOnly = 'notifications',
  mockReply?: MockReply,
) => {
  const mockResponse = deleteMockUserStorageAllFeatureEntriesResponse(path);
  const reply = mockReply ?? {
    status: 200,
  };

  const mockEndpoint = nock(mockResponse.url).delete('').reply(reply.status);

  return mockEndpoint;
};
