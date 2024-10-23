import type { UserStoragePathWithKeyOnly } from 'src/shared/storage-schema';

import encryption, { createSHA256Hash } from '../shared/encryption';
import { Env } from '../shared/env';
import { arrangeAuthAPIs } from './__fixtures__/mock-auth';
import {
  MOCK_NOTIFICATIONS_DATA,
  MOCK_STORAGE_KEY,
  handleMockUserStorageGet,
  handleMockUserStoragePut,
  handleMockUserStorageGetAllFeatureEntries,
  handleMockUserStorageDeleteAllFeatureEntries,
  handleMockUserStorageDelete,
} from './__fixtures__/mock-userstorage';
import { arrangeAuth, typedMockFn } from './__fixtures__/test-utils';
import type { IBaseAuth } from './authentication-jwt-bearer/types';
import { NotFoundError, UserStorageError } from './errors';
import type { StorageOptions } from './user-storage';
import { STORAGE_URL, UserStorage } from './user-storage';

const MOCK_SRP = '0x6265617665726275696c642e6f7267';
const MOCK_ADDRESS = '0x68757d15a4d8d1421c17003512AFce15D3f3FaDa';

describe('User Storage - STORAGE_URL()', () => {
  it('generates an example url path for User Storage', () => {
    const result = STORAGE_URL(Env.DEV, 'my-feature/my-hashed-entry');
    expect(result).toBeDefined();
    expect(result).toContain('my-feature');
    expect(result).toContain('my-hashed-entry');
  });
});

describe('User Storage', () => {
  it('get/set key using SRP', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    const mockPut = handleMockUserStoragePut();
    const mockGet = await handleMockUserStorageGet();

    // Test Set
    const data = JSON.stringify(MOCK_NOTIFICATIONS_DATA);
    await userStorage.setItem('notifications.notification_settings', data);
    expect(mockPut.isDone()).toBe(true);
    expect(mockGet.isDone()).toBe(false);

    // Test Get (we expect the mocked encrypted data to be decrypt-able with the given Mock Storage Key)
    const response = await userStorage.getItem(
      'notifications.notification_settings',
    );
    expect(mockGet.isDone()).toBe(true);
    expect(response).toBe(data);
  });

  it('get/set key using SiWE', async () => {
    const { auth, mockSignMessage } = arrangeAuth('SiWE', MOCK_ADDRESS);
    auth.prepare({
      address: MOCK_ADDRESS,
      chainId: 1,
      signMessage: mockSignMessage,
      domain: 'https://metamask.io',
    });

    const { userStorage } = arrangeUserStorage(auth);

    const mockPut = handleMockUserStoragePut();
    const mockGet = await handleMockUserStorageGet();

    // Test Set
    const data = JSON.stringify(MOCK_NOTIFICATIONS_DATA);
    await userStorage.setItem('notifications.notification_settings', data);
    expect(mockPut.isDone()).toBe(true);
    expect(mockGet.isDone()).toBe(false);

    // Test Get (we expect the mocked encrypted data to be decrypt-able with the given Mock Storage Key)
    const response = await userStorage.getItem(
      'notifications.notification_settings',
    );
    expect(mockGet.isDone()).toBe(true);
    expect(response).toBe(data);
  });

  it('gets all feature entries', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    const mockGetAll = await handleMockUserStorageGetAllFeatureEntries();

    const data = JSON.stringify(MOCK_NOTIFICATIONS_DATA);
    const responseAllFeatureEntries = await userStorage.getAllFeatureItems(
      'notifications',
    );
    expect(mockGetAll.isDone()).toBe(true);
    expect(responseAllFeatureEntries).toStrictEqual([data]);
  });

  it('batch set items', async () => {
    const dataToStore: [UserStoragePathWithKeyOnly, string][] = [
      ['0x123', JSON.stringify(MOCK_NOTIFICATIONS_DATA)],
      ['0x456', JSON.stringify(MOCK_NOTIFICATIONS_DATA)],
    ];

    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    const mockPut = handleMockUserStoragePut(
      undefined,
      async (_, requestBody) => {
        if (typeof requestBody === 'string') {
          return;
        }

        const decryptedBody = await Promise.all(
          Object.entries<string>(requestBody.data).map(
            async ([entryKey, entryValue]) => {
              return [
                entryKey,
                await encryption.decryptString(entryValue, MOCK_STORAGE_KEY),
              ];
            },
          ),
        );

        const expectedBody = dataToStore.map(([entryKey, entryValue]) => [
          createSHA256Hash(String(entryKey) + MOCK_STORAGE_KEY),
          entryValue,
        ]);

        expect(decryptedBody).toStrictEqual(expectedBody);
      },
    );

    await userStorage.batchSetItems('accounts', dataToStore);
    expect(mockPut.isDone()).toBe(true);
  });

  it('user storage: delete one feature entry', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    const mockDelete = await handleMockUserStorageDelete();

    await userStorage.deleteItem('notifications.notification_settings');
    expect(mockDelete.isDone()).toBe(true);
  });

  it('user storage: failed to delete one feature entry', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    await handleMockUserStorageDelete({
      status: 401,
      body: {
        message: 'failed to delete storage entry',
        error: 'generic-error',
      },
    });

    await expect(
      userStorage.deleteItem('notifications.notification_settings'),
    ).rejects.toThrow(UserStorageError);
  });

  it('user storage: delete all feature entries', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    const mockDelete = await handleMockUserStorageDeleteAllFeatureEntries();

    await userStorage.deleteAllFeatureItems('notifications');
    expect(mockDelete.isDone()).toBe(true);
  });

  it('user storage: failed to delete all feature entries', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    await handleMockUserStorageDeleteAllFeatureEntries({
      status: 401,
      body: {
        message: 'failed to delete all feature entries',
        error: 'generic-error',
      },
    });

    await expect(
      userStorage.deleteAllFeatureItems('notifications'),
    ).rejects.toThrow(UserStorageError);
  });

  it('user storage: failed to set key', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    handleMockUserStoragePut({
      status: 401,
      body: {
        message: 'failed to insert storage entry',
        error: 'generic-error',
      },
    });

    const data = JSON.stringify(MOCK_NOTIFICATIONS_DATA);
    await expect(
      userStorage.setItem('notifications.notification_settings', data),
    ).rejects.toThrow(UserStorageError);
  });

  it('user storage: failed to batch set items', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    handleMockUserStoragePut({
      status: 401,
      body: {
        message: 'failed to insert storage entries',
        error: 'generic-error',
      },
    });

    await expect(
      userStorage.batchSetItems('notifications', [['key', 'value']]),
    ).rejects.toThrow(UserStorageError);
  });

  it('user storage: failed to get storage entry', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    await handleMockUserStorageGet({
      status: 401,
      body: {
        message: 'failed to get storage entry',
        error: 'generic-error',
      },
    });

    await expect(
      userStorage.getItem('notifications.notification_settings'),
    ).rejects.toThrow(UserStorageError);
  });

  it('user storage: failed to get storage entries', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    await handleMockUserStorageGetAllFeatureEntries({
      status: 401,
      body: {
        message: 'failed to get storage entries',
        error: 'generic-error',
      },
    });

    await expect(
      userStorage.getAllFeatureItems('notifications'),
    ).rejects.toThrow(UserStorageError);
  });

  it('user storage: key not found', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    await handleMockUserStorageGet({
      status: 404,
      body: {
        message: 'key not found',
        error: 'cannot get key',
      },
    });

    await expect(
      userStorage.getItem('notifications.notification_settings'),
    ).rejects.toThrow(NotFoundError);
  });

  it('get/sets using a newly generated storage key (not in storage)', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage, mockGetStorageKey } = arrangeUserStorage(auth);
    mockGetStorageKey.mockResolvedValue(null);
    const mockAuthSignMessage = jest
      .spyOn(auth, 'signMessage')
      .mockResolvedValue(MOCK_STORAGE_KEY);

    handleMockUserStoragePut();

    await userStorage.setItem(
      'notifications.notification_settings',
      'some fake data',
    );
    expect(mockAuthSignMessage).toHaveBeenCalled(); // SignMessage called since generating new key
  });
});

/**
 * Mock Utility - Arrange User Storage for testing
 *
 * @param auth - mock auth to pass in
 * @returns User Storage Instance and mocks
 */
function arrangeUserStorage(auth: IBaseAuth) {
  const mockGetStorageKey =
    typedMockFn<StorageOptions['getStorageKey']>().mockResolvedValue(
      MOCK_STORAGE_KEY,
    );

  const mockSetStorageKey =
    typedMockFn<StorageOptions['setStorageKey']>().mockResolvedValue();

  const userStorage = new UserStorage(
    {
      auth,
      env: Env.DEV,
    },
    {
      storage: {
        getStorageKey: mockGetStorageKey,
        setStorageKey: mockSetStorageKey,
      },
    },
  );

  // Mock Auth API Calls (SRP & SIWE)
  arrangeAuthAPIs();

  return {
    userStorage,
    mockGetStorageKey,
    mockSetStorageKey,
  };
}
