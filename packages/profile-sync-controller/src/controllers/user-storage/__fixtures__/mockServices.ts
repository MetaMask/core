import nock from 'nock';

import { mockPutWithBodyCallback } from '../../../sdk/__fixtures__/userstorage.js';
import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema.js';
import type {
  UserStorageGenericPathWithFeatureAndKey,
  UserStorageGenericPathWithFeatureOnly,
} from '../../../shared/storage-schema.js';
import {
  getMockUserStorageGetResponse,
  getMockUserStoragePutResponse,
  getMockUserStorageAllFeatureEntriesResponse,
  getMockUserStorageBatchPutResponse,
  getMockUserStorageBatchDeleteResponse,
  deleteMockUserStorageAllFeatureEntriesResponse,
  deleteMockUserStorageResponse,
} from '../mocks/mockResponses.js';

type MockReply = {
  status: nock.StatusCode;
  body?: nock.Body;
};

export const mockEndpointGetUserStorageAllFeatureEntries = async (
  path: UserStorageGenericPathWithFeatureOnly = USER_STORAGE_FEATURE_NAMES.notifications,
  mockReply?: MockReply,
  persist = true,
) => {
  const mockResponse = await getMockUserStorageAllFeatureEntriesResponse(path);
  const reply = mockReply ?? {
    status: 200,
    body: mockResponse.response,
  };

  const mockEndpoint = nock(mockResponse.url)
    .get('')
    .reply(reply.status, reply.body);

  if (persist) {
    mockEndpoint.persist();
  }

  return mockEndpoint;
};

export const mockEndpointGetUserStorage = async (
  path: UserStorageGenericPathWithFeatureAndKey = `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
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
  path: UserStorageGenericPathWithFeatureAndKey = `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
  mockReply?: Pick<MockReply, 'status'>,
  expectCallback?: (requestBody: nock.Body) => Promise<void>,
) => {
  const mockResponse = getMockUserStoragePutResponse(path);
  return mockPutWithBodyCallback(
    mockResponse.url,
    mockReply?.status ?? 204,
    expectCallback,
    { path: '', persist: false },
  );
};

export const mockEndpointBatchUpsertUserStorage = (
  path: UserStorageGenericPathWithFeatureOnly = USER_STORAGE_FEATURE_NAMES.notifications,
  mockReply?: Pick<MockReply, 'status'>,
  callback?: (requestBody: nock.Body) => Promise<void>,
) => {
  const mockResponse = getMockUserStorageBatchPutResponse(path);
  return mockPutWithBodyCallback(
    mockResponse.url,
    mockReply?.status ?? 204,
    callback,
    { path: '', persist: false },
  );
};

export const mockEndpointDeleteUserStorage = (
  path: UserStorageGenericPathWithFeatureAndKey = `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
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
  path: UserStorageGenericPathWithFeatureOnly = USER_STORAGE_FEATURE_NAMES.notifications,
  mockReply?: MockReply,
) => {
  const mockResponse = deleteMockUserStorageAllFeatureEntriesResponse(path);
  const reply = mockReply ?? {
    status: 200,
  };

  const mockEndpoint = nock(mockResponse.url).delete('').reply(reply.status);

  return mockEndpoint;
};

export const mockEndpointBatchDeleteUserStorage = (
  path: UserStorageGenericPathWithFeatureOnly = 'notifications',
  mockReply?: Pick<MockReply, 'status'>,
  callback?: (requestBody: nock.Body) => Promise<void>,
) => {
  const mockResponse = getMockUserStorageBatchDeleteResponse(path);
  return mockPutWithBodyCallback(
    mockResponse.url,
    mockReply?.status ?? 204,
    callback,
    { path: '', persist: false },
  );
};
