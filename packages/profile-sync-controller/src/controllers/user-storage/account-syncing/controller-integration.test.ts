import type { InternalAccount } from '@metamask/keyring-internal-api';

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
import UserStorageController, { USER_STORAGE_FEATURE_NAMES } from '..';
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
import { MOCK_STORAGE_KEY } from '../mocks';

const baseState = {
  isBackupAndSyncEnabled: true,
  isAccountSyncingEnabled: true,
  isBackupAndSyncUpdateLoading: false,
  hasAccountSyncingSyncedAtLeastOnce: false,
  isAccountSyncingReadyToBeDispatched: false,
  isAccountSyncingInProgress: false,
};

const arrangeMocks = async (
  {
    stateOverrides = baseState as Partial<typeof baseState>,
    messengerMockOptions = undefined as Parameters<
      typeof mockUserStorageMessengerForAccountSyncing
    >[0],
  } = {
    stateOverrides: baseState as Partial<typeof baseState>,
    messengerMockOptions: undefined as Parameters<
      typeof mockUserStorageMessengerForAccountSyncing
    >[0],
  },
) => {
  const messengerMocks =
    mockUserStorageMessengerForAccountSyncing(messengerMockOptions);
  const controller = new UserStorageController({
    messenger: messengerMocks.messenger,
    state: {
      ...baseState,
      ...stateOverrides,
    },
  });

  const options = {
    getMessenger: () => messengerMocks.messenger,
    getUserStorageControllerInstance: () => controller,
  };

  return {
    messengerMocks,
    controller,
    options,
  };
};

describe('user-storage/account-syncing/controller-integration - saveInternalAccountsListToUserStorage() tests', () => {
  it.todo('returns void if account syncing is not enabled');

  it('returns void if account syncing is enabled but the internal accounts list is empty', async () => {
    const { controller, options } = await arrangeMocks({});

    const mockPerformBatchSetStorage = jest
      .spyOn(controller, 'performBatchSetStorage')
      .mockImplementation(() => Promise.resolve());

    jest
      .spyOn(AccountSyncingUtils, 'getInternalAccountsList')
      .mockResolvedValue([]);

    await AccountSyncingControllerIntegrationModule.saveInternalAccountsListToUserStorage(
      options,
    );

    expect(mockPerformBatchSetStorage).not.toHaveBeenCalled();
  });
});

describe('user-storage/account-syncing/controller-integration - syncInternalAccountsWithUserStorage() tests', () => {
  it('returns void if UserStorage is not enabled', async () => {
    const { controller, messengerMocks, options } = await arrangeMocks({
      stateOverrides: {
        isBackupAndSyncEnabled: false,
      },
    });

    await mockEndpointGetUserStorage();

    await controller.setIsAccountSyncingReadyToBeDispatched(true);

    await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
      {},
      options,
    );

    expect(messengerMocks.mockAccountsListAccounts).not.toHaveBeenCalled();
  });

  it.todo('returns void if account syncing feature flag is disabled');

  it('throws if AccountsController:listAccounts fails or returns an empty list', async () => {
    const { options } = await arrangeMocks({
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
        {},
        options,
      ),
    ).rejects.toThrow(expect.any(Error));

    mockAPI.mockEndpointGetUserStorage.done();
  });

  it('uploads accounts list to user storage if user storage is empty', async () => {
    const { options } = await arrangeMocks({
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
      {},
      options,
    );
    mockAPI.mockEndpointGetUserStorage.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);
    expect(mockAPI.mockEndpointBatchUpsertUserStorage.isDone()).toBe(true);
  });

  it('creates internal accounts if user storage has more accounts. it also updates hasAccountSyncingSyncedAtLeastOnce accordingly', async () => {
    const { messengerMocks, controller, options } = await arrangeMocks({
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
          // eslint-disable-next-line jest/no-conditional-in-test
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
      {},
      options,
    );

    mockAPI.mockEndpointGetUserStorage.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);

    const numberOfAddedAccounts =
      MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL.length -
      MOCK_INTERNAL_ACCOUNTS.ONE.length;

    expect(messengerMocks.mockKeyringAddAccounts).toHaveBeenCalledWith(
      numberOfAddedAccounts,
    );
    expect(mockAPI.mockEndpointBatchDeleteUserStorage.isDone()).toBe(true);

    expect(controller.state.hasAccountSyncingSyncedAtLeastOnce).toBe(true);
  });

  describe('handles corrupted user storage gracefully', () => {
    const arrangeMocksForBogusAccounts = async (persist = true) => {
      const accountsList =
        MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[];
      const { messengerMocks, options } = await arrangeMocks({
        messengerMockOptions: {
          accounts: {
            accountsList,
          },
        },
      });

      const userStorageList =
        MOCK_USER_STORAGE_ACCOUNTS.TWO_DEFAULT_NAMES_WITH_ONE_BOGUS;

      return {
        options,
        messengerMocks,
        accountsList,
        userStorageList,
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries(
              USER_STORAGE_FEATURE_NAMES.accounts,
              {
                status: 200,
                body: await createMockUserStorageEntries(userStorageList),
              },
              persist,
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
      const { options, mockAPI } = await arrangeMocksForBogusAccounts();

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {},
        options,
      );

      expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);
      expect(mockAPI.mockEndpointBatchUpsertUserStorage.isDone()).toBe(false);
      expect(mockAPI.mockEndpointBatchDeleteUserStorage.isDone()).toBe(true);
    });

    describe('Fires the onAccountSyncErroneousSituation callback on erroneous situations', () => {
      it('and logs if the final state is incorrect', async () => {
        const onAccountSyncErroneousSituation = jest.fn();

        const { options, userStorageList, accountsList } =
          await arrangeMocksForBogusAccounts(false);

        await mockEndpointGetUserStorageAllFeatureEntries(
          USER_STORAGE_FEATURE_NAMES.accounts,
          {
            status: 200,
            body: 'null',
          },
        );

        await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
          {
            onAccountSyncErroneousSituation,
          },
          options,
        );

        expect(onAccountSyncErroneousSituation).toHaveBeenCalledTimes(2);
        // eslint-disable-next-line jest/prefer-strict-equal
        expect(onAccountSyncErroneousSituation.mock.calls).toEqual([
          [
            'An account was present in the user storage accounts list but was not found in the internal accounts list after the sync',
            {
              internalAccountsList: accountsList,
              internalAccountsToBeSavedToUserStorage: [],
              refreshedInternalAccountsList: accountsList,
              userStorageAccountsList: userStorageList,
              userStorageAccountsToBeDeleted: [userStorageList[1]],
            },
          ],
          [
            'Erroneous situations were found during the sync, and final state does not match the expected state',
            {
              finalInternalAccountsList: accountsList,
              finalUserStorageAccountsList: null,
            },
          ],
        ]);
      });

      it('and logs if the final state is correct', async () => {
        const onAccountSyncErroneousSituation = jest.fn();

        const { options, userStorageList, accountsList } =
          await arrangeMocksForBogusAccounts(false);

        await mockEndpointGetUserStorageAllFeatureEntries(
          USER_STORAGE_FEATURE_NAMES.accounts,
          {
            status: 200,
            body: await createMockUserStorageEntries([userStorageList[0]]),
          },
        );

        await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
          {
            onAccountSyncErroneousSituation,
          },
          options,
        );

        expect(onAccountSyncErroneousSituation).toHaveBeenCalledTimes(2);
        // eslint-disable-next-line jest/prefer-strict-equal
        expect(onAccountSyncErroneousSituation.mock.calls).toEqual([
          [
            'An account was present in the user storage accounts list but was not found in the internal accounts list after the sync',
            {
              internalAccountsList: accountsList,
              internalAccountsToBeSavedToUserStorage: [],
              refreshedInternalAccountsList: accountsList,
              userStorageAccountsList: userStorageList,
              userStorageAccountsToBeDeleted: [userStorageList[1]],
            },
          ],
          [
            'Erroneous situations were found during the sync, but final state matches the expected state',
            {
              finalInternalAccountsList: accountsList,
              finalUserStorageAccountsList: [userStorageList[0]],
            },
          ],
        ]);
      });
    });
  });

  it('fires the onAccountAdded callback when adding an account', async () => {
    const { options } = await arrangeMocks({
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
          // eslint-disable-next-line jest/no-conditional-in-test
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
    const { messengerMocks, options } = await arrangeMocks({
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
      {},
      options,
    );

    mockAPI.mockEndpointGetUserStorage.done();
    mockAPI.mockEndpointBatchUpsertUserStorage.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);
    expect(mockAPI.mockEndpointBatchUpsertUserStorage.isDone()).toBe(true);

    expect(messengerMocks.mockKeyringAddAccounts).not.toHaveBeenCalled();
  });

  describe('User storage name is a default name', () => {
    it('does not update the internal account name if both user storage and internal accounts have default names', async () => {
      const { messengerMocks, options } = await arrangeMocks({
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
        {},
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('does not update the internal account name if the internal account name is custom without last updated', async () => {
      const { messengerMocks, options } = await arrangeMocks({
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
        {},
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();
      mockAPI.mockEndpointBatchUpsertUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('does not update the internal account name if the internal account name is custom with last updated', async () => {
      const { messengerMocks, options } = await arrangeMocks({
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
        {},
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
      const { messengerMocks, options } = await arrangeMocks({
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
        {},
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
      const { messengerMocks, options } = await arrangeMocks({
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
        {},
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('does not update the internal account name if the internal account name is custom with last updated', async () => {
      const { messengerMocks, options } = await arrangeMocks({
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
        {},
        options,
      );

      mockAPI.mockEndpointGetUserStorage.done();
      mockAPI.mockEndpointBatchUpsertUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('fires the onAccountNameUpdated callback when renaming an internal account', async () => {
      const { options } = await arrangeMocks({
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
      const { messengerMocks, options } = await arrangeMocks({
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
        {},
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
      const { messengerMocks, options } = await arrangeMocks({
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
        {},
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
      const { messengerMocks, options } = await arrangeMocks({
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
        {},
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
      const { messengerMocks, options } = await arrangeMocks({
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
        {},
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
    const { options } = await arrangeMocks({
      stateOverrides: {
        isBackupAndSyncEnabled: false,
      },
    });

    const mapInternalAccountToUserStorageAccountMock = jest.spyOn(
      AccountsUserStorageModule,
      'mapInternalAccountToUserStorageAccount',
    );

    await AccountSyncingControllerIntegrationModule.saveInternalAccountToUserStorage(
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
      options,
    );

    expect(mapInternalAccountToUserStorageAccountMock).not.toHaveBeenCalled();
  });

  it.todo('returns void if account syncing feature flag is disabled');

  it('saves an internal account to user storage', async () => {
    const { options } = await arrangeMocks();
    const mockAPI = {
      mockEndpointUpsertUserStorage: mockEndpointUpsertUserStorage(
        `${USER_STORAGE_FEATURE_NAMES.accounts}.${MOCK_INTERNAL_ACCOUNTS.ONE[0].address}`,
      ),
    };

    await AccountSyncingControllerIntegrationModule.saveInternalAccountToUserStorage(
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
      options,
    );

    expect(mockAPI.mockEndpointUpsertUserStorage.isDone()).toBe(true);
  });

  it('rejects if api call fails', async () => {
    const { options } = await arrangeMocks();

    mockEndpointUpsertUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.accounts}.${MOCK_INTERNAL_ACCOUNTS.ONE[0].address}`,
      { status: 500 },
    );

    await expect(
      AccountSyncingControllerIntegrationModule.saveInternalAccountToUserStorage(
        MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
        options,
      ),
    ).rejects.toThrow(expect.any(Error));
  });

  describe('it reacts to other controller events', () => {
    const arrangeMocksForAccounts = async () => {
      const { messengerMocks, controller, options } = await arrangeMocks({
        messengerMockOptions: {
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED_MOST_RECENT as InternalAccount[],
          },
        },
      });

      return {
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
      );
    });
  });
});
