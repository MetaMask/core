import type {
  UserStoragePathWithFeatureAndKey,
  UserStoragePathWithFeatureOnly,
} from '../../../shared/storage-schema';
import { createEntryPath } from '../../../shared/storage-schema';
import type {
  GetUserStorageAllFeatureEntriesResponse,
  GetUserStorageResponse,
} from '../services';
import { USER_STORAGE_ENDPOINT } from '../services';
import {
  MOCK_ENCRYPTED_STORAGE_DATA,
  MOCK_STORAGE_DATA,
  MOCK_STORAGE_KEY,
} from './mockStorage';

type MockResponse = {
  url: string;
  requestMethod: 'GET' | 'POST' | 'PUT';
  response: unknown;
};

export const getMockUserStorageEndpoint = (
  path: UserStoragePathWithFeatureAndKey | UserStoragePathWithFeatureOnly,
) => {
  if (path.split('.').length === 1) {
    return `${USER_STORAGE_ENDPOINT}/${path}`;
  }

  return `${USER_STORAGE_ENDPOINT}/${createEntryPath(
    path as UserStoragePathWithFeatureAndKey,
    MOCK_STORAGE_KEY,
  )}`;
};

export const createMockGetStorageResponse = async (
  data?: string,
): Promise<GetUserStorageResponse> => ({
  HashedKey: 'HASHED_KEY',
  Data: await MOCK_ENCRYPTED_STORAGE_DATA(data),
});

export const createMockAllFeatureEntriesResponse = async (
  dataArr: string[] = [MOCK_STORAGE_DATA],
): Promise<GetUserStorageAllFeatureEntriesResponse> =>
  Promise.all(
    dataArr.map(async (d) => ({
      HashedKey: 'HASHED_KEY',
      Data: await MOCK_ENCRYPTED_STORAGE_DATA(d),
    })),
  );

export const getMockUserStorageGetResponse = async (
  path: UserStoragePathWithFeatureAndKey = 'notifications.notification_settings',
) => {
  return {
    url: getMockUserStorageEndpoint(path),
    requestMethod: 'GET',
    response: await createMockGetStorageResponse(),
  } satisfies MockResponse;
};

export const getMockUserStorageAllFeatureEntriesResponse = async (
  path: UserStoragePathWithFeatureOnly = 'notifications',
  dataArr?: string[],
) => {
  return {
    url: getMockUserStorageEndpoint(path),
    requestMethod: 'GET',
    response: await createMockAllFeatureEntriesResponse(dataArr),
  } satisfies MockResponse;
};

export const getMockUserStoragePutResponse = (
  path: UserStoragePathWithFeatureAndKey = 'notifications.notification_settings',
) => {
  return {
    url: getMockUserStorageEndpoint(path),
    requestMethod: 'PUT',
    response: null,
  } satisfies MockResponse;
};
