import { arrangeAuthAPIs } from './__fixtures__/mock-auth';
import {
  MOCK_NOTIFICATIONS_DATA,
  MOCK_STORAGE_KEY,
  handleMockUserStorageGet,
  handleMockUserStoragePut,
} from './__fixtures__/mock-userstorage';
import { arrangeAuth, typedMockFn } from './__fixtures__/test-utils';
import type { IBaseAuth } from './authentication-jwt-bearer/types';
import { Env } from './env';
import { NotFoundError, UserStorageError, ValidationError } from './errors';
import type { StorageOptions } from './user-storage';
import { STORAGE_URL, UserStorage } from './user-storage';

const MOCK_SRP = '0x6265617665726275696c642e6f7267';
const MOCK_ADDRESS = '0x68757d15a4d8d1421c17003512AFce15D3f3FaDa';

describe('User Storage - STORAGE_URL()', () => {
  it('generates an example url path for User Storage', () => {
    const result = STORAGE_URL(Env.DEV, 'my-feature', 'my-hashed-entry');
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
    const mockGet = handleMockUserStorageGet();

    // Test Set
    const data = JSON.stringify(MOCK_NOTIFICATIONS_DATA);
    await userStorage.setItem('notifications', 'ui_settings', data);
    expect(mockPut.isDone()).toBe(true);
    expect(mockGet.isDone()).toBe(false);

    // Test Get (we expect the mocked encrypted data to be decrypt-able with the given Mock Storage Key)
    const response = await userStorage.getItem('notifications', 'ui_settings');
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
    const mockGet = handleMockUserStorageGet();

    // Test Set
    const data = JSON.stringify(MOCK_NOTIFICATIONS_DATA);
    await userStorage.setItem('notifications', 'ui_settings', data);
    expect(mockPut.isDone()).toBe(true);
    expect(mockGet.isDone()).toBe(false);

    // Test Get (we expect the mocked encrypted data to be decrypt-able with the given Mock Storage Key)
    const response = await userStorage.getItem('notifications', 'ui_settings');
    expect(mockGet.isDone()).toBe(true);
    expect(response).toBe(data);
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
      userStorage.setItem('notifications', 'ui_settings', data),
    ).rejects.toThrow(UserStorageError);
  });

  it('user storage: failed to get storage entry', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    handleMockUserStorageGet({
      status: 401,
      body: {
        message: 'failed to get storage entry',
        error: 'generic-error',
      },
    });

    await expect(
      userStorage.getItem('notifications', 'ui_settings'),
    ).rejects.toThrow(UserStorageError);
  });

  it('user storage: key not found', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    handleMockUserStorageGet({
      status: 404,
      body: {
        message: 'key not found',
        error: 'cannot get key',
      },
    });

    await expect(
      userStorage.getItem('notifications', 'ui_settings'),
    ).rejects.toThrow(NotFoundError);
  });

  it('get/set fails when given empty feature or keys', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage } = arrangeUserStorage(auth);

    handleMockUserStoragePut();
    handleMockUserStorageGet();

    // Test Set Error
    const data = JSON.stringify(MOCK_NOTIFICATIONS_DATA);
    await expect(userStorage.setItem('', '', data)).rejects.toThrow(
      ValidationError,
    );

    // Test Get Error
    await expect(userStorage.getItem('', '')).rejects.toThrow(ValidationError);
  });

  it('get/sets using a newly generated storage key (not in storage)', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { userStorage, mockGetStorageKey } = arrangeUserStorage(auth);
    mockGetStorageKey.mockResolvedValue(null);
    const mockAuthSignMessage = jest
      .spyOn(auth, 'signMessage')
      .mockResolvedValue(MOCK_STORAGE_KEY);

    handleMockUserStoragePut();

    await userStorage.setItem('notifications', 'ui_settings', 'some fake data');
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
