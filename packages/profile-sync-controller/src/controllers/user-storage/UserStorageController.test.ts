import type { InternalAccount } from '@metamask/keyring-internal-api';
import type nock from 'nock';

import { mockUserStorageMessenger } from './__fixtures__/mockMessenger';
import {
  mockEndpointBatchUpsertUserStorage,
  mockEndpointGetUserStorage,
  mockEndpointGetUserStorageAllFeatureEntries,
  mockEndpointUpsertUserStorage,
  mockEndpointDeleteUserStorageAllFeatureEntries,
  mockEndpointDeleteUserStorage,
  mockEndpointBatchDeleteUserStorage,
} from './__fixtures__/mockServices';
import { waitFor } from './__fixtures__/test-utils';
import { mockUserStorageMessengerForAccountSyncing } from './account-syncing/__fixtures__/test-utils';
import * as AccountSyncControllerIntegrationModule from './account-syncing/controller-integration';
import { BACKUPANDSYNC_FEATURES } from './constants';
import { MOCK_STORAGE_DATA, MOCK_STORAGE_KEY } from './mocks/mockStorage';
import * as NetworkSyncIntegrationModule from './network-syncing/controller-integration';
import { type UserStorageBaseOptions } from './types';
import UserStorageController, { defaultState } from './UserStorageController';
import { USER_STORAGE_FEATURE_NAMES } from '../../shared/storage-schema';

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
    });

    expect(controller.state.isProfileSyncingEnabled).toBe(true);
  });

  it('should call startNetworkSyncing', async () => {
    // Arrange Mock Syncing
    const mockStartNetworkSyncing = jest.spyOn(
      NetworkSyncIntegrationModule,
      'startNetworkSyncing',
    );
    const storageConfig: UserStorageBaseOptions | null = null;
    let isSyncingBlocked: boolean | null = null;

    mockStartNetworkSyncing.mockImplementation(
      ({ isMutationSyncBlocked, getUserStorageControllerInstance }) => {
        isSyncingBlocked = isMutationSyncBlocked();
        // eslint-disable-next-line no-void
        void getUserStorageControllerInstance();
      },
    );

    const { messengerMocks } = arrangeMocks();
    new UserStorageController({
      messenger: messengerMocks.messenger,
      env: {
        isNetworkSyncingEnabled: true,
      },
      state: {
        ...defaultState,
        hasNetworkSyncingSyncedAtLeastOnce: true,
      },
    });

    // Assert Syncing Properties
    await waitFor(() => expect(storageConfig).toBeDefined());
    expect(isSyncingBlocked).toBe(false);
  });
});

describe('user-storage/user-storage-controller - performGetStorage() tests', () => {
  const arrangeMocks = async () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
      mockAPI: await mockEndpointGetUserStorage(),
    };
  };

  it('returns users notification storage', async () => {
    const { messengerMocks, mockAPI } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    const result = await controller.performGetStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
    );
    mockAPI.done();
    expect(result).toBe(MOCK_STORAGE_DATA);
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
      const { messengerMocks } = await arrangeMocks();
      arrangeFailureCase(messengerMocks);
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
      });

      await expect(
        controller.performGetStorage(
          `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
        ),
      ).rejects.toThrow(expect.any(Error));
    },
  );
});

describe('user-storage/user-storage-controller - performGetStorageAllFeatureEntries() tests', () => {
  const arrangeMocks = async () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
      mockAPI: await mockEndpointGetUserStorageAllFeatureEntries(),
    };
  };

  it('returns users notification storage', async () => {
    const { messengerMocks, mockAPI } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    const result =
      await controller.performGetStorageAllFeatureEntries('notifications');
    mockAPI.done();
    expect(result).toStrictEqual([MOCK_STORAGE_DATA]);
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
      const { messengerMocks } = await arrangeMocks();
      arrangeFailureCase(messengerMocks);
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
      });

      await expect(
        controller.performGetStorageAllFeatureEntries(
          USER_STORAGE_FEATURE_NAMES.notifications,
        ),
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
    });

    await controller.performSetStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      'new data',
    );
    expect(mockAPI.isDone()).toBe(true);
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
      });

      await expect(
        controller.performSetStorage(
          `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
          'new data',
        ),
      ).rejects.toThrow(expect.any(Error));
    },
  );

  it('rejects if api call fails', async () => {
    const { messengerMocks } = arrangeMocks({
      mockAPI: mockEndpointUpsertUserStorage(
        `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
        { status: 500 },
      ),
    });
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });
    await expect(
      controller.performSetStorage(
        `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
        'new data',
      ),
    ).rejects.toThrow(expect.any(Error));
  });
});

describe('user-storage/user-storage-controller - performBatchSetStorage() tests', () => {
  const arrangeMocks = (mockResponseStatus?: number) => {
    return {
      messengerMocks: mockUserStorageMessenger(),
      mockAPI: mockEndpointBatchUpsertUserStorage(
        USER_STORAGE_FEATURE_NAMES.notifications,
        mockResponseStatus ? { status: mockResponseStatus } : undefined,
      ),
    };
  };

  it('batch saves to user storage', async () => {
    const { messengerMocks, mockAPI } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    await controller.performBatchSetStorage(
      USER_STORAGE_FEATURE_NAMES.notifications,
      [['notification_settings', 'new data']],
    );
    expect(mockAPI.isDone()).toBe(true);
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
      });

      await expect(
        controller.performBatchSetStorage(
          USER_STORAGE_FEATURE_NAMES.notifications,
          [['notification_settings', 'new data']],
        ),
      ).rejects.toThrow(expect.any(Error));
    },
  );

  it('rejects if api call fails', async () => {
    const { messengerMocks, mockAPI } = arrangeMocks(500);
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    await expect(
      controller.performBatchSetStorage(
        USER_STORAGE_FEATURE_NAMES.notifications,
        [['notification_settings', 'new data']],
      ),
    ).rejects.toThrow(expect.any(Error));
    mockAPI.done();
  });
});

describe('user-storage/user-storage-controller - performBatchDeleteStorage() tests', () => {
  const arrangeMocks = (mockResponseStatus?: number) => {
    return {
      messengerMocks: mockUserStorageMessenger(),
      mockAPI: mockEndpointBatchDeleteUserStorage(
        'notifications',
        mockResponseStatus ? { status: mockResponseStatus } : undefined,
      ),
    };
  };

  it('batch deletes entries in user storage', async () => {
    const { messengerMocks, mockAPI } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    await controller.performBatchDeleteStorage('notifications', [
      'notification_settings',
      'notification_settings',
    ]);
    expect(mockAPI.isDone()).toBe(true);
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
      });

      await expect(
        controller.performBatchDeleteStorage('notifications', [
          'notification_settings',
          'notification_settings',
        ]),
      ).rejects.toThrow(expect.any(Error));
    },
  );

  it('rejects if api call fails', async () => {
    const { messengerMocks, mockAPI } = arrangeMocks(500);
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    await expect(
      controller.performBatchDeleteStorage('notifications', [
        'notification_settings',
        'notification_settings',
      ]),
    ).rejects.toThrow(expect.any(Error));
    mockAPI.done();
  });
});

describe('user-storage/user-storage-controller - performDeleteStorage() tests', () => {
  const arrangeMocks = async (mockResponseStatus?: number) => {
    return {
      messengerMocks: mockUserStorageMessenger(),
      mockAPI: mockEndpointDeleteUserStorage(
        `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
        mockResponseStatus ? { status: mockResponseStatus } : undefined,
      ),
    };
  };

  it('deletes a user storage entry', async () => {
    const { messengerMocks, mockAPI } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    await controller.performDeleteStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
    );
    mockAPI.done();

    expect(mockAPI.isDone()).toBe(true);
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
      const { messengerMocks } = await arrangeMocks();
      arrangeFailureCase(messengerMocks);
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
      });

      await expect(
        controller.performDeleteStorage(
          `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
        ),
      ).rejects.toThrow(expect.any(Error));
    },
  );

  it('rejects if api call fails', async () => {
    const { messengerMocks, mockAPI } = await arrangeMocks(500);
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    await expect(
      controller.performDeleteStorage(
        `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      ),
    ).rejects.toThrow(expect.any(Error));
    mockAPI.done();
  });
});

describe('user-storage/user-storage-controller - performDeleteStorageAllFeatureEntries() tests', () => {
  const arrangeMocks = async (mockResponseStatus?: number) => {
    return {
      messengerMocks: mockUserStorageMessenger(),
      mockAPI: mockEndpointDeleteUserStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.notifications,
        mockResponseStatus ? { status: mockResponseStatus } : undefined,
      ),
    };
  };

  it('deletes all user storage entries for a feature', async () => {
    const { messengerMocks, mockAPI } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    await controller.performDeleteStorageAllFeatureEntries(
      USER_STORAGE_FEATURE_NAMES.notifications,
    );
    mockAPI.done();

    expect(mockAPI.isDone()).toBe(true);
  });

  it.each([
    [
      'fails when no bearer token is found (auth errors)',
      (messengerMocks: ReturnType<typeof mockUserStorageMessenger>) =>
        messengerMocks.mockAuthGetBearerToken.mockRejectedValue(
          new Error('MOCK FAILURE'),
        ),
    ],
    // [
    //   'fails when no session identifier is found (auth errors)',
    //   (messengerMocks: ReturnType<typeof mockUserStorageMessenger>) =>
    //     messengerMocks.mockAuthGetSessionProfile.mockRejectedValue(
    //       new Error('MOCK FAILURE'),
    //     ),
    // ],
  ])(
    'rejects on auth failure - %s',
    async (
      _: string,
      arrangeFailureCase: (
        messengerMocks: ReturnType<typeof mockUserStorageMessenger>,
      ) => void,
    ) => {
      const { messengerMocks } = await arrangeMocks();
      arrangeFailureCase(messengerMocks);
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
      });

      await expect(
        controller.performDeleteStorageAllFeatureEntries(
          USER_STORAGE_FEATURE_NAMES.notifications,
        ),
      ).rejects.toThrow(expect.any(Error));
    },
  );

  it('rejects if api call fails', async () => {
    const { messengerMocks, mockAPI } = await arrangeMocks(500);
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    await expect(
      controller.performDeleteStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.notifications,
      ),
    ).rejects.toThrow(expect.any(Error));
    mockAPI.done();
  });
});

describe('user-storage/user-storage-controller - getStorageKey() tests', () => {
  const arrangeMocks = async () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  };

  it('should return a storage key', async () => {
    const { messengerMocks } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    const result = await controller.getStorageKey();
    expect(result).toBe(MOCK_STORAGE_KEY);
  });

  it('fails when no session identifier is found (auth error)', async () => {
    const { messengerMocks } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    messengerMocks.mockAuthGetSessionProfile.mockRejectedValue(
      new Error('MOCK FAILURE'),
    );

    await expect(controller.getStorageKey()).rejects.toThrow(expect.any(Error));
  });
});

describe('user-storage/user-storage-controller - disableProfileSyncing() tests', () => {
  const arrangeMocks = async () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  };

  it('should disable user storage / profile syncing when called', async () => {
    const { messengerMocks } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    expect(controller.state.isProfileSyncingEnabled).toBe(true);
    await controller.setIsBackupAndSyncFeatureEnabled(
      BACKUPANDSYNC_FEATURES.main,
      false,
    );
    expect(controller.state.isProfileSyncingEnabled).toBe(false);
  });
});

describe('user-storage/user-storage-controller - setIsBackupAndSyncFeatureEnabled tests', () => {
  const arrangeMocks = async () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  };

  it('should enable user storage / backup and sync', async () => {
    const { messengerMocks } = await arrangeMocks();
    messengerMocks.mockAuthIsSignedIn.mockReturnValue(false); // mock that auth is not enabled

    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
        isAccountSyncingEnabled: false,
        hasAccountSyncingSyncedAtLeastOnce: false,
        isAccountSyncingReadyToBeDispatched: false,
        isAccountSyncingInProgress: false,
      },
    });

    expect(controller.state.isProfileSyncingEnabled).toBe(false);
    await controller.setIsBackupAndSyncFeatureEnabled(
      BACKUPANDSYNC_FEATURES.main,
      true,
    );
    expect(controller.state.isProfileSyncingEnabled).toBe(true);
    expect(messengerMocks.mockAuthIsSignedIn).toHaveBeenCalled();
    expect(messengerMocks.mockAuthPerformSignIn).toHaveBeenCalled();
  });

  it('should not update state if it throws', async () => {
    const { messengerMocks } = await arrangeMocks();
    messengerMocks.mockAuthIsSignedIn.mockReturnValue(false); // mock that auth is not enabled

    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
        isAccountSyncingEnabled: false,
        hasAccountSyncingSyncedAtLeastOnce: false,
        isAccountSyncingReadyToBeDispatched: false,
        isAccountSyncingInProgress: false,
      },
    });

    expect(controller.state.isProfileSyncingEnabled).toBe(false);
    messengerMocks.mockAuthPerformSignIn.mockRejectedValue(new Error('error'));

    await expect(
      controller.setIsBackupAndSyncFeatureEnabled(
        BACKUPANDSYNC_FEATURES.main,
        true,
      ),
    ).rejects.toThrow('error');
    expect(controller.state.isProfileSyncingEnabled).toBe(false);
  });

  it('should not disable backup and sync when disabling account syncing', async () => {
    const { messengerMocks } = await arrangeMocks();
    messengerMocks.mockAuthIsSignedIn.mockReturnValue(false); // mock that auth is not enabled

    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      state: {
        isProfileSyncingEnabled: true,
        isProfileSyncingUpdateLoading: false,
        isAccountSyncingEnabled: true,
        hasAccountSyncingSyncedAtLeastOnce: false,
        isAccountSyncingReadyToBeDispatched: false,
        isAccountSyncingInProgress: false,
      },
    });

    expect(controller.state.isProfileSyncingEnabled).toBe(true);
    await controller.setIsBackupAndSyncFeatureEnabled(
      BACKUPANDSYNC_FEATURES.accountSyncing,
      false,
    );
    expect(controller.state.isAccountSyncingEnabled).toBe(false);
    expect(controller.state.isProfileSyncingEnabled).toBe(true);
  });
});

describe('user-storage/user-storage-controller - syncInternalAccountsWithUserStorage() tests', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockUserStorageMessengerForAccountSyncing();
    const mockSyncInternalAccountsWithUserStorage = jest.spyOn(
      AccountSyncControllerIntegrationModule,
      'syncInternalAccountsWithUserStorage',
    );
    const mockSaveInternalAccountToUserStorage = jest.spyOn(
      AccountSyncControllerIntegrationModule,
      'saveInternalAccountToUserStorage',
    );
    return {
      messenger: messengerMocks.messenger,
      mockSyncInternalAccountsWithUserStorage,
      mockSaveInternalAccountToUserStorage,
    };
  };

  // NOTE the actual testing of the implementation is done in `controller-integration.ts` file.
  // See relevant unit tests to see how this feature works and is tested
  it('should invoke syncing from the integration module', async () => {
    const { messenger, mockSyncInternalAccountsWithUserStorage } =
      arrangeMocks();
    const controller = new UserStorageController({
      messenger,
      // We're only verifying that calling this controller method will call the integration module
      // The actual implementation is tested in the integration tests
      // This is done to prevent creating unnecessary nock instances in this test
      config: {
        accountSyncing: {
          onAccountAdded: jest.fn(),
          onAccountNameUpdated: jest.fn(),
          onAccountSyncErroneousSituation: jest.fn(),
        },
      },
    });

    mockSyncInternalAccountsWithUserStorage.mockImplementation(
      async (
        {
          onAccountAdded,
          onAccountNameUpdated,
          onAccountSyncErroneousSituation,
        },
        {
          getMessenger = jest.fn(),
          getUserStorageControllerInstance = jest.fn(),
        },
      ) => {
        onAccountAdded?.();
        onAccountNameUpdated?.();
        onAccountSyncErroneousSituation?.('error message', {});
        getMessenger();
        getUserStorageControllerInstance();
        return undefined;
      },
    );

    await controller.syncInternalAccountsWithUserStorage();

    expect(mockSyncInternalAccountsWithUserStorage).toHaveBeenCalled();
  });
});

describe('user-storage/user-storage-controller - saveInternalAccountToUserStorage() tests', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockUserStorageMessengerForAccountSyncing();
    const mockSaveInternalAccountToUserStorage = jest.spyOn(
      AccountSyncControllerIntegrationModule,
      'saveInternalAccountToUserStorage',
    );
    return {
      messenger: messengerMocks.messenger,
      mockSaveInternalAccountToUserStorage,
    };
  };

  // NOTE the actual testing of the implementation is done in `controller-integration.ts` file.
  // See relevant unit tests to see how this feature works and is tested
  it('should invoke syncing from the integration module', async () => {
    const { messenger, mockSaveInternalAccountToUserStorage } = arrangeMocks();
    const controller = new UserStorageController({
      messenger,
      // We're only verifying that calling this controller method will call the integration module
      // The actual implementation is tested in the integration tests
      // This is done to prevent creating unnecessary nock instances in this test
    });

    mockSaveInternalAccountToUserStorage.mockImplementation(
      async (
        _internalAccount,
        {
          getMessenger = jest.fn(),
          getUserStorageControllerInstance = jest.fn(),
        },
      ) => {
        getMessenger();
        getUserStorageControllerInstance();
        return undefined;
      },
    );

    await controller.saveInternalAccountToUserStorage({
      id: '1',
    } as InternalAccount);

    expect(mockSaveInternalAccountToUserStorage).toHaveBeenCalled();
  });
});

describe('user-storage/user-storage-controller - syncNetworks() tests', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockUserStorageMessenger();
    const mockPerformMainNetworkSync = jest.spyOn(
      NetworkSyncIntegrationModule,
      'performMainNetworkSync',
    );
    return {
      messenger: messengerMocks.messenger,
      mockPerformMainNetworkSync,
      mockGetSessionProfile: messengerMocks.mockAuthGetSessionProfile,
    };
  };

  it('should not be invoked if the feature is not enabled', async () => {
    const { messenger, mockGetSessionProfile, mockPerformMainNetworkSync } =
      arrangeMocks();
    const controller = new UserStorageController({
      messenger,
      env: {
        isNetworkSyncingEnabled: false,
      },
    });

    await controller.syncNetworks();

    expect(mockGetSessionProfile).not.toHaveBeenCalled();
    expect(mockPerformMainNetworkSync).not.toHaveBeenCalled();
  });

  // NOTE the actual testing of the implementation is done in `controller-integration.ts` file.
  // See relevant unit tests to see how this feature works and is tested
  it('should invoke syncing if feature is enabled', async () => {
    const { messenger, mockGetSessionProfile, mockPerformMainNetworkSync } =
      arrangeMocks();
    const controller = new UserStorageController({
      messenger,
      env: {
        isNetworkSyncingEnabled: true,
      },
      config: {
        networkSyncing: {
          onNetworkAdded: jest.fn(),
          onNetworkRemoved: jest.fn(),
          onNetworkUpdated: jest.fn(),
        },
      },
    });

    // For test-coverage, we will simulate calling the analytic callback events
    // This has been correctly tested in `controller-integration.test.ts`
    mockPerformMainNetworkSync.mockImplementation(
      async ({
        onNetworkAdded,
        onNetworkRemoved,
        onNetworkUpdated,
        getUserStorageControllerInstance,
      }) => {
        onNetworkAdded?.('0x1');
        onNetworkRemoved?.('0x1');
        onNetworkUpdated?.('0x1');
        getUserStorageControllerInstance();
      },
    );

    await controller.syncNetworks();

    expect(mockGetSessionProfile).toHaveBeenCalled();
    expect(mockPerformMainNetworkSync).toHaveBeenCalled();
    expect(controller.state.hasNetworkSyncingSyncedAtLeastOnce).toBe(true);
  });
});

describe('user-storage/user-storage-controller - error handling edge cases', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockUserStorageMessenger();
    return { messengerMocks };
  };

  it('handles disabling backup & sync when already disabled', async () => {
    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      state: {
        ...defaultState,
        isProfileSyncingEnabled: false,
      },
    });

    await controller.setIsBackupAndSyncFeatureEnabled(
      BACKUPANDSYNC_FEATURES.main,
      false,
    );
    expect(controller.state.isProfileSyncingEnabled).toBe(false);
  });

  it('handles enabling backup & sync when already enabled and signed in', async () => {
    const { messengerMocks } = arrangeMocks();
    messengerMocks.mockAuthIsSignedIn.mockReturnValue(true);

    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      state: {
        ...defaultState,
        isProfileSyncingEnabled: true,
      },
    });

    await controller.setIsBackupAndSyncFeatureEnabled(
      BACKUPANDSYNC_FEATURES.main,
      true,
    );
    expect(controller.state.isProfileSyncingEnabled).toBe(true);
    expect(messengerMocks.mockAuthPerformSignIn).not.toHaveBeenCalled();
  });
});

describe('user-storage/user-storage-controller - account syncing edge cases', () => {
  it('handles account syncing disabled case', async () => {
    const messengerMocks = mockUserStorageMessenger();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    await controller.setIsBackupAndSyncFeatureEnabled(
      BACKUPANDSYNC_FEATURES.accountSyncing,
      false,
    );
    await controller.syncInternalAccountsWithUserStorage();

    // Should not have called the account syncing module
    expect(messengerMocks.mockAccountsListAccounts).not.toHaveBeenCalled();
  });

  it('handles syncing when not signed in', async () => {
    const messengerMocks = mockUserStorageMessenger();
    messengerMocks.mockAuthIsSignedIn.mockReturnValue(false);

    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    await controller.syncInternalAccountsWithUserStorage();

    expect(messengerMocks.mockAuthIsSignedIn).toHaveBeenCalled();
    expect(messengerMocks.mockAuthPerformSignIn).not.toHaveBeenCalled();
  });

  it('handles saveInternalAccountToUserStorage when disabled', async () => {
    const messengerMocks = mockUserStorageMessenger();

    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    const mockSetStorage = jest.spyOn(controller, 'performSetStorage');

    // Create mock account
    const mockAccount = {
      id: '123',
      address: '0x123',
      metadata: {
        name: 'Test',
        nameLastUpdatedAt: Date.now(),
      },
    } as InternalAccount;

    await controller.saveInternalAccountToUserStorage(mockAccount);

    expect(mockSetStorage).not.toHaveBeenCalled();
  });
});

describe('user-storage/user-storage-controller - snap handling', () => {
  it('leverages a cache', async () => {
    const messengerMocks = mockUserStorageMessenger();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    expect(await controller.getStorageKey()).toBe(MOCK_STORAGE_KEY);
    controller.flushStorageKeyCache();
    expect(await controller.getStorageKey()).toBe(MOCK_STORAGE_KEY);
  });

  it('throws if the wallet is locked', async () => {
    const messengerMocks = mockUserStorageMessenger();
    messengerMocks.mockKeyringGetState.mockReturnValue({
      isUnlocked: false,
      keyrings: [],
      keyringsMetadata: [],
    });
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    await expect(controller.getStorageKey()).rejects.toThrow(
      '#snapSignMessage - unable to call snap, wallet is locked',
    );
  });

  it('handles wallet lock state changes', async () => {
    const messengerMocks = mockUserStorageMessenger();

    messengerMocks.mockKeyringGetState.mockReturnValue({
      isUnlocked: true,
      keyrings: [],
      keyringsMetadata: [],
    });

    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    messengerMocks.baseMessenger.publish('KeyringController:lock');

    await expect(controller.getStorageKey()).rejects.toThrow(
      '#snapSignMessage - unable to call snap, wallet is locked',
    );

    messengerMocks.baseMessenger.publish('KeyringController:unlock');
    expect(await controller.getStorageKey()).toBe(MOCK_STORAGE_KEY);
  });
});
