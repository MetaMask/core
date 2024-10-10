import { ControllerMessenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-api';
import type nock from 'nock';

import encryption, { createSHA256Hash } from '../../shared/encryption';
import type {
  AuthenticationControllerGetBearerToken,
  AuthenticationControllerGetSessionProfile,
  AuthenticationControllerIsSignedIn,
  AuthenticationControllerPerformSignIn,
} from '../authentication/AuthenticationController';
import {
  MOCK_INTERNAL_ACCOUNTS,
  MOCK_USER_STORAGE_ACCOUNTS,
} from './__fixtures__/mockAccounts';
import {
  mockEndpointBatchUpsertUserStorage,
  mockEndpointGetUserStorage,
  mockEndpointGetUserStorageAllFeatureEntries,
  mockEndpointUpsertUserStorage,
  mockEndpointDeleteUserStorageAllFeatureEntries,
  mockEndpointDeleteUserStorage,
} from './__fixtures__/mockServices';
import {
  MOCK_STORAGE_DATA,
  MOCK_STORAGE_KEY,
  MOCK_STORAGE_KEY_SIGNATURE,
} from './__fixtures__/mockStorage';
import * as AccountsUserStorageModule from './accounts/user-storage';
import type {
  GetUserStorageAllFeatureEntriesResponse,
  GetUserStorageResponse,
} from './services';
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
      'notifications.notification_settings',
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
      },
    });

    await expect(
      controller.performGetStorage('notifications.notification_settings'),
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
        controller.performGetStorage('notifications.notification_settings'),
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
      },
    });

    await expect(
      controller.performGetStorageAllFeatureEntries('notifications'),
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
        controller.performGetStorageAllFeatureEntries('notifications'),
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
      'notifications.notification_settings',
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
      },
    });

    await expect(
      controller.performSetStorage(
        'notifications.notification_settings',
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
          'notifications.notification_settings',
          'new data',
        ),
      ).rejects.toThrow(expect.any(Error));
    },
  );

  it('rejects if api call fails', async () => {
    const { messengerMocks } = arrangeMocks({
      mockAPI: mockEndpointUpsertUserStorage(
        'notifications.notification_settings',
        { status: 500 },
      ),
    });
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });
    await expect(
      controller.performSetStorage(
        'notifications.notification_settings',
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
        'notifications',
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

    await controller.performBatchSetStorage('notifications', [
      ['notifications.notification_settings', 'new data'],
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
      },
    });

    await expect(
      controller.performBatchSetStorage('notifications', [
        ['notifications.notification_settings', 'new data'],
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
        controller.performBatchSetStorage('notifications', [
          ['notifications.notification_settings', 'new data'],
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
      controller.performBatchSetStorage('notifications', [
        ['notifications.notification_settings', 'new data'],
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
        'notifications.notification_settings',
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
      'notifications.notification_settings',
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
      },
    });

    await expect(
      controller.performDeleteStorage('notifications.notification_settings'),
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
        controller.performDeleteStorage('notifications.notification_settings'),
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
      controller.performDeleteStorage('notifications.notification_settings'),
    ).rejects.toThrow(expect.any(Error));
    mockAPI.done();
  });
});

describe('user-storage/user-storage-controller - performDeleteStorageAllFeatureEntries() tests', () => {
  const arrangeMocks = async (mockResponseStatus?: number) => {
    return {
      messengerMocks: mockUserStorageMessenger(),
      mockAPI: mockEndpointDeleteUserStorageAllFeatureEntries(
        'notifications',
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

    await controller.performDeleteStorageAllFeatureEntries('notifications');
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
      },
    });

    await expect(
      controller.performDeleteStorageAllFeatureEntries('notifications'),
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
        controller.performDeleteStorageAllFeatureEntries('notifications'),
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
      controller.performDeleteStorageAllFeatureEntries('notifications'),
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
  it('returns void if UserStorage is not enabled', async () => {
    const arrangeMocks = async () => {
      return {
        messengerMocks: mockUserStorageMessenger(),
        mockAPI: mockEndpointGetUserStorage(),
      };
    };

    const { messengerMocks } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      env: {
        isAccountSyncingEnabled: true,
      },
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
      },
    });

    await controller.syncInternalAccountsWithUserStorage();

    expect(messengerMocks.mockAccountsListAccounts).not.toHaveBeenCalled();
  });

  it('returns void if account syncing feature flag is disabled', async () => {
    const arrangeMocks = async () => {
      return {
        messengerMocks: mockUserStorageMessenger(),
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries('accounts'),
        },
      };
    };

    const { messengerMocks, mockAPI } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      env: {
        isAccountSyncingEnabled: false,
      },
    });

    await controller.syncInternalAccountsWithUserStorage();
    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(false);
  });

  it('throws if AccountsController:listAccounts fails or returns an empty list', async () => {
    const mockUserStorageAccountsResponse = async () => {
      return {
        status: 200,
        body: await createMockUserStorageEntries(
          MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL,
        ),
      };
    };

    const arrangeMocksForAccounts = async () => {
      return {
        messengerMocks: mockUserStorageMessenger({
          accounts: {
            accountsList: [],
          },
        }),
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries(
              'accounts',
              await mockUserStorageAccountsResponse(),
            ),
        },
      };
    };

    const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      env: {
        isAccountSyncingEnabled: true,
      },
      getMetaMetricsState: () => true,
    });

    await expect(
      controller.syncInternalAccountsWithUserStorage(),
    ).rejects.toThrow(expect.any(Error));

    mockAPI.mockEndpointGetUserStorage.done();
  });

  it('uploads accounts list to user storage if user storage is empty', async () => {
    const mockUserStorageAccountsResponse = {
      status: 404,
      body: [],
    };

    const arrangeMocks = async () => {
      return {
        messengerMocks: mockUserStorageMessenger({
          accounts: {
            accountsList: MOCK_INTERNAL_ACCOUNTS.ALL.slice(
              0,
              2,
            ) as InternalAccount[],
          },
        }),
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries(
              'accounts',
              mockUserStorageAccountsResponse,
            ),
          mockEndpointBatchUpsertUserStorage:
            mockEndpointBatchUpsertUserStorage(
              'accounts',
              undefined,
              async (_uri, requestBody) => {
                const decryptedBody = await decryptBatchUpsertBody(
                  requestBody,
                  MOCK_STORAGE_KEY,
                );

                const expectedBody = createExpectedAccountSyncBatchUpsertBody(
                  MOCK_INTERNAL_ACCOUNTS.ALL.slice(0, 2).map((account) => [
                    account.address,
                    account as InternalAccount,
                  ]),
                  MOCK_STORAGE_KEY,
                );

                expect(decryptedBody).toStrictEqual(expectedBody);
              },
            ),
        },
      };
    };

    const { messengerMocks, mockAPI } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      env: {
        isAccountSyncingEnabled: true,
      },
      getMetaMetricsState: () => true,
    });

    await controller.syncInternalAccountsWithUserStorage();
    mockAPI.mockEndpointGetUserStorage.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);
    expect(mockAPI.mockEndpointBatchUpsertUserStorage.isDone()).toBe(true);
  });

  it('creates internal accounts if user storage has more accounts', async () => {
    const mockUserStorageAccountsResponse = async () => {
      return {
        status: 200,
        body: await createMockUserStorageEntries(
          MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL,
        ),
      };
    };

    const arrangeMocksForAccounts = async () => {
      return {
        messengerMocks: mockUserStorageMessenger({
          accounts: {
            accountsList: MOCK_INTERNAL_ACCOUNTS.ONE as InternalAccount[],
          },
        }),
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries(
              'accounts',
              await mockUserStorageAccountsResponse(),
            ),
        },
      };
    };

    const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      env: {
        isAccountSyncingEnabled: true,
      },
      getMetaMetricsState: () => true,
    });

    await controller.syncInternalAccountsWithUserStorage();

    mockAPI.mockEndpointGetUserStorage.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);

    expect(messengerMocks.mockKeyringAddNewAccount).toHaveBeenCalledTimes(
      MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL.length -
        MOCK_INTERNAL_ACCOUNTS.ONE.length,
    );
  });

  it('fires the onAccountAdded callback when adding an account', async () => {
    const mockUserStorageAccountsResponse = async () => {
      return {
        status: 200,
        body: await createMockUserStorageEntries(
          MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL,
        ),
      };
    };

    const arrangeMocksForAccounts = async () => {
      return {
        messengerMocks: mockUserStorageMessenger({
          accounts: {
            accountsList: MOCK_INTERNAL_ACCOUNTS.ONE as InternalAccount[],
          },
        }),
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries(
              'accounts',
              await mockUserStorageAccountsResponse(),
            ),
        },
      };
    };

    const onAccountAdded = jest.fn();

    const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      config: {
        accountSyncing: {
          onAccountAdded,
        },
      },
      env: {
        isAccountSyncingEnabled: true,
      },
      getMetaMetricsState: () => true,
    });

    await controller.syncInternalAccountsWithUserStorage();

    mockAPI.mockEndpointGetUserStorage.done();

    expect(onAccountAdded).toHaveBeenCalledTimes(
      MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL.length -
        MOCK_INTERNAL_ACCOUNTS.ONE.length,
    );
  });

  it('does not create internal accounts if user storage has less accounts', async () => {
    const mockUserStorageAccountsResponse = async () => {
      return {
        status: 200,
        body: await createMockUserStorageEntries(
          MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL.slice(0, 1),
        ),
      };
    };

    const arrangeMocksForAccounts = async () => {
      return {
        messengerMocks: mockUserStorageMessenger({
          accounts: {
            accountsList: MOCK_INTERNAL_ACCOUNTS.ALL.slice(
              0,
              2,
            ) as InternalAccount[],
          },
        }),
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries(
              'accounts',
              await mockUserStorageAccountsResponse(),
            ),
          mockEndpointBatchUpsertUserStorage:
            mockEndpointBatchUpsertUserStorage('accounts'),
        },
      };
    };

    const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      env: {
        isAccountSyncingEnabled: true,
      },
      getMetaMetricsState: () => true,
    });

    await controller.syncInternalAccountsWithUserStorage();

    mockAPI.mockEndpointGetUserStorage.done();
    mockAPI.mockEndpointBatchUpsertUserStorage.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);
    expect(mockAPI.mockEndpointBatchUpsertUserStorage.isDone()).toBe(true);

    expect(messengerMocks.mockKeyringAddNewAccount).not.toHaveBeenCalled();
  });

  describe('User storage name is a default name', () => {
    const mockUserStorageAccountsResponse = async () => {
      return {
        status: 200,
        body: await createMockUserStorageEntries(
          MOCK_USER_STORAGE_ACCOUNTS.ONE_DEFAULT_NAME,
        ),
      };
    };

    it('does not update the internal account name if both user storage and internal accounts have default names', async () => {
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessenger({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                'accounts',
                await mockUserStorageAccountsResponse(),
              ),
          },
        };
      };

      const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      await controller.syncInternalAccountsWithUserStorage();

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('does not update the internal account name if the internal account name is custom without last updated', async () => {
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessenger({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                'accounts',
                await mockUserStorageAccountsResponse(),
              ),
            mockEndpointBatchUpsertUserStorage:
              mockEndpointBatchUpsertUserStorage('accounts'),
          },
        };
      };

      const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      await controller.syncInternalAccountsWithUserStorage();

      mockAPI.mockEndpointGetUserStorage.done();
      mockAPI.mockEndpointBatchUpsertUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('does not update the internal account name if the internal account name is custom with last updated', async () => {
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessenger({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                'accounts',
                await mockUserStorageAccountsResponse(),
              ),
            mockEndpointBatchUpsertUserStorage:
              mockEndpointBatchUpsertUserStorage('accounts'),
          },
        };
      };

      const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      await controller.syncInternalAccountsWithUserStorage();

      mockAPI.mockEndpointGetUserStorage.done();
      mockAPI.mockEndpointBatchUpsertUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });
  });

  describe('User storage name is a custom name without last updated', () => {
    const mockUserStorageAccountsResponse = async () => {
      return {
        status: 200,
        body: await createMockUserStorageEntries(
          MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED,
        ),
      };
    };

    it('updates the internal account name if the internal account name is a default name', async () => {
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessenger({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                'accounts',
                await mockUserStorageAccountsResponse(),
              ),
          },
        };
      };

      const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      await controller.syncInternalAccountsWithUserStorage();

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).toHaveBeenCalledWith([
        MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED[0].i,
        {
          name: MOCK_USER_STORAGE_ACCOUNTS
            .ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED[0].n,
        },
      ]);
    });

    it('does not update internal account name if both user storage and internal accounts have custom names without last updated', async () => {
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessenger({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                'accounts',
                await mockUserStorageAccountsResponse(),
              ),
          },
        };
      };

      const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      await controller.syncInternalAccountsWithUserStorage();

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('does not update the internal account name if the internal account name is custom with last updated', async () => {
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessenger({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                'accounts',
                await mockUserStorageAccountsResponse(),
              ),
            mockEndpointBatchUpsertUserStorage:
              mockEndpointBatchUpsertUserStorage('accounts'),
          },
        };
      };

      const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      await controller.syncInternalAccountsWithUserStorage();

      mockAPI.mockEndpointGetUserStorage.done();
      mockAPI.mockEndpointBatchUpsertUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('fires the onAccountNameUpdated callback when renaming an internal account', async () => {
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessenger({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                'accounts',
                await mockUserStorageAccountsResponse(),
              ),
          },
        };
      };

      const onAccountNameUpdated = jest.fn();

      const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        config: {
          accountSyncing: {
            onAccountNameUpdated,
          },
        },
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      await controller.syncInternalAccountsWithUserStorage();

      mockAPI.mockEndpointGetUserStorage.done();

      expect(onAccountNameUpdated).toHaveBeenCalledTimes(1);
    });
  });

  describe('User storage name is a custom name with last updated', () => {
    const mockUserStorageAccountsResponse = async () => {
      return {
        status: 200,
        body: await createMockUserStorageEntries(
          MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED,
        ),
      };
    };

    it('updates the internal account name if the internal account name is a default name', async () => {
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessenger({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                'accounts',
                await mockUserStorageAccountsResponse(),
              ),
          },
        };
      };

      const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      await controller.syncInternalAccountsWithUserStorage();

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).toHaveBeenCalledWith([
        MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0].i,
        {
          name: MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0]
            .n,
        },
      ]);
    });

    it('updates the internal account name and last updated if the internal account name is a custom name without last updated', async () => {
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessenger({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                'accounts',
                await mockUserStorageAccountsResponse(),
              ),
          },
        };
      };

      const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      await controller.syncInternalAccountsWithUserStorage();

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).toHaveBeenCalledWith([
        MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0].i,
        {
          name: MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0]
            .n,
          nameLastUpdatedAt:
            MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0].nlu,
        },
      ]);
    });

    it('updates the internal account name and last updated if the user storage account is more recent', async () => {
      const arrangeMocksForAccounts = async () => {
        const mockGetEntriesResponse = await mockUserStorageAccountsResponse();
        return {
          messengerMocks: mockUserStorageMessenger({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                'accounts',
                mockGetEntriesResponse,
              ),
          },
        };
      };

      const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      await controller.syncInternalAccountsWithUserStorage();

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).toHaveBeenCalledWith([
        MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0].i,
        {
          name: MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0]
            .n,
          nameLastUpdatedAt:
            MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0].nlu,
        },
      ]);
    });

    it('does not update the internal account if the user storage account is less recent', async () => {
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessenger({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED_MOST_RECENT as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                'accounts',
                await mockUserStorageAccountsResponse(),
              ),
            mockEndpointBatchUpsertUserStorage:
              mockEndpointBatchUpsertUserStorage('accounts'),
          },
        };
      };

      const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      await controller.syncInternalAccountsWithUserStorage();

      mockAPI.mockEndpointGetUserStorage.done();
      mockAPI.mockEndpointBatchUpsertUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });
  });
});

describe('user-storage/user-storage-controller - saveInternalAccountToUserStorage() tests', () => {
  it('returns void if UserStorage is not enabled', async () => {
    const arrangeMocks = async () => {
      return {
        messengerMocks: mockUserStorageMessenger(),
      };
    };

    const mapInternalAccountToUserStorageAccountMock = jest.spyOn(
      AccountsUserStorageModule,
      'mapInternalAccountToUserStorageAccount',
    );

    const { messengerMocks } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      env: {
        isAccountSyncingEnabled: true,
      },
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
      },
    });

    await controller.saveInternalAccountToUserStorage(
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
    );

    expect(mapInternalAccountToUserStorageAccountMock).not.toHaveBeenCalled();
  });

  it('returns void if account syncing feature flag is disabled', async () => {
    const arrangeMocks = async () => {
      return {
        messengerMocks: mockUserStorageMessenger(),
        mockAPI: mockEndpointUpsertUserStorage(
          `accounts.${MOCK_INTERNAL_ACCOUNTS.ONE[0].address}`,
        ),
      };
    };

    const { messengerMocks, mockAPI } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      env: {
        isAccountSyncingEnabled: false,
      },
      getMetaMetricsState: () => true,
    });

    await controller.saveInternalAccountToUserStorage(
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
    );

    expect(mockAPI.isDone()).toBe(false);
  });

  it('saves an internal account to user storage', async () => {
    const arrangeMocks = async () => {
      return {
        messengerMocks: mockUserStorageMessenger(),
        mockAPI: mockEndpointUpsertUserStorage(
          `accounts.${MOCK_INTERNAL_ACCOUNTS.ONE[0].address}`,
        ),
      };
    };

    const { messengerMocks, mockAPI } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      env: {
        isAccountSyncingEnabled: true,
      },
      getMetaMetricsState: () => true,
    });

    await controller.saveInternalAccountToUserStorage(
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
    );

    expect(mockAPI.isDone()).toBe(true);
  });

  it('rejects if api call fails', async () => {
    const arrangeMocks = async () => {
      return {
        messengerMocks: mockUserStorageMessenger(),
        mockAPI: mockEndpointUpsertUserStorage(
          `accounts.${MOCK_INTERNAL_ACCOUNTS.ONE[0].address}`,
          { status: 500 },
        ),
      };
    };

    const { messengerMocks } = await arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      env: {
        isAccountSyncingEnabled: true,
      },
      getMetaMetricsState: () => true,
    });

    await expect(
      controller.saveInternalAccountToUserStorage(
        MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
      ),
    ).rejects.toThrow(expect.any(Error));
  });

  it('saves an internal account to user storage when the AccountsController:accountRenamed event is fired', async () => {
    const { baseMessenger, messenger } = mockUserStorageMessenger();

    const controller = new UserStorageController({
      messenger,
      env: {
        isAccountSyncingEnabled: true,
      },
      getMetaMetricsState: () => true,
    });

    const mockSaveInternalAccountToUserStorage = jest
      .spyOn(controller, 'saveInternalAccountToUserStorage')
      .mockImplementation();

    baseMessenger.publish(
      'AccountsController:accountRenamed',
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
    );

    expect(mockSaveInternalAccountToUserStorage).toHaveBeenCalledWith(
      MOCK_INTERNAL_ACCOUNTS.ONE[0],
    );
  });

  it('saves an internal account to user storage when the AccountsController:accountAdded event is fired', async () => {
    const { baseMessenger, messenger } = mockUserStorageMessenger();

    const controller = new UserStorageController({
      messenger,
      env: {
        isAccountSyncingEnabled: true,
      },
      getMetaMetricsState: () => true,
    });

    const mockSaveInternalAccountToUserStorage = jest
      .spyOn(controller, 'saveInternalAccountToUserStorage')
      .mockImplementation();

    baseMessenger.publish(
      'AccountsController:accountAdded',
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
    );

    expect(mockSaveInternalAccountToUserStorage).toHaveBeenCalledWith(
      MOCK_INTERNAL_ACCOUNTS.ONE[0],
    );
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
  accounts?: {
    accountsList?: InternalAccount[];
  };
}) {
  const baseMessenger = new ControllerMessenger<
    AllowedActions,
    AllowedEvents
  >();

  const messenger = baseMessenger.getRestricted({
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
      'AccountsController:updateAccountMetadata',
      'KeyringController:addNewAccount',
    ],
    allowedEvents: [
      'KeyringController:lock',
      'KeyringController:unlock',
      'AccountsController:accountAdded',
      'AccountsController:accountRenamed',
    ],
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

  const mockKeyringAddNewAccount = jest.fn(() => {
    baseMessenger.publish(
      'AccountsController:accountAdded',
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
    );
    return MOCK_INTERNAL_ACCOUNTS.ONE[0].address;
  });

  const mockAccountsListAccounts = jest
    .fn()
    .mockResolvedValue(
      options?.accounts?.accountsList ?? MOCK_INTERNAL_ACCOUNTS.ALL,
    );

  const mockAccountsUpdateAccountMetadata = jest.fn().mockResolvedValue(true);

  jest.spyOn(messenger, 'call').mockImplementation((...args) => {
    // Creates the correct typed call params for mocks
    type CallParams = {
      [K in AllowedActions['type']]: [
        K,
        ...Parameters<Extract<AllowedActions, { type: K }>['handler']>,
      ];
    }[AllowedActions['type']];

    const [actionType, params] = args as unknown as CallParams;

    if (actionType === 'SnapController:handleRequest') {
      if (params.request.method === 'getPublicKey') {
        return mockSnapGetPublicKey();
      }

      if (params.request.method === 'signMessage') {
        return mockSnapSignMessage();
      }

      throw new Error(
        `MOCK_FAIL - unsupported SnapController:handleRequest call: ${
          params.request.method as string
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
      return mockAccountsListAccounts();
    }

    if (actionType === 'AccountsController:updateAccountMetadata') {
      return mockAccountsUpdateAccountMetadata(args.slice(1));
    }

    throw new Error(
      `MOCK_FAIL - unsupported messenger call: ${actionType as string}`,
    );
  });

  return {
    baseMessenger,
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
    mockAccountsUpdateAccountMetadata,
    mockAccountsListAccounts,
  };
}

/**
 * Test Utility - creates a realistic mock user-storage entry
 * @param data - data to encrypt
 * @returns user storage entry
 */
async function createMockUserStorageEntry(
  data: unknown,
): Promise<GetUserStorageResponse> {
  return {
    HashedKey: 'HASHED_KEY',
    Data: await encryption.encryptString(
      JSON.stringify(data),
      MOCK_STORAGE_KEY,
    ),
  };
}

/**
 * Test Utility - creates a realistic mock user-storage get-all entry
 * @param data - data array to encrypt
 * @returns user storage entry
 */
async function createMockUserStorageEntries(
  data: unknown[],
): Promise<GetUserStorageAllFeatureEntriesResponse> {
  return await Promise.all(data.map((d) => createMockUserStorageEntry(d)));
}

/**
 * Test Utility - decrypts a realistic batch upsert payload
 * @param requestBody - nock body
 * @param storageKey - storage key
 * @returns decrypted body
 */
async function decryptBatchUpsertBody(
  requestBody: nock.Body,
  storageKey: string,
) {
  if (typeof requestBody === 'string') {
    return requestBody;
  }
  return await Promise.all(
    Object.entries<string>(requestBody.data).map(
      async ([entryKey, entryValue]) => {
        return [
          entryKey,
          await encryption.decryptString(entryValue, storageKey),
        ];
      },
    ),
  );
}

/**
 * Test Utility - creates a realistic expected batch upsert payload
 * @param data - data supposed to be upserted
 * @param storageKey - storage key
 * @returns expected body
 */
function createExpectedAccountSyncBatchUpsertBody(
  data: [string, InternalAccount][],
  storageKey: string,
) {
  return data.map(([entryKey, entryValue]) => [
    createSHA256Hash(String(entryKey) + storageKey),
    JSON.stringify(
      AccountsUserStorageModule.mapInternalAccountToUserStorageAccount(
        entryValue,
      ),
    ),
  ]);
}
