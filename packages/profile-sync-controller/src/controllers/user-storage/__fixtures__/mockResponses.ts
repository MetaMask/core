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

/**
 * Temp
 * @param data - foo
 * @returns bar
 */
export async function createMockGetStorageResponse(
  data?: string,
): Promise<GetUserStorageResponse> {
  return {
    HashedKey: 'HASHED_KEY',
    Data: await MOCK_ENCRYPTED_STORAGE_DATA(data),
  };
}

/**
 * Temp
 * @param dataArr - foo
 * @returns bar
 */
export async function createMockAllFeatureEntriesResponse(
  dataArr: string[] = [MOCK_STORAGE_DATA],
): Promise<GetUserStorageAllFeatureEntriesResponse> {
  return await Promise.all(
    dataArr.map(async function (d) {
      const encryptedData = await MOCK_ENCRYPTED_STORAGE_DATA(d);
      return {
        HashedKey: 'HASHED_KEY',
        Data: encryptedData,
      };
    }),
  );
}

/**
 * Temp
 * @param path - foo
 * @returns bar
 */
export async function getMockUserStorageGetResponse(
  path: UserStoragePathWithFeatureAndKey = 'notifications.notification_settings',
) {
  return {
    url: getMockUserStorageEndpoint(path),
    requestMethod: 'GET',
    response: await createMockGetStorageResponse(),
  } satisfies MockResponse;
}

/**
 * Temp
 * @param path - foo
 * @param dataArr - bar
 * @returns baz
 */
export async function getMockUserStorageAllFeatureEntriesResponse(
  path: UserStoragePathWithFeatureOnly = 'notifications',
  dataArr?: string[],
) {
  return {
    url: getMockUserStorageEndpoint(path),
    requestMethod: 'GET',
    response: await createMockAllFeatureEntriesResponse(dataArr),
  } satisfies MockResponse;
}

export const getMockUserStoragePutResponse = (
  path: UserStoragePathWithFeatureAndKey = 'notifications.notification_settings',
) => {
  return {
    url: getMockUserStorageEndpoint(path),
    requestMethod: 'PUT',
    response: null,
  } satisfies MockResponse;
};
