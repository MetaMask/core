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
  MOCK_INTERNAL_ACCOUNTS,
  MOCK_USER_STORAGE_ACCOUNTS,
} from './__fixtures__/mockAccounts';
import {
  mockEndpointGetUserStorage,
  mockEndpointGetUserStorageAllFeatureEntries,
  mockEndpointUpsertUserStorage,
} from './__fixtures__/mockServices';
import {
  MOCK_STORAGE_DATA,
  MOCK_STORAGE_KEY,
  MOCK_STORAGE_KEY_SIGNATURE,
} from './__fixtures__/mockStorage';
import encryption from './encryption/encryption';
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
      'notifications.notificationSettings',
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
      const { messengerMocks } = await arrangeMocks();
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
  it('rejects if UserStorage is not enabled', async () => {
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

    await expect(
      controller.syncInternalAccountsWithUserStorage(),
    ).rejects.toThrow(expect.any(Error));
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
          mockEndpointUpsertUserStorageAccount1: mockEndpointUpsertUserStorage(
            `accounts.${MOCK_INTERNAL_ACCOUNTS.ALL[0].address}`,
          ),
          mockEndpointUpsertUserStorageAccount2: mockEndpointUpsertUserStorage(
            `accounts.${MOCK_INTERNAL_ACCOUNTS.ALL[1].address}`,
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
    mockAPI.mockEndpointUpsertUserStorageAccount1.done();
    mockAPI.mockEndpointUpsertUserStorageAccount2.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);
    expect(mockAPI.mockEndpointUpsertUserStorageAccount1.isDone()).toBe(true);
    expect(mockAPI.mockEndpointUpsertUserStorageAccount2.isDone()).toBe(true);
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

          mockEndpointUpsertUserStorageAccount2: mockEndpointUpsertUserStorage(
            `accounts.${MOCK_INTERNAL_ACCOUNTS.ALL[1].address}`,
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
    mockAPI.mockEndpointUpsertUserStorageAccount2.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);

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
            mockEndpointUpsertUserStorage: mockEndpointUpsertUserStorage(
              `accounts.${MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED[0].address}`,
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
      mockAPI.mockEndpointUpsertUserStorage.done();

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
            mockEndpointUpsertUserStorage: mockEndpointUpsertUserStorage(
              `accounts.${MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0].address}`,
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
      mockAPI.mockEndpointUpsertUserStorage.done();

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
            mockEndpointUpsertUserStorage: mockEndpointUpsertUserStorage(
              `accounts.${MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0].address}`,
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
      mockAPI.mockEndpointUpsertUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
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
            mockEndpointUpsertUserStorage: mockEndpointUpsertUserStorage(
              `accounts.${MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED_MOST_RECENT[0].address}`,
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
      mockAPI.mockEndpointUpsertUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });
  });
});

describe('user-storage/user-storage-controller - saveInternalAccountToUserStorage() tests', () => {
  it('rejects if UserStorage is not enabled', async () => {
    const arrangeMocks = async () => {
      return {
        messengerMocks: mockUserStorageMessenger(),
      };
    };

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

    await expect(
      controller.saveInternalAccountToUserStorage(
        MOCK_INTERNAL_ACCOUNTS.ONE[0].address,
      ),
    ).rejects.toThrow(expect.any(Error));
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
      MOCK_INTERNAL_ACCOUNTS.ONE[0].address,
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
      MOCK_INTERNAL_ACCOUNTS.ONE[0].address,
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
        MOCK_INTERNAL_ACCOUNTS.ONE[0].address,
      ),
    ).rejects.toThrow(expect.any(Error));
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
      'AccountsController:updateAccountMetadata',
      'AccountsController:getAccountByAddress',
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

  const mockAccountsUpdateAccountMetadata = jest.fn().mockResolvedValue(true);

  const mockAccountsGetAccountByAddress = jest.fn().mockResolvedValue({
    address: '0x123',
    id: '1',
    metadata: {
      name: 'test',
      nameLastUpdatedAt: 1,
    },
  });

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
      if (options?.accounts?.accountsList) {
        return options.accounts.accountsList;
      }
      return MOCK_INTERNAL_ACCOUNTS.ALL;
    }

    if (actionType === 'AccountsController:updateAccountMetadata') {
      return mockAccountsUpdateAccountMetadata(args.slice(1));
    }

    if (actionType === 'AccountsController:getAccountByAddress') {
      return mockAccountsGetAccountByAddress();
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
    mockAccountsUpdateAccountMetadata,
    mockAccountsGetAccountByAddress,
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
