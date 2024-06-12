import {
  mockEndpointGetUserStorage,
  mockEndpointUpsertUserStorage,
} from './__fixtures__/mockServices';
import {
  MOCK_ENCRYPTED_STORAGE_DATA,
  MOCK_STORAGE_DATA,
  MOCK_STORAGE_KEY,
} from './__fixtures__/mockStorage';
import type { GetUserStorageResponse } from './services';
import { getUserStorage, upsertUserStorage } from './services';

describe('user-storage/services.ts - getUserStorage() tests', () => {
  const actCallGetUserStorage = () => {
    return getUserStorage({
      bearerToken: 'MOCK_BEARER_TOKEN',
      entryKey: 'notificationSettings',
      storageKey: MOCK_STORAGE_KEY,
    });
  };

  it('returns user storage data', async () => {
    const mockGetUserStorage = mockEndpointGetUserStorage();
    const result = await actCallGetUserStorage();

    mockGetUserStorage.done();
    expect(result).toBe(MOCK_STORAGE_DATA);
  });

  it('returns null if endpoint does not have entry', async () => {
    const mockGetUserStorage = mockEndpointGetUserStorage({ status: 404 });
    const result = await actCallGetUserStorage();

    mockGetUserStorage.done();
    expect(result).toBeNull();
  });

  it('returns null if endpoint fails', async () => {
    const mockGetUserStorage = mockEndpointGetUserStorage({ status: 500 });
    const result = await actCallGetUserStorage();

    mockGetUserStorage.done();
    expect(result).toBeNull();
  });

  it('returns null if unable to decrypt data', async () => {
    const badResponseData: GetUserStorageResponse = {
      HashedKey: 'MOCK_HASH',
      Data: 'Bad Encrypted Data',
    };
    const mockGetUserStorage = mockEndpointGetUserStorage({
      status: 200,
      body: badResponseData,
    });
    const result = await actCallGetUserStorage();

    mockGetUserStorage.done();
    expect(result).toBeNull();
  });
});

describe('user-storage/services.ts - upsertUserStorage() tests', () => {
  const actCallUpsertUserStorage = () => {
    return upsertUserStorage(MOCK_ENCRYPTED_STORAGE_DATA, {
      bearerToken: 'MOCK_BEARER_TOKEN',
      entryKey: 'notificationSettings',
      storageKey: MOCK_STORAGE_KEY,
    });
  };

  it('invokes upsert endpoint with no errors', async () => {
    const mockUpsertUserStorage = mockEndpointUpsertUserStorage();
    await actCallUpsertUserStorage();

    expect(mockUpsertUserStorage.isDone()).toBe(true);
  });

  it('throws error if unable to upsert user storage', async () => {
    const mockUpsertUserStorage = mockEndpointUpsertUserStorage({
      status: 500,
    });

    await expect(actCallUpsertUserStorage()).rejects.toThrow(expect.any(Error));
    mockUpsertUserStorage.done();
  });
});
