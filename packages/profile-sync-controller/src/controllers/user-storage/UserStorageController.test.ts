import { ControllerMessenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-api';
import type nock from 'nock';

import type {
  AuthenticationControllerGetBearerToken,
  AuthenticationControllerGetSessionProfile,
  AuthenticationControllerIsSignedIn,
  AuthenticationControllerPerformSignIn,
} from '../authentication/AuthenticationController';
import {
  MOCK_INTERNAL_ACCOUNTS_LISTS,
  MOCK_USER_STORAGE_ACCOUNTS_LISTS,
} from './__fixtures__/mockAccounts';
import {
  mockEndpointGetUserStorage,
  mockEndpointUpsertUserStorage,
} from './__fixtures__/mockServices';
import {
  MOCK_STORAGE_DATA,
  MOCK_STORAGE_KEY,
  MOCK_STORAGE_KEY_SIGNATURE,
} from './__fixtures__/mockStorage';
import encryption from './encryption/encryption';
import type {
  AllowedActions,
  AllowedEvents,
  NotificationServicesControllerDisableNotificationServices,
  NotificationServicesControllerSelectIsNotificationServicesEnabled,
} from './UserStorageController';
import UserStorageController from './UserStorageController';

const typedMockFn = <Func extends (...args: unknown[]) => unknown>() =>
  jest.fn<ReturnType<Func>, Parameters<Func>>();

describe('user-storage/user-storage-controller - constructor() tests', () => {
  const arrangeMocks = () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  };

  it('creates UserStorage with default state', () => {
    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    expect(controller.state.isProfileSyncingEnabled).toBe(true);
  });
});

describe('user-storage/user-storage-controller - performGetStorage() tests', () => {
  const arrangeMocks = () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
      mockAPI: mockEndpointGetUserStorage(),
    };
  };

  it('returns users notification storage', async () => {
    const { messengerMocks, mockAPI } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    const result = await controller.performGetStorage(
      'notifications.notificationSettings',
    );
    mockAPI.done();
    expect(result).toBe(MOCK_STORAGE_DATA);
  });

  it('returns users account storage', async () => {
    const mockUserStorageAccountsResponse = {
      status: 200,
      body: {
        HashedKey: 'HASHED_KEY',
        Data: encryption.encryptString(
          JSON.stringify(
            MOCK_USER_STORAGE_ACCOUNTS_LISTS.SAME_AS_INTERNAL_FULL,
          ),
          MOCK_STORAGE_KEY,
        ),
      },
    };

    const arrangeMocksForAccounts = () => {
      return {
        messengerMocks: mockUserStorageMessenger(),
        mockAPI: mockEndpointGetUserStorage(
          'accounts.list',
          mockUserStorageAccountsResponse,
        ),
      };
    };

    const { messengerMocks, mockAPI } = arrangeMocksForAccounts();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    const result = await controller.performGetStorage('accounts.list');
    mockAPI.done();
    expect(result).toBe(
      JSON.stringify(MOCK_USER_STORAGE_ACCOUNTS_LISTS.SAME_AS_INTERNAL_FULL),
    );
  });

  it('rejects if UserStorage is not enabled', async () => {
    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
        isUserStorageAccountSyncingInProgress: false,
      },
    });

    await expect(
      controller.performGetStorage('notifications.notificationSettings'),
    ).rejects.toThrow(expect.any(Error));
  });

  it.each([
    [
      'fails when no bearer token is found (auth errors)',
      (messengerMocks: ReturnType<typeof mockUserStorageMessenger>) =>
        messengerMocks.mockAuthGetBearerToken.mockRejectedValue(
          new Error('MOCK FAILURE'),
        ),
    ],
    [
      'fails when no session identifier is found (auth errors)',
      (messengerMocks: ReturnType<typeof mockUserStorageMessenger>) =>
        messengerMocks.mockAuthGetSessionProfile.mockRejectedValue(
          new Error('MOCK FAILURE'),
        ),
    ],
  ])(
    'rejects on auth failure - %s',
    async (
      _: string,
      arrangeFailureCase: (
        messengerMocks: ReturnType<typeof mockUserStorageMessenger>,
      ) => void,
    ) => {
      const { messengerMocks } = arrangeMocks();
      arrangeFailureCase(messengerMocks);
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        getMetaMetricsState: () => true,
      });

      await expect(
        controller.performGetStorage('notifications.notificationSettings'),
      ).rejects.toThrow(expect.any(Error));
    },
  );
});

describe('user-storage/user-storage-controller - performSetStorage() tests', () => {
  const arrangeMocks = (overrides?: { mockAPI?: nock.Scope }) => {
    return {
      messengerMocks: mockUserStorageMessenger(),
      mockAPI: overrides?.mockAPI ?? mockEndpointUpsertUserStorage(),
    };
  };

  it('saves users storage', async () => {
    const { messengerMocks, mockAPI } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    await controller.performSetStorage(
      'notifications.notificationSettings',
      'new data',
    );
    expect(mockAPI.isDone()).toBe(true);
  });

  it('rejects if UserStorage is not enabled', async () => {
    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
        isUserStorageAccountSyncingInProgress: false,
      },
    });

    await expect(
      controller.performSetStorage(
        'notifications.notificationSettings',
        'new data',
      ),
    ).rejects.toThrow(expect.any(Error));
  });

  it.each([
    [
      'fails when no bearer token is found (auth errors)',
      (messengerMocks: ReturnType<typeof mockUserStorageMessenger>) =>
        messengerMocks.mockAuthGetBearerToken.mockRejectedValue(
          new Error('MOCK FAILURE'),
        ),
    ],
    [
      'fails when no session identifier is found (auth errors)',
      (messengerMocks: ReturnType<typeof mockUserStorageMessenger>) =>
        messengerMocks.mockAuthGetSessionProfile.mockRejectedValue(
          new Error('MOCK FAILURE'),
        ),
    ],
  ])(
    'rejects on auth failure - %s',
    async (
      _: string,
      arrangeFailureCase: (
        messengerMocks: ReturnType<typeof mockUserStorageMessenger>,
      ) => void,
    ) => {
      const { messengerMocks } = arrangeMocks();
      arrangeFailureCase(messengerMocks);
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        getMetaMetricsState: () => true,
      });

      await expect(
        controller.performSetStorage(
          'notifications.notificationSettings',
          'new data',
        ),
      ).rejects.toThrow(expect.any(Error));
    },
  );

  it('rejects if api call fails', async () => {
    const { messengerMocks } = arrangeMocks({
      mockAPI: mockEndpointUpsertUserStorage(
        'notifications.notificationSettings',
        { status: 500 },
      ),
    });
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });
    await expect(
      controller.performSetStorage(
        'notifications.notificationSettings',
        'new data',
      ),
    ).rejects.toThrow(expect.any(Error));
  });
});

describe('user-storage/user-storage-controller - getStorageKey() tests', () => {
  const arrangeMocks = () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  };

  it('should return a storage key', async () => {
    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    const result = await controller.getStorageKey();
    expect(result).toBe(MOCK_STORAGE_KEY);
  });

  it('rejects if UserStorage is not enabled', async () => {
    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
        isUserStorageAccountSyncingInProgress: false,
      },
    });

    await expect(controller.getStorageKey()).rejects.toThrow(expect.any(Error));
  });
});

describe('user-storage/user-storage-controller - disableProfileSyncing() tests', () => {
  const arrangeMocks = () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  };

  it('should disable user storage / profile syncing when called', async () => {
    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    expect(controller.state.isProfileSyncingEnabled).toBe(true);
    await controller.disableProfileSyncing();
    expect(controller.state.isProfileSyncingEnabled).toBe(false);
  });
});

describe('user-storage/user-storage-controller - enableProfileSyncing() tests', () => {
  const arrangeMocks = () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  };

  it('should enable user storage / profile syncing', async () => {
    const { messengerMocks } = arrangeMocks();
    messengerMocks.mockAuthIsSignedIn.mockReturnValue(false); // mock that auth is not enabled

    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
        isUserStorageAccountSyncingInProgress: false,
      },
    });

    expect(controller.state.isProfileSyncingEnabled).toBe(false);
    await controller.enableProfileSyncing();
    expect(controller.state.isProfileSyncingEnabled).toBe(true);
    expect(messengerMocks.mockAuthIsSignedIn).toHaveBeenCalled();
    expect(messengerMocks.mockAuthPerformSignIn).toHaveBeenCalled();
  });
});

describe('user-storage/user-storage-controller - syncInternalAccountsListWithUserStorage() tests', () => {
  it('rejects if UserStorage is not enabled', async () => {
    const arrangeMocks = () => {
      return {
        messengerMocks: mockUserStorageMessenger(),
        mockAPI: mockEndpointGetUserStorage(),
      };
    };

    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
        isUserStorageAccountSyncingInProgress: false,
      },
    });

    await expect(
      controller.syncInternalAccountsListWithUserStorage(),
    ).rejects.toThrow(expect.any(Error));
  });

  it('uploads accounts list to user storage if user storage is empty', async () => {
    const mockUserStorageAccountsResponse = {
      status: 404,
      body: {},
    };

    const arrangeMocks = () => {
      return {
        messengerMocks: mockUserStorageMessenger(),
        mockAPI: {
          mockEndpointGetUserStorage: mockEndpointGetUserStorage(
            'accounts.list',
            mockUserStorageAccountsResponse,
          ),
          mockEndpointUpsertUserStorage:
            mockEndpointUpsertUserStorage('accounts.list'),
        },
      };
    };

    const { messengerMocks, mockAPI } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    await controller.syncInternalAccountsListWithUserStorage();
    mockAPI.mockEndpointGetUserStorage.done();
    mockAPI.mockEndpointUpsertUserStorage.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);
    expect(mockAPI.mockEndpointUpsertUserStorage.isDone()).toBe(true);
  });

  it('creates internal accounts if user storage has more accounts', async () => {
    const mockUserStorageAccountsResponse = {
      status: 200,
      body: {
        HashedKey: 'HASHED_KEY',
        Data: encryption.encryptString(
          JSON.stringify(
            MOCK_USER_STORAGE_ACCOUNTS_LISTS.SAME_AS_INTERNAL_FULL,
          ),
          MOCK_STORAGE_KEY,
        ),
      },
    };

    const arrangeMocksForAccounts = () => {
      return {
        messengerMocks: mockUserStorageMessenger({
          accounts: {
            accountsList: MOCK_INTERNAL_ACCOUNTS_LISTS.EMPTY,
          },
        }),
        mockAPI: {
          mockEndpointGetUserStorage: mockEndpointGetUserStorage(
            'accounts.list',
            mockUserStorageAccountsResponse,
          ),
          mockEndpointUpsertUserStorage:
            mockEndpointUpsertUserStorage('accounts.list'),
        },
      };
    };

    const { messengerMocks, mockAPI } = arrangeMocksForAccounts();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    await controller.syncInternalAccountsListWithUserStorage();

    mockAPI.mockEndpointGetUserStorage.done();
    mockAPI.mockEndpointUpsertUserStorage.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);
    expect(mockAPI.mockEndpointUpsertUserStorage.isDone()).toBe(true);

    expect(messengerMocks.mockKeyringAddNewAccount).toHaveBeenCalledTimes(
      MOCK_USER_STORAGE_ACCOUNTS_LISTS.SAME_AS_INTERNAL_FULL.l.length,
    );
  });

  it('does not create internal accounts if user storage has less accounts', async () => {
    const mockUserStorageAccountsResponse = {
      status: 200,
      body: {
        HashedKey: 'HASHED_KEY',
        Data: encryption.encryptString(
          JSON.stringify(MOCK_USER_STORAGE_ACCOUNTS_LISTS.JUST_ONE),
          MOCK_STORAGE_KEY,
        ),
      },
    };

    const arrangeMocksForAccounts = () => {
      return {
        messengerMocks: mockUserStorageMessenger({
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS_LISTS.FULL as InternalAccount[],
          },
        }),
        mockAPI: {
          mockEndpointGetUserStorage: mockEndpointGetUserStorage(
            'accounts.list',
            mockUserStorageAccountsResponse,
          ),
          mockEndpointUpsertUserStorage:
            mockEndpointUpsertUserStorage('accounts.list'),
        },
      };
    };

    const { messengerMocks, mockAPI } = arrangeMocksForAccounts();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    await controller.syncInternalAccountsListWithUserStorage();

    mockAPI.mockEndpointGetUserStorage.done();
    mockAPI.mockEndpointUpsertUserStorage.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);
    expect(mockAPI.mockEndpointUpsertUserStorage.isDone()).toBe(true);

    expect(messengerMocks.mockKeyringAddNewAccount).not.toHaveBeenCalled();
  });
});

/**
 * Jest Mock Utility - create a mock user storage messenger
 *
 * @param options - options for the mock messenger
 * @param options.accounts - options for the accounts part of the controller
 * @param options.accounts.accountsList - list of accounts to return for the 'AccountsController:listAccounts' action
 * @returns Mock User Storage Messenger
 */
function mockUserStorageMessenger(options?: {
  accounts: {
    accountsList?: InternalAccount[];
  };
}) {
  const messenger = new ControllerMessenger<
    AllowedActions,
    AllowedEvents
  >().getRestricted({
    name: 'UserStorageController',
    allowedActions: [
      'KeyringController:getState',
      'SnapController:handleRequest',
      'AuthenticationController:getBearerToken',
      'AuthenticationController:getSessionProfile',
      'AuthenticationController:isSignedIn',
      'AuthenticationController:performSignIn',
      'AuthenticationController:performSignOut',
      'NotificationServicesController:disableNotificationServices',
      'NotificationServicesController:selectIsNotificationServicesEnabled',
      'AccountsController:listAccounts',
      'AccountsController:setAccountName',
      'AccountsController:updateAccountMetadata',
      'KeyringController:addNewAccount',
    ],
    allowedEvents: ['KeyringController:lock', 'KeyringController:unlock'],
  });

  const mockSnapGetPublicKey = jest.fn().mockResolvedValue('MOCK_PUBLIC_KEY');
  const mockSnapSignMessage = jest
    .fn()
    .mockResolvedValue(MOCK_STORAGE_KEY_SIGNATURE);

  const mockAuthGetBearerToken =
    typedMockFn<
      AuthenticationControllerGetBearerToken['handler']
    >().mockResolvedValue('MOCK_BEARER_TOKEN');

  const mockAuthGetSessionProfile = typedMockFn<
    AuthenticationControllerGetSessionProfile['handler']
  >().mockResolvedValue({
    identifierId: '',
    profileId: 'MOCK_PROFILE_ID',
  });

  const mockAuthPerformSignIn =
    typedMockFn<
      AuthenticationControllerPerformSignIn['handler']
    >().mockResolvedValue('New Access Token');

  const mockAuthIsSignedIn =
    typedMockFn<
      AuthenticationControllerIsSignedIn['handler']
    >().mockReturnValue(true);

  const mockAuthPerformSignOut =
    typedMockFn<
      AuthenticationControllerIsSignedIn['handler']
    >().mockReturnValue(true);

  const mockNotificationServicesIsEnabled =
    typedMockFn<
      NotificationServicesControllerSelectIsNotificationServicesEnabled['handler']
    >().mockReturnValue(true);

  const mockNotificationServicesDisableNotifications =
    typedMockFn<
      NotificationServicesControllerDisableNotificationServices['handler']
    >().mockResolvedValue();

  const mockKeyringAddNewAccount = jest.fn().mockResolvedValue('0x123');

  jest.spyOn(messenger, 'call').mockImplementation((...args) => {
    const [actionType, params] = args;
    if (actionType === 'SnapController:handleRequest') {
      if (
        (params as Exclude<typeof params, string | number>)?.request.method ===
        'getPublicKey'
      ) {
        return mockSnapGetPublicKey();
      }

      if (
        (params as Exclude<typeof params, string | number>)?.request.method ===
        'signMessage'
      ) {
        return mockSnapSignMessage();
      }

      throw new Error(
        `MOCK_FAIL - unsupported SnapController:handleRequest call: ${
          (params as Exclude<typeof params, string | number>)?.request
            .method as string
        }`,
      );
    }

    if (actionType === 'AuthenticationController:getBearerToken') {
      return mockAuthGetBearerToken();
    }

    if (actionType === 'AuthenticationController:getSessionProfile') {
      return mockAuthGetSessionProfile();
    }

    if (actionType === 'AuthenticationController:performSignIn') {
      return mockAuthPerformSignIn();
    }

    if (actionType === 'AuthenticationController:isSignedIn') {
      return mockAuthIsSignedIn();
    }

    if (
      actionType ===
      'NotificationServicesController:selectIsNotificationServicesEnabled'
    ) {
      return mockNotificationServicesIsEnabled();
    }

    if (
      actionType ===
      'NotificationServicesController:disableNotificationServices'
    ) {
      return mockNotificationServicesDisableNotifications();
    }

    if (actionType === 'AuthenticationController:performSignOut') {
      return mockAuthPerformSignOut();
    }

    if (actionType === 'KeyringController:getState') {
      return { isUnlocked: true };
    }

    if (actionType === 'KeyringController:addNewAccount') {
      return mockKeyringAddNewAccount();
    }

    if (actionType === 'AccountsController:listAccounts') {
      if (options?.accounts?.accountsList) {
        return options.accounts.accountsList;
      }
      return MOCK_INTERNAL_ACCOUNTS_LISTS.FULL;
    }

    if (actionType === 'AccountsController:setAccountName') {
      // TODO: fix this
      return true;
    }

    if (actionType === 'AccountsController:updateAccountMetadata') {
      // TODO: fix this
      return true;
    }

    const exhaustedMessengerMocks = (action: never) => {
      throw new Error(
        `MOCK_FAIL - unsupported messenger call: ${action as string}`,
      );
    };

    return exhaustedMessengerMocks(actionType);
  });

  return {
    messenger,
    mockSnapGetPublicKey,
    mockSnapSignMessage,
    mockAuthGetBearerToken,
    mockAuthGetSessionProfile,
    mockAuthPerformSignIn,
    mockAuthIsSignedIn,
    mockNotificationServicesIsEnabled,
    mockNotificationServicesDisableNotifications,
    mockAuthPerformSignOut,
    mockKeyringAddNewAccount,
  };
}
