import type { InternalAccount } from '@metamask/keyring-internal-api';
import type nock from 'nock';

import { USER_STORAGE_FEATURE_NAMES } from '../../shared/storage-schema';
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
import {
  MOCK_STORAGE_DATA,
  MOCK_STORAGE_KEY,
} from './__fixtures__/mockStorage';
import { waitFor } from './__fixtures__/test-utils';
import { mockUserStorageMessengerForAccountSyncing } from './account-syncing/__fixtures__/test-utils';
import * as AccountSyncControllerIntegrationModule from './account-syncing/controller-integration';
import * as NetworkSyncIntegrationModule from './network-syncing/controller-integration';
import type { UserStorageBaseOptions } from './services';
import UserStorageController, { defaultState } from './UserStorageController';

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

  it('should call startNetworkSyncing', async () => {
    // Arrange Mock Syncing
    const mockStartNetworkSyncing = jest.spyOn(
      NetworkSyncIntegrationModule,
      'startNetworkSyncing',
    );
    let storageConfig: UserStorageBaseOptions | null = null;
    let isSyncingBlocked: boolean | null = null;
    mockStartNetworkSyncing.mockImplementation(
      ({ getStorageConfig, isMutationSyncBlocked }) => {
        // eslint-disable-next-line no-void
        void getStorageConfig().then((s) => (storageConfig = s));

        isSyncingBlocked = isMutationSyncBlocked();
      },
    );

    const { messengerMocks } = arrangeMocks();
    new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
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
      getMetaMetricsState: () => true,
    });

    const result = await controller.performGetStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
    );
    mockAPI.done();
    expect(result).toBe(MOCK_STORAGE_DATA);
  });

  it('rejects if UserStorage is not enabled', async () => {
    const { messengerMocks } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
        isAccountSyncingInProgress: false,
        hasAccountSyncingSyncedAtLeastOnce: false,
        isAccountSyncingReadyToBeDispatched: false,
      },
    });

    await expect(
      controller.performGetStorage(
        `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
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
      const { messengerMocks } = await arrangeMocks();
      arrangeFailureCase(messengerMocks);
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        getMetaMetricsState: () => true,
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
      getMetaMetricsState: () => true,
    });

    const result = await controller.performGetStorageAllFeatureEntries(
      'notifications',
    );
    mockAPI.done();
    expect(result).toStrictEqual([MOCK_STORAGE_DATA]);
  });

  it('rejects if UserStorage is not enabled', async () => {
    const { messengerMocks } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
        hasAccountSyncingSyncedAtLeastOnce: false,
        isAccountSyncingReadyToBeDispatched: false,
        isAccountSyncingInProgress: false,
      },
    });

    await expect(
      controller.performGetStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.notifications,
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
      const { messengerMocks } = await arrangeMocks();
      arrangeFailureCase(messengerMocks);
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        getMetaMetricsState: () => true,
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
      getMetaMetricsState: () => true,
    });

    await controller.performSetStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
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
        hasAccountSyncingSyncedAtLeastOnce: false,
        isAccountSyncingReadyToBeDispatched: false,
        isAccountSyncingInProgress: false,
      },
    });

    await expect(
      controller.performSetStorage(
        `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
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
      getMetaMetricsState: () => true,
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
      getMetaMetricsState: () => true,
    });

    await controller.performBatchSetStorage(
      USER_STORAGE_FEATURE_NAMES.notifications,
      [['notification_settings', 'new data']],
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
        hasAccountSyncingSyncedAtLeastOnce: false,
        isAccountSyncingReadyToBeDispatched: false,
        isAccountSyncingInProgress: false,
      },
    });

    await expect(
      controller.performBatchSetStorage(
        USER_STORAGE_FEATURE_NAMES.notifications,
        [['notification_settings', 'new data']],
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
      getMetaMetricsState: () => true,
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
      getMetaMetricsState: () => true,
    });

    await controller.performBatchDeleteStorage('notifications', [
      'notification_settings',
      'notification_settings',
    ]);
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
        hasAccountSyncingSyncedAtLeastOnce: false,
        isAccountSyncingReadyToBeDispatched: false,
        isAccountSyncingInProgress: false,
      },
    });

    await expect(
      controller.performBatchDeleteStorage('notifications', [
        'notification_settings',
        'notification_settings',
      ]),
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
      getMetaMetricsState: () => true,
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
      getMetaMetricsState: () => true,
    });

    await controller.performDeleteStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
    );
    mockAPI.done();

    expect(mockAPI.isDone()).toBe(true);
  });

  it('rejects if UserStorage is not enabled', async () => {
    const { messengerMocks } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
        hasAccountSyncingSyncedAtLeastOnce: false,
        isAccountSyncingReadyToBeDispatched: false,
        isAccountSyncingInProgress: false,
      },
    });

    await expect(
      controller.performDeleteStorage(
        `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
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
      const { messengerMocks } = await arrangeMocks();
      arrangeFailureCase(messengerMocks);
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        getMetaMetricsState: () => true,
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
      getMetaMetricsState: () => true,
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
      getMetaMetricsState: () => true,
    });

    await controller.performDeleteStorageAllFeatureEntries(
      USER_STORAGE_FEATURE_NAMES.notifications,
    );
    mockAPI.done();

    expect(mockAPI.isDone()).toBe(true);
  });

  it('rejects if UserStorage is not enabled', async () => {
    const { messengerMocks } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
        hasAccountSyncingSyncedAtLeastOnce: false,
        isAccountSyncingReadyToBeDispatched: false,
        isAccountSyncingInProgress: false,
      },
    });

    await expect(
      controller.performDeleteStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.notifications,
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
      const { messengerMocks } = await arrangeMocks();
      arrangeFailureCase(messengerMocks);
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        getMetaMetricsState: () => true,
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
      getMetaMetricsState: () => true,
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
      getMetaMetricsState: () => true,
    });

    const result = await controller.getStorageKey();
    expect(result).toBe(MOCK_STORAGE_KEY);
  });

  it('rejects if UserStorage is not enabled', async () => {
    const { messengerMocks } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
        hasAccountSyncingSyncedAtLeastOnce: false,
        isAccountSyncingReadyToBeDispatched: false,
        isAccountSyncingInProgress: false,
      },
    });

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
      getMetaMetricsState: () => true,
    });

    expect(controller.state.isProfileSyncingEnabled).toBe(true);
    await controller.disableProfileSyncing();
    expect(controller.state.isProfileSyncingEnabled).toBe(false);
  });
});

describe('user-storage/user-storage-controller - enableProfileSyncing() tests', () => {
  const arrangeMocks = async () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  };

  it('should enable user storage / profile syncing', async () => {
    const { messengerMocks } = await arrangeMocks();
    messengerMocks.mockAuthIsSignedIn.mockReturnValue(false); // mock that auth is not enabled

    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
        hasAccountSyncingSyncedAtLeastOnce: false,
        isAccountSyncingReadyToBeDispatched: false,
        isAccountSyncingInProgress: false,
      },
    });

    expect(controller.state.isProfileSyncingEnabled).toBe(false);
    await controller.enableProfileSyncing();
    expect(controller.state.isProfileSyncingEnabled).toBe(true);
    expect(messengerMocks.mockAuthIsSignedIn).toHaveBeenCalled();
    expect(messengerMocks.mockAuthPerformSignIn).toHaveBeenCalled();
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
      getMetaMetricsState: () => true,
      env: {
        // We're only verifying that calling this controller method will call the integration module
        // The actual implementation is tested in the integration tests
        // This is done to prevent creating unnecessary nock instances in this test
        isAccountSyncingEnabled: false,
      },
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
        onAccountSyncErroneousSituation?.('error message');
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
      getMetaMetricsState: () => true,
      env: {
        // We're only verifying that calling this controller method will call the integration module
        // The actual implementation is tested in the integration tests
        // This is done to prevent creating unnecessary nock instances in this test
        isAccountSyncingEnabled: false,
      },
    });

    mockSaveInternalAccountToUserStorage.mockImplementation(
      async (
        _internalAccount,
        _config,
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

  const nonImportantControllerProps = () => ({
    getMetaMetricsState: () => true,
  });

  it('should not be invoked if the feature is not enabled', async () => {
    const { messenger, mockGetSessionProfile, mockPerformMainNetworkSync } =
      arrangeMocks();
    const controller = new UserStorageController({
      ...nonImportantControllerProps(),
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
      ...nonImportantControllerProps(),
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
        getStorageConfig,
      }) => {
        const config = await getStorageConfig();
        expect(config).toBeDefined();
        onNetworkAdded?.('0x1');
        onNetworkRemoved?.('0x1');
        onNetworkUpdated?.('0x1');
      },
    );

    await controller.syncNetworks();

    expect(mockGetSessionProfile).toHaveBeenCalled();
    expect(mockPerformMainNetworkSync).toHaveBeenCalled();
    expect(controller.state.hasNetworkSyncingSyncedAtLeastOnce).toBe(true);
  });
});
