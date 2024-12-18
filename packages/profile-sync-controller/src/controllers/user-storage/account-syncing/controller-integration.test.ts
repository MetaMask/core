import type { InternalAccount } from '@metamask/keyring-internal-api';

import UserStorageController, { USER_STORAGE_FEATURE_NAMES } from '..';
import { MOCK_STORAGE_KEY } from '../__fixtures__';
import {
  mockEndpointBatchDeleteUserStorage,
  mockEndpointBatchUpsertUserStorage,
  mockEndpointGetUserStorage,
  mockEndpointGetUserStorageAllFeatureEntries,
  mockEndpointUpsertUserStorage,
} from '../__fixtures__/mockServices';
import {
  createMockUserStorageEntries,
  decryptBatchUpsertBody,
} from '../__fixtures__/test-utils';
import {
  MOCK_INTERNAL_ACCOUNTS,
  MOCK_USER_STORAGE_ACCOUNTS,
} from './__fixtures__/mockAccounts';
import {
  createExpectedAccountSyncBatchDeleteBody,
  createExpectedAccountSyncBatchUpsertBody,
  mockUserStorageMessengerForAccountSyncing,
} from './__fixtures__/test-utils';
import * as AccountSyncingControllerIntegrationModule from './controller-integration';
import * as AccountSyncingUtils from './sync-utils';
import * as AccountsUserStorageModule from './utils';

// By default, everything is disabled
const baseState = {
  isProfileSyncingEnabled: false,
  isProfileSyncingUpdateLoading: false,
  hasAccountSyncingSyncedAtLeastOnce: false,
  isAccountSyncingReadyToBeDispatched: false,
  isAccountSyncingInProgress: false,
};

const arrangeMocks = async ({
  isAccountSyncingEnabled = false,
  stateOverrides = baseState as Partial<typeof baseState>,
  messengerMockOptions = undefined as Parameters<
    typeof mockUserStorageMessengerForAccountSyncing
  >[0],
}) => {
  const messengerMocks =
    mockUserStorageMessengerForAccountSyncing(messengerMockOptions);
  const controller = new UserStorageController({
    messenger: messengerMocks.messenger,
    env: {
      isAccountSyncingEnabled,
    },
    getMetaMetricsState: () => true,
    state: {
      ...baseState,
      ...stateOverrides,
    },
  });

  const config = {
    isAccountSyncingEnabled,
  };

  const options = {
    getMessenger: () => messengerMocks.messenger,
    getUserStorageControllerInstance: () => controller,
  };

  return {
    messengerMocks,
    controller,
    config,
    options,
  };
};

describe('user-storage/account-syncing/controller-integration - saveInternalAccountsListToUserStorage() tests', () => {
  it('returns void if account syncing is not enabled', async () => {
    const { controller, config, options } = await arrangeMocks({
      isAccountSyncingEnabled: false,
    });

    const mockPerformBatchSetStorage = jest
      .spyOn(controller, 'performBatchSetStorage')
      .mockImplementation(() => Promise.resolve());

    await AccountSyncingControllerIntegrationModule.saveInternalAccountsListToUserStorage(
      config,
      options,
    );

    expect(mockPerformBatchSetStorage).not.toHaveBeenCalled();
  });

  it('returns void if account syncing is enabled but the internal accounts list is empty', async () => {
    const { controller, config, options } = await arrangeMocks({
      isAccountSyncingEnabled: true,
    });

    const mockPerformBatchSetStorage = jest
      .spyOn(controller, 'performBatchSetStorage')
      .mockImplementation(() => Promise.resolve());

    jest
      .spyOn(AccountSyncingUtils, 'getInternalAccountsList')
      .mockResolvedValue([]);

    await AccountSyncingControllerIntegrationModule.saveInternalAccountsListToUserStorage(
      config,
      options,
    );

    expect(mockPerformBatchSetStorage).not.toHaveBeenCalled();
  });
});

describe('user-storage/account-syncing/controller-integration - syncInternalAccountsWithUserStorage() tests', () => {
  it('returns void if UserStorage is not enabled', async () => {
    const { config, controller, messengerMocks, options } = await arrangeMocks(
      {},
    );

    await mockEndpointGetUserStorage();

    await controller.setIsAccountSyncingReadyToBeDispatched(true);

    await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
      config,
      options,
    );

    expect(messengerMocks.mockAccountsListAccounts).not.toHaveBeenCalled();
  });

  it('returns void if account syncing feature flag is disabled', async () => {
    const { config, options } = await arrangeMocks({
      isAccountSyncingEnabled: false,
    });

    const mockAPI = {
      mockEndpointGetUserStorage:
        await mockEndpointGetUserStorageAllFeatureEntries(
          USER_STORAGE_FEATURE_NAMES.accounts,
        ),
    };

    await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
      config,
      options,
    );
    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(false);
  });

  it('throws if AccountsController:listAccounts fails or returns an empty list', async () => {
    const { config, options } = await arrangeMocks({
      isAccountSyncingEnabled: true,
      stateOverrides: {
        isProfileSyncingEnabled: true,
      },
      messengerMockOptions: {
        accounts: {
          accountsList: [],
        },
      },
    });

    const mockAPI = {
      mockEndpointGetUserStorage:
        await mockEndpointGetUserStorageAllFeatureEntries(
          USER_STORAGE_FEATURE_NAMES.accounts,
          {
            status: 200,
            body: await createMockUserStorageEntries(
              MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL,
            ),
          },
        ),
    };

    await expect(
      AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        config,
        options,
      ),
    ).rejects.toThrow(expect.any(Error));

    mockAPI.mockEndpointGetUserStorage.done();
  });

  it('uploads accounts list to user storage if user storage is empty', async () => {
    const { config, options } = await arrangeMocks({
      isAccountSyncingEnabled: true,
      stateOverrides: {
        isProfileSyncingEnabled: true,
      },
      messengerMockOptions: {
        accounts: {
          accountsList: MOCK_INTERNAL_ACCOUNTS.ALL.slice(
            0,
            2,
          ) as InternalAccount[],
        },
      },
    });

    const mockAPI = {
      mockEndpointGetUserStorage:
        await mockEndpointGetUserStorageAllFeatureEntries(
          USER_STORAGE_FEATURE_NAMES.accounts,
          {
            status: 404,
            body: [],
          },
        ),
      mockEndpointBatchUpsertUserStorage: mockEndpointBatchUpsertUserStorage(
        USER_STORAGE_FEATURE_NAMES.accounts,
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
    };

    await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
      config,
      options,
    );
    mockAPI.mockEndpointGetUserStorage.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);
    expect(mockAPI.mockEndpointBatchUpsertUserStorage.isDone()).toBe(true);
  });

  it('creates internal accounts if user storage has more accounts. it also updates hasAccountSyncingSyncedAtLeastOnce accordingly', async () => {
    const { messengerMocks, controller, config, options } = await arrangeMocks({
      isAccountSyncingEnabled: true,
      stateOverrides: {
        isProfileSyncingEnabled: true,
      },
      messengerMockOptions: {
        accounts: {
          accountsList: MOCK_INTERNAL_ACCOUNTS.ONE as InternalAccount[],
        },
      },
    });

    const mockAPI = {
      mockEndpointGetUserStorage:
        await mockEndpointGetUserStorageAllFeatureEntries(
          USER_STORAGE_FEATURE_NAMES.accounts,
          {
            status: 200,
            body: await createMockUserStorageEntries(
              MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL,
            ),
          },
        ),
      mockEndpointBatchDeleteUserStorage: mockEndpointBatchDeleteUserStorage(
        USER_STORAGE_FEATURE_NAMES.accounts,
        undefined,
        async (_uri, requestBody) => {
          if (typeof requestBody === 'string') {
            return;
          }

          const expectedBody = createExpectedAccountSyncBatchDeleteBody(
            MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL.filter(
              (account) =>
                !MOCK_INTERNAL_ACCOUNTS.ONE.find(
                  (internalAccount) => internalAccount.address === account.a,
                ),
            ).map((account) => account.a),
            MOCK_STORAGE_KEY,
          );

          expect(requestBody.batch_delete).toStrictEqual(expectedBody);
        },
      ),
    };

    await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
      config,
      options,
    );

    mockAPI.mockEndpointGetUserStorage.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);

    expect(messengerMocks.mockKeyringAddNewAccount).toHaveBeenCalledTimes(
      MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL.length -
        MOCK_INTERNAL_ACCOUNTS.ONE.length,
    );

    expect(mockAPI.mockEndpointBatchDeleteUserStorage.isDone()).toBe(true);

    expect(controller.state.hasAccountSyncingSyncedAtLeastOnce).toBe(true);
  });

  describe('handles corrupted user storage gracefully', () => {
    const arrangeMocksForBogusAccounts = async () => {
      const { messengerMocks, config, options } = await arrangeMocks({
        isAccountSyncingEnabled: true,
        stateOverrides: {
          isProfileSyncingEnabled: true,
        },
        messengerMockOptions: {
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
          },
        },
      });

      return {
        config,
        options,
        messengerMocks,
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries(
              USER_STORAGE_FEATURE_NAMES.accounts,
              {
                status: 200,
                body: await createMockUserStorageEntries(
                  MOCK_USER_STORAGE_ACCOUNTS.TWO_DEFAULT_NAMES_WITH_ONE_BOGUS,
                ),
              },
            ),
          mockEndpointBatchDeleteUserStorage:
            mockEndpointBatchDeleteUserStorage(
              USER_STORAGE_FEATURE_NAMES.accounts,
              undefined,
              async (_uri, requestBody) => {
                if (typeof requestBody === 'string') {
                  return;
                }

                const expectedBody = createExpectedAccountSyncBatchDeleteBody(
                  [
                    MOCK_USER_STORAGE_ACCOUNTS
                      .TWO_DEFAULT_NAMES_WITH_ONE_BOGUS[1].a,
                  ],
                  MOCK_STORAGE_KEY,
                );

                expect(requestBody.batch_delete).toStrictEqual(expectedBody);
              },
            ),
          mockEndpointBatchUpsertUserStorage:
            mockEndpointBatchUpsertUserStorage(
              USER_STORAGE_FEATURE_NAMES.accounts,
            ),
        },
      };
    };

    it('does not save the bogus account to user storage, and deletes it from user storage', async () => {
      const { config, options, mockAPI } = await arrangeMocksForBogusAccounts();

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        config,
        options,
      );

      expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);
      expect(mockAPI.mockEndpointBatchUpsertUserStorage.isDone()).toBe(false);
      expect(mockAPI.mockEndpointBatchDeleteUserStorage.isDone()).toBe(true);
    });

    it('fires the onAccountSyncErroneousSituation callback in erroneous situations', async () => {
      const onAccountSyncErroneousSituation = jest.fn();

      const { config, options } = await arrangeMocksForBogusAccounts();

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          ...config,
          onAccountSyncErroneousSituation,
        },
        options,
      );

      expect(onAccountSyncErroneousSituation).toHaveBeenCalledTimes(1);
    });
  });

  it('fires the onAccountAdded callback when adding an account', async () => {
    const { config, options } = await arrangeMocks({
      isAccountSyncingEnabled: true,
      stateOverrides: {
        isProfileSyncingEnabled: true,
      },
      messengerMockOptions: {
        accounts: {
          accountsList: MOCK_INTERNAL_ACCOUNTS.ONE as InternalAccount[],
        },
      },
    });

    const mockAPI = {
      mockEndpointGetUserStorage:
        await mockEndpointGetUserStorageAllFeatureEntries(
          USER_STORAGE_FEATURE_NAMES.accounts,
          {
            status: 200,
            body: await createMockUserStorageEntries(
              MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL,
            ),
          },
        ),
      mockEndpointBatchDeleteUserStorage: mockEndpointBatchDeleteUserStorage(
        USER_STORAGE_FEATURE_NAMES.accounts,
        undefined,
        async (_uri, requestBody) => {
          if (typeof requestBody === 'string') {
            return;
          }

          const expectedBody = createExpectedAccountSyncBatchDeleteBody(
            MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL.filter(
              (account) =>
                !MOCK_INTERNAL_ACCOUNTS.ONE.find(
                  (internalAccount) => internalAccount.address === account.a,
                ),
            ).map((account) => account.a),
            MOCK_STORAGE_KEY,
          );

          expect(requestBody.batch_delete).toStrictEqual(expectedBody);
        },
      ),
    };

    const onAccountAdded = jest.fn();

    await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
      {
        ...config,
        onAccountAdded,
      },
      options,
    );

    mockAPI.mockEndpointGetUserStorage.done();

    expect(onAccountAdded).toHaveBeenCalledTimes(
      MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL.length -
        MOCK_INTERNAL_ACCOUNTS.ONE.length,
    );

    expect(mockAPI.mockEndpointBatchDeleteUserStorage.isDone()).toBe(true);
  });

  it('does not create internal accounts if user storage has less accounts', async () => {
    const { messengerMocks, config, options } = await arrangeMocks({
      isAccountSyncingEnabled: true,
      stateOverrides: {
        isProfileSyncingEnabled: true,
      },
      messengerMockOptions: {
        accounts: {
          accountsList: MOCK_INTERNAL_ACCOUNTS.ALL.slice(
            0,
            2,
          ) as InternalAccount[],
        },
      },
    });

    const mockAPI = {
      mockEndpointGetUserStorage:
        await mockEndpointGetUserStorageAllFeatureEntries(
          USER_STORAGE_FEATURE_NAMES.accounts,
          {
            status: 200,
            body: await createMockUserStorageEntries(
              MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL.slice(0, 1),
            ),
          },
        ),
      mockEndpointBatchUpsertUserStorage: mockEndpointBatchUpsertUserStorage(
        USER_STORAGE_FEATURE_NAMES.accounts,
      ),
    };

    await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
      config,
      options,
    );

    mockAPI.mockEndpointGetUserStorage.done();
    mockAPI.mockEndpointBatchUpsertUserStorage.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);
    expect(mockAPI.mockEndpointBatchUpsertUserStorage.isDone()).toBe(true);

    expect(messengerMocks.mockKeyringAddNewAccount).not.toHaveBeenCalled();
  });

  describe('User storage name is a default name', () => {
    it('does not update the internal account name if both user storage and internal accounts have default names', async () => {
      const { messengerMocks, config, options } = await arrangeMocks({
        isAccountSyncingEnabled: true,
        stateOverrides: {
          isProfileSyncingEnabled: true,
        },
        messengerMockOptions: {
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
          },
        },
      });

      const mockAPI = {
        mockEndpointGetUserStorage:
          await mockEndpointGetUserStorageAllFeatureEntries(
            USER_STORAGE_FEATURE_NAMES.accounts,
            {
              status: 200,
              body: await createMockUserStorageEntries(
                MOCK_USER_STORAGE_ACCOUNTS.ONE_DEFAULT_NAME,
              ),
            },
          ),
      };

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        config,
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('does not update the internal account name if the internal account name is custom without last updated', async () => {
      const { messengerMocks, config, options } = await arrangeMocks({
        isAccountSyncingEnabled: true,
        stateOverrides: {
          isProfileSyncingEnabled: true,
        },
        messengerMockOptions: {
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED as InternalAccount[],
          },
        },
      });

      const mockAPI = {
        mockEndpointGetUserStorage:
          await mockEndpointGetUserStorageAllFeatureEntries(
            USER_STORAGE_FEATURE_NAMES.accounts,
            {
              status: 200,
              body: await createMockUserStorageEntries(
                MOCK_USER_STORAGE_ACCOUNTS.ONE_DEFAULT_NAME,
              ),
            },
          ),
        mockEndpointBatchUpsertUserStorage: mockEndpointBatchUpsertUserStorage(
          USER_STORAGE_FEATURE_NAMES.accounts,
        ),
      };

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        config,
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();
      mockAPI.mockEndpointBatchUpsertUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('does not update the internal account name if the internal account name is custom with last updated', async () => {
      const { messengerMocks, config, options } = await arrangeMocks({
        isAccountSyncingEnabled: true,
        stateOverrides: {
          isProfileSyncingEnabled: true,
        },
        messengerMockOptions: {
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED as InternalAccount[],
          },
        },
      });

      const mockAPI = {
        mockEndpointGetUserStorage:
          await mockEndpointGetUserStorageAllFeatureEntries(
            USER_STORAGE_FEATURE_NAMES.accounts,
            {
              status: 200,
              body: await createMockUserStorageEntries(
                MOCK_USER_STORAGE_ACCOUNTS.ONE_DEFAULT_NAME,
              ),
            },
          ),
        mockEndpointBatchUpsertUserStorage: mockEndpointBatchUpsertUserStorage(
          USER_STORAGE_FEATURE_NAMES.accounts,
        ),
      };

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        config,
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();
      mockAPI.mockEndpointBatchUpsertUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });
  });

  describe('User storage name is a custom name without last updated', () => {
    it('updates the internal account name if the internal account name is a default name', async () => {
      const { messengerMocks, config, options } = await arrangeMocks({
        isAccountSyncingEnabled: true,
        stateOverrides: {
          isProfileSyncingEnabled: true,
        },
        messengerMockOptions: {
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
          },
        },
      });

      const mockAPI = {
        mockEndpointGetUserStorage:
          await mockEndpointGetUserStorageAllFeatureEntries(
            USER_STORAGE_FEATURE_NAMES.accounts,
            {
              status: 200,
              body: await createMockUserStorageEntries(
                MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED,
              ),
            },
          ),
      };

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        config,
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).toHaveBeenCalledWith(
        MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED[0].i,
        {
          name: MOCK_USER_STORAGE_ACCOUNTS
            .ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED[0].n,
        },
      );
    });

    it('does not update internal account name if both user storage and internal accounts have custom names without last updated', async () => {
      const { messengerMocks, config, options } = await arrangeMocks({
        isAccountSyncingEnabled: true,
        stateOverrides: {
          isProfileSyncingEnabled: true,
        },
        messengerMockOptions: {
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED as InternalAccount[],
          },
        },
      });

      const mockAPI = {
        mockEndpointGetUserStorage:
          await mockEndpointGetUserStorageAllFeatureEntries(
            USER_STORAGE_FEATURE_NAMES.accounts,
            {
              status: 200,
              body: await createMockUserStorageEntries(
                MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED,
              ),
            },
          ),
      };

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        config,
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('does not update the internal account name if the internal account name is custom with last updated', async () => {
      const { messengerMocks, config, options } = await arrangeMocks({
        isAccountSyncingEnabled: true,
        stateOverrides: {
          isProfileSyncingEnabled: true,
        },
        messengerMockOptions: {
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED as InternalAccount[],
          },
        },
      });

      const mockAPI = {
        mockEndpointGetUserStorage:
          await mockEndpointGetUserStorageAllFeatureEntries(
            USER_STORAGE_FEATURE_NAMES.accounts,
            {
              status: 200,
              body: await createMockUserStorageEntries(
                MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED,
              ),
            },
          ),
        mockEndpointBatchUpsertUserStorage: mockEndpointBatchUpsertUserStorage(
          USER_STORAGE_FEATURE_NAMES.accounts,
        ),
      };

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        config,
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();
      mockAPI.mockEndpointBatchUpsertUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('fires the onAccountNameUpdated callback when renaming an internal account', async () => {
      const { config, options } = await arrangeMocks({
        isAccountSyncingEnabled: true,
        stateOverrides: {
          isProfileSyncingEnabled: true,
        },
        messengerMockOptions: {
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
          },
        },
      });

      const mockAPI = {
        mockEndpointGetUserStorage:
          await mockEndpointGetUserStorageAllFeatureEntries(
            USER_STORAGE_FEATURE_NAMES.accounts,
            {
              status: 200,
              body: await createMockUserStorageEntries(
                MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED,
              ),
            },
          ),
      };

      const onAccountNameUpdated = jest.fn();

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          ...config,
          onAccountNameUpdated,
        },
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();

      expect(onAccountNameUpdated).toHaveBeenCalledTimes(1);
    });
  });

  describe('User storage name is a custom name with last updated', () => {
    it('updates the internal account name if the internal account name is a default name', async () => {
      const { messengerMocks, config, options } = await arrangeMocks({
        isAccountSyncingEnabled: true,
        stateOverrides: {
          isProfileSyncingEnabled: true,
        },
        messengerMockOptions: {
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
          },
        },
      });

      const mockAPI = {
        mockEndpointGetUserStorage:
          await mockEndpointGetUserStorageAllFeatureEntries(
            USER_STORAGE_FEATURE_NAMES.accounts,
            {
              status: 200,
              body: await createMockUserStorageEntries(
                MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED,
              ),
            },
          ),
      };

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        config,
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).toHaveBeenCalledWith(
        MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0].i,
        {
          name: MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0]
            .n,
        },
      );
    });

    it('updates the internal account name and last updated if the internal account name is a custom name without last updated', async () => {
      const { messengerMocks, config, options } = await arrangeMocks({
        isAccountSyncingEnabled: true,
        stateOverrides: {
          isProfileSyncingEnabled: true,
        },
        messengerMockOptions: {
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED as InternalAccount[],
          },
        },
      });

      const mockAPI = {
        mockEndpointGetUserStorage:
          await mockEndpointGetUserStorageAllFeatureEntries(
            USER_STORAGE_FEATURE_NAMES.accounts,
            {
              status: 200,
              body: await createMockUserStorageEntries(
                MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED,
              ),
            },
          ),
      };

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        config,
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).toHaveBeenCalledWith(
        MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0].i,
        {
          name: MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0]
            .n,
          nameLastUpdatedAt:
            MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0].nlu,
        },
      );
    });

    it('updates the internal account name and last updated if the user storage account is more recent', async () => {
      const { messengerMocks, config, options } = await arrangeMocks({
        isAccountSyncingEnabled: true,
        stateOverrides: {
          isProfileSyncingEnabled: true,
        },
        messengerMockOptions: {
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED as InternalAccount[],
          },
        },
      });

      const mockAPI = {
        mockEndpointGetUserStorage:
          await mockEndpointGetUserStorageAllFeatureEntries(
            USER_STORAGE_FEATURE_NAMES.accounts,
            {
              status: 200,
              body: await createMockUserStorageEntries(
                MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED,
              ),
            },
          ),
      };

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        config,
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).toHaveBeenCalledWith(
        MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0].i,
        {
          name: MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0]
            .n,
          nameLastUpdatedAt:
            MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED[0].nlu,
        },
      );
    });

    it('does not update the internal account if the user storage account is less recent', async () => {
      const { messengerMocks, config, options } = await arrangeMocks({
        isAccountSyncingEnabled: true,
        stateOverrides: {
          isProfileSyncingEnabled: true,
        },
        messengerMockOptions: {
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED_MOST_RECENT as InternalAccount[],
          },
        },
      });

      const mockAPI = {
        mockEndpointGetUserStorage:
          await mockEndpointGetUserStorageAllFeatureEntries(
            USER_STORAGE_FEATURE_NAMES.accounts,
            {
              status: 200,
              body: await createMockUserStorageEntries(
                MOCK_USER_STORAGE_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED,
              ),
            },
          ),
        mockEndpointBatchUpsertUserStorage: mockEndpointBatchUpsertUserStorage(
          USER_STORAGE_FEATURE_NAMES.accounts,
        ),
      };

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        config,
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();
      mockAPI.mockEndpointBatchUpsertUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });
  });
});

describe('user-storage/account-syncing/controller-integration - saveInternalAccountToUserStorage() tests', () => {
  it('returns void if UserStorage is not enabled', async () => {
    const { config, options } = await arrangeMocks({
      isAccountSyncingEnabled: true,
    });

    const mapInternalAccountToUserStorageAccountMock = jest.spyOn(
      AccountsUserStorageModule,
      'mapInternalAccountToUserStorageAccount',
    );

    await AccountSyncingControllerIntegrationModule.saveInternalAccountToUserStorage(
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
      config,
      options,
    );

    expect(mapInternalAccountToUserStorageAccountMock).not.toHaveBeenCalled();
  });

  it('returns void if account syncing feature flag is disabled', async () => {
    const { config, options } = await arrangeMocks({
      isAccountSyncingEnabled: false,
    });

    const mockAPI = {
      mockEndpointUpsertUserStorage: mockEndpointUpsertUserStorage(
        `${USER_STORAGE_FEATURE_NAMES.accounts}.${MOCK_INTERNAL_ACCOUNTS.ONE[0].address}`,
      ),
    };

    await AccountSyncingControllerIntegrationModule.saveInternalAccountToUserStorage(
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
      config,
      options,
    );

    expect(mockAPI.mockEndpointUpsertUserStorage.isDone()).toBe(false);
  });

  it('saves an internal account to user storage', async () => {
    const { config, options } = await arrangeMocks({
      isAccountSyncingEnabled: true,
      stateOverrides: {
        isProfileSyncingEnabled: true,
      },
    });
    const mockAPI = {
      mockEndpointUpsertUserStorage: mockEndpointUpsertUserStorage(
        `${USER_STORAGE_FEATURE_NAMES.accounts}.${MOCK_INTERNAL_ACCOUNTS.ONE[0].address}`,
      ),
    };

    await AccountSyncingControllerIntegrationModule.saveInternalAccountToUserStorage(
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
      config,
      options,
    );

    expect(mockAPI.mockEndpointUpsertUserStorage.isDone()).toBe(true);
  });

  it('rejects if api call fails', async () => {
    const { config, options } = await arrangeMocks({
      isAccountSyncingEnabled: true,
      stateOverrides: {
        isProfileSyncingEnabled: true,
      },
    });

    mockEndpointUpsertUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.accounts}.${MOCK_INTERNAL_ACCOUNTS.ONE[0].address}`,
      { status: 500 },
    );

    await expect(
      AccountSyncingControllerIntegrationModule.saveInternalAccountToUserStorage(
        MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
        config,
        options,
      ),
    ).rejects.toThrow(expect.any(Error));
  });

  describe('it reacts to other controller events', () => {
    const arrangeMocksForAccounts = async () => {
      const { messengerMocks, controller, config, options } =
        await arrangeMocks({
          isAccountSyncingEnabled: true,
          stateOverrides: {
            isProfileSyncingEnabled: true,
          },
          messengerMockOptions: {
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED_MOST_RECENT as InternalAccount[],
            },
          },
        });

      return {
        config,
        options,
        controller,
        messengerMocks,
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries(
              USER_STORAGE_FEATURE_NAMES.accounts,
              {
                status: 200,
                body: await createMockUserStorageEntries(
                  MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL,
                ),
              },
            ),
          mockEndpointBatchUpsertUserStorage:
            mockEndpointBatchUpsertUserStorage(
              USER_STORAGE_FEATURE_NAMES.accounts,
            ),
          mockEndpointUpsertUserStorage: mockEndpointUpsertUserStorage(
            `${USER_STORAGE_FEATURE_NAMES.accounts}.${MOCK_INTERNAL_ACCOUNTS.ONE[0].address}`,
          ),
        },
      };
    };

    it('saves an internal account to user storage when the AccountsController:accountRenamed event is fired', async () => {
      const { messengerMocks, controller } = await arrangeMocksForAccounts();

      // We need to sync at least once before we listen for other controller events
      await controller.setHasAccountSyncingSyncedAtLeastOnce(true);

      const mockSaveInternalAccountToUserStorage = jest
        .spyOn(
          AccountSyncingControllerIntegrationModule,
          'saveInternalAccountToUserStorage',
        )
        .mockImplementation();

      messengerMocks.baseMessenger.publish(
        'AccountsController:accountRenamed',
        MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
      );

      expect(mockSaveInternalAccountToUserStorage).toHaveBeenCalledWith(
        MOCK_INTERNAL_ACCOUNTS.ONE[0],
        expect.anything(),
        expect.anything(),
      );
    });

    it('does not save an internal account to user storage when the AccountsController:accountRenamed event is fired and account syncing has never been dispatched at least once', async () => {
      const { messengerMocks } = await arrangeMocksForAccounts();

      const mockSaveInternalAccountToUserStorage = jest
        .spyOn(
          AccountSyncingControllerIntegrationModule,
          'saveInternalAccountToUserStorage',
        )
        .mockImplementation();

      messengerMocks.baseMessenger.publish(
        'AccountsController:accountRenamed',
        MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
      );

      expect(mockSaveInternalAccountToUserStorage).not.toHaveBeenCalled();
    });

    it('saves an internal account to user storage when the AccountsController:accountAdded event is fired', async () => {
      const { controller, messengerMocks } = await arrangeMocksForAccounts();

      // We need to sync at least once before we listen for other controller events
      await controller.setHasAccountSyncingSyncedAtLeastOnce(true);

      const mockSaveInternalAccountToUserStorage = jest
        .spyOn(
          AccountSyncingControllerIntegrationModule,
          'saveInternalAccountToUserStorage',
        )
        .mockImplementation();

      messengerMocks.baseMessenger.publish(
        'AccountsController:accountAdded',
        MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
      );

      expect(mockSaveInternalAccountToUserStorage).toHaveBeenCalledWith(
        MOCK_INTERNAL_ACCOUNTS.ONE[0],
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
