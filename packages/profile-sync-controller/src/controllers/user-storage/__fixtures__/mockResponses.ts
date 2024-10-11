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
  requestMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
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
 * Creates a mock GET user-storage response
 * @param data - data to encrypt
 * @returns a realistic GET Response Body
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
 * Creates a mock GET ALL user-storage response
 * @param dataArr - array of data to encrypt
 * @returns a realistic GET ALL Response Body
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
 * Creates a mock user-storage api GET request
 * @param path - path of the GET Url
 * @returns mock GET API request. Can be used by e2e or unit mock servers
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
 * Creates a mock user-storage api GET ALL request
 * @param path - path of the GET url
 * @param dataArr - data to encrypt
 * @returns mock GET ALL API request. Can be used by e2e or unit mock servers
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

export const getMockUserStorageBatchPutResponse = (
  path: UserStoragePathWithFeatureOnly = 'notifications',
) => {
  return {
    url: getMockUserStorageEndpoint(path),
    requestMethod: 'PUT',
    response: null,
  } satisfies MockResponse;
};

export const deleteMockUserStorageResponse = (
  path: UserStoragePathWithFeatureAndKey = 'notifications.notification_settings',
) => {
  return {
    url: getMockUserStorageEndpoint(path),
    requestMethod: 'DELETE',
    response: null,
  } satisfies MockResponse;
};

export const deleteMockUserStorageAllFeatureEntriesResponse = (
  path: UserStoragePathWithFeatureOnly = 'notifications',
) => {
  return {
    url: getMockUserStorageEndpoint(path),
    requestMethod: 'DELETE',
    response: null,
  } satisfies MockResponse;
};
