import {
  handleMockNonce,
  handleMockOAuth2Token,
  handleMockSiweLogin,
  handleMockSrpLogin,
} from './__fixtures__/mock-auth';
import {
  MOCK_NOTIFICATIONS_DATA,
  MOCK_STORAGE_KEY,
  handleMockUserStorageGet,
  handleMockUserStoragePut,
} from './__fixtures__/mock-userstorage';
import { arrangeAuth, typedMockFn } from './__fixtures__/test-utils';
import type { JwtBearerAuth } from './authentication';
import { Env } from './env';
import { NotFoundError, UserStorageError } from './errors';
import type { StorageOptions } from './user-storage';
import { UserStorage } from './user-storage';

const MOCK_SRP = '0x6265617665726275696c642e6f7267';
const MOCK_ADDRESS = '0x68757d15a4d8d1421c17003512AFce15D3f3FaDa';

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
    const { auth } = arrangeAuth('SIWE', MOCK_ADDRESS);
    auth.initialize({
      address: MOCK_ADDRESS,
      chainId: 1,
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
      status: 500,
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
      status: 500,
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
});

/**
 * Mock Utility - Arrange User Storage for testing
 *
 * @param auth - mock auth to pass in
 * @returns User Storage Instance and mocks
 */
function arrangeUserStorage(auth: JwtBearerAuth) {
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
  handleMockNonce();
  handleMockSrpLogin();
  handleMockSiweLogin();
  handleMockOAuth2Token();

  return {
    userStorage,
    mockGetStorageKey,
    mockSetStorageKey,
  };
}
