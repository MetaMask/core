import type { UserStoragePath } from '../schema';
import { createEntryPath } from '../schema';
import type { GetUserStorageResponse } from '../services';
import { USER_STORAGE_ENDPOINT } from '../services';
import { MOCK_ENCRYPTED_STORAGE_DATA, MOCK_STORAGE_KEY } from './mockStorage';

type MockResponse = {
  url: string;
  requestMethod: 'GET' | 'POST' | 'PUT';
  response: unknown;
};

export const getMockUserStorageEndpoint = (path: UserStoragePath) => {
  return `${USER_STORAGE_ENDPOINT}${createEntryPath(path, MOCK_STORAGE_KEY)}`;
};

const MOCK_GET_USER_STORAGE_RESPONSE: GetUserStorageResponse = {
  HashedKey: 'HASHED_KEY',
  Data: MOCK_ENCRYPTED_STORAGE_DATA,
};

export const getMockUserStorageGetResponse = (
  path: UserStoragePath = 'notifications.notificationSettings',
) => {
  return {
    url: getMockUserStorageEndpoint(path),
    requestMethod: 'GET',
    response: MOCK_GET_USER_STORAGE_RESPONSE,
  } satisfies MockResponse;
};

export const getMockUserStoragePutResponse = (
  path: UserStoragePath = 'notifications.notificationSettings',
) => {
  return {
    url: getMockUserStorageEndpoint(path),
    requestMethod: 'PUT',
    response: null,
  } satisfies MockResponse;
};
