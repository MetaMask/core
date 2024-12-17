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
import * as AccountsUserStorageModule from './utils';

describe('user-storage/account-syncing/controller-integration - syncInternalAccountsWithUserStorage() tests', () => {
  it('returns void if UserStorage is not enabled', async () => {
    const arrangeMocks = async () => {
      return {
        messengerMocks: mockUserStorageMessengerForAccountSyncing(),
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
        hasAccountSyncingSyncedAtLeastOnce: false,
        isAccountSyncingReadyToBeDispatched: false,
        isAccountSyncingInProgress: false,
      },
    });

    await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
      {
        isAccountSyncingEnabled: true,
      },
      {
        getMessenger: () => messengerMocks.messenger,
        getUserStorageControllerInstance: () => controller,
      },
    );

    expect(messengerMocks.mockAccountsListAccounts).not.toHaveBeenCalled();
  });

  it('returns void if account syncing feature flag is disabled', async () => {
    const arrangeMocks = async () => {
      return {
        messengerMocks: mockUserStorageMessengerForAccountSyncing(),
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries(
              USER_STORAGE_FEATURE_NAMES.accounts,
            ),
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

    await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
      {
        isAccountSyncingEnabled: false,
      },
      {
        getMessenger: () => messengerMocks.messenger,
        getUserStorageControllerInstance: () => controller,
      },
    );
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
        messengerMocks: mockUserStorageMessengerForAccountSyncing({
          accounts: {
            accountsList: [],
          },
        }),
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries(
              USER_STORAGE_FEATURE_NAMES.accounts,
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
      AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          isAccountSyncingEnabled: true,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
      ),
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
        messengerMocks: mockUserStorageMessengerForAccountSyncing({
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
              USER_STORAGE_FEATURE_NAMES.accounts,
              mockUserStorageAccountsResponse,
            ),
          mockEndpointBatchUpsertUserStorage:
            mockEndpointBatchUpsertUserStorage(
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

    await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
      {
        isAccountSyncingEnabled: true,
      },
      {
        getMessenger: () => messengerMocks.messenger,
        getUserStorageControllerInstance: () => controller,
      },
    );
    mockAPI.mockEndpointGetUserStorage.done();

    expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);
    expect(mockAPI.mockEndpointBatchUpsertUserStorage.isDone()).toBe(true);
  });

  it('creates internal accounts if user storage has more accounts. it also updates hasAccountSyncingSyncedAtLeastOnce accordingly', async () => {
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
        messengerMocks: mockUserStorageMessengerForAccountSyncing({
          accounts: {
            accountsList: MOCK_INTERNAL_ACCOUNTS.ONE as InternalAccount[],
          },
        }),
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries(
              USER_STORAGE_FEATURE_NAMES.accounts,
              await mockUserStorageAccountsResponse(),
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
                  MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL.filter(
                    (account) =>
                      !MOCK_INTERNAL_ACCOUNTS.ONE.find(
                        (internalAccount) =>
                          internalAccount.address === account.a,
                      ),
                  ).map((account) => account.a),
                  MOCK_STORAGE_KEY,
                );

                expect(requestBody.batch_delete).toStrictEqual(expectedBody);
              },
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

    await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
      {
        isAccountSyncingEnabled: true,
      },
      {
        getMessenger: () => messengerMocks.messenger,
        getUserStorageControllerInstance: () => controller,
      },
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
    const mockUserStorageAccountsResponse = async () => {
      return {
        status: 200,
        body: await createMockUserStorageEntries(
          MOCK_USER_STORAGE_ACCOUNTS.TWO_DEFAULT_NAMES_WITH_ONE_BOGUS,
        ),
      };
    };

    const arrangeMocksForBogusAccounts = async () => {
      return {
        messengerMocks: mockUserStorageMessengerForAccountSyncing({
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
          },
        }),
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries(
              USER_STORAGE_FEATURE_NAMES.accounts,
              await mockUserStorageAccountsResponse(),
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
      const { messengerMocks, mockAPI } = await arrangeMocksForBogusAccounts();
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          isAccountSyncingEnabled: true,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
      );

      expect(mockAPI.mockEndpointGetUserStorage.isDone()).toBe(true);
      expect(mockAPI.mockEndpointBatchUpsertUserStorage.isDone()).toBe(false);
      expect(mockAPI.mockEndpointBatchDeleteUserStorage.isDone()).toBe(true);
    });

    it('fires the onAccountSyncErroneousSituation callback in erroneous situations', async () => {
      const onAccountSyncErroneousSituation = jest.fn();

      const { messengerMocks } = await arrangeMocksForBogusAccounts();
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          isAccountSyncingEnabled: true,
          onAccountSyncErroneousSituation,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
      );

      expect(onAccountSyncErroneousSituation).toHaveBeenCalledTimes(1);
    });
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
        messengerMocks: mockUserStorageMessengerForAccountSyncing({
          accounts: {
            accountsList: MOCK_INTERNAL_ACCOUNTS.ONE as InternalAccount[],
          },
        }),
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries(
              USER_STORAGE_FEATURE_NAMES.accounts,
              await mockUserStorageAccountsResponse(),
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
                  MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL.filter(
                    (account) =>
                      !MOCK_INTERNAL_ACCOUNTS.ONE.find(
                        (internalAccount) =>
                          internalAccount.address === account.a,
                      ),
                  ).map((account) => account.a),
                  MOCK_STORAGE_KEY,
                );

                expect(requestBody.batch_delete).toStrictEqual(expectedBody);
              },
            ),
        },
      };
    };

    const onAccountAdded = jest.fn();

    const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      env: {
        isAccountSyncingEnabled: true,
      },
      getMetaMetricsState: () => true,
    });

    await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
      {
        isAccountSyncingEnabled: true,
        onAccountAdded,
      },
      {
        getMessenger: () => messengerMocks.messenger,
        getUserStorageControllerInstance: () => controller,
      },
    );

    mockAPI.mockEndpointGetUserStorage.done();

    expect(onAccountAdded).toHaveBeenCalledTimes(
      MOCK_USER_STORAGE_ACCOUNTS.SAME_AS_INTERNAL_ALL.length -
        MOCK_INTERNAL_ACCOUNTS.ONE.length,
    );

    expect(mockAPI.mockEndpointBatchDeleteUserStorage.isDone()).toBe(true);
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
        messengerMocks: mockUserStorageMessengerForAccountSyncing({
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
              USER_STORAGE_FEATURE_NAMES.accounts,
              await mockUserStorageAccountsResponse(),
            ),
          mockEndpointBatchUpsertUserStorage:
            mockEndpointBatchUpsertUserStorage(
              USER_STORAGE_FEATURE_NAMES.accounts,
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

    await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
      {
        isAccountSyncingEnabled: true,
      },
      {
        getMessenger: () => messengerMocks.messenger,
        getUserStorageControllerInstance: () => controller,
      },
    );

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
          messengerMocks: mockUserStorageMessengerForAccountSyncing({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                USER_STORAGE_FEATURE_NAMES.accounts,
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

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          isAccountSyncingEnabled: true,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
      );

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('does not update the internal account name if the internal account name is custom without last updated', async () => {
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessengerForAccountSyncing({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                USER_STORAGE_FEATURE_NAMES.accounts,
                await mockUserStorageAccountsResponse(),
              ),
            mockEndpointBatchUpsertUserStorage:
              mockEndpointBatchUpsertUserStorage(
                USER_STORAGE_FEATURE_NAMES.accounts,
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

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          isAccountSyncingEnabled: true,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
      );

      mockAPI.mockEndpointGetUserStorage.done();
      mockAPI.mockEndpointBatchUpsertUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('does not update the internal account name if the internal account name is custom with last updated', async () => {
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessengerForAccountSyncing({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                USER_STORAGE_FEATURE_NAMES.accounts,
                await mockUserStorageAccountsResponse(),
              ),
            mockEndpointBatchUpsertUserStorage:
              mockEndpointBatchUpsertUserStorage(
                USER_STORAGE_FEATURE_NAMES.accounts,
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

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          isAccountSyncingEnabled: true,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
      );

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
          messengerMocks: mockUserStorageMessengerForAccountSyncing({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                USER_STORAGE_FEATURE_NAMES.accounts,
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

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          isAccountSyncingEnabled: true,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
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
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessengerForAccountSyncing({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                USER_STORAGE_FEATURE_NAMES.accounts,
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

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          isAccountSyncingEnabled: true,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
      );

      mockAPI.mockEndpointGetUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('does not update the internal account name if the internal account name is custom with last updated', async () => {
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessengerForAccountSyncing({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                USER_STORAGE_FEATURE_NAMES.accounts,
                await mockUserStorageAccountsResponse(),
              ),
            mockEndpointBatchUpsertUserStorage:
              mockEndpointBatchUpsertUserStorage(
                USER_STORAGE_FEATURE_NAMES.accounts,
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

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          isAccountSyncingEnabled: true,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
      );

      mockAPI.mockEndpointGetUserStorage.done();
      mockAPI.mockEndpointBatchUpsertUserStorage.done();

      expect(
        messengerMocks.mockAccountsUpdateAccountMetadata,
      ).not.toHaveBeenCalled();
    });

    it('fires the onAccountNameUpdated callback when renaming an internal account', async () => {
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessengerForAccountSyncing({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                USER_STORAGE_FEATURE_NAMES.accounts,
                await mockUserStorageAccountsResponse(),
              ),
          },
        };
      };

      const onAccountNameUpdated = jest.fn();

      const { messengerMocks, mockAPI } = await arrangeMocksForAccounts();
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          isAccountSyncingEnabled: true,
          onAccountNameUpdated,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
      );

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
          messengerMocks: mockUserStorageMessengerForAccountSyncing({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_DEFAULT_NAME as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                USER_STORAGE_FEATURE_NAMES.accounts,
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

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          isAccountSyncingEnabled: true,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
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
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessengerForAccountSyncing({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITHOUT_LAST_UPDATED as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                USER_STORAGE_FEATURE_NAMES.accounts,
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

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          isAccountSyncingEnabled: true,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
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
      const arrangeMocksForAccounts = async () => {
        const mockGetEntriesResponse = await mockUserStorageAccountsResponse();
        return {
          messengerMocks: mockUserStorageMessengerForAccountSyncing({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                USER_STORAGE_FEATURE_NAMES.accounts,
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

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          isAccountSyncingEnabled: true,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
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
      const arrangeMocksForAccounts = async () => {
        return {
          messengerMocks: mockUserStorageMessengerForAccountSyncing({
            accounts: {
              accountsList:
                MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED_MOST_RECENT as InternalAccount[],
            },
          }),
          mockAPI: {
            mockEndpointGetUserStorage:
              await mockEndpointGetUserStorageAllFeatureEntries(
                USER_STORAGE_FEATURE_NAMES.accounts,
                await mockUserStorageAccountsResponse(),
              ),
            mockEndpointBatchUpsertUserStorage:
              mockEndpointBatchUpsertUserStorage(
                USER_STORAGE_FEATURE_NAMES.accounts,
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

      await AccountSyncingControllerIntegrationModule.syncInternalAccountsWithUserStorage(
        {
          isAccountSyncingEnabled: true,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
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
    const arrangeMocks = async () => {
      return {
        messengerMocks: mockUserStorageMessengerForAccountSyncing(),
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
        hasAccountSyncingSyncedAtLeastOnce: false,
        isAccountSyncingReadyToBeDispatched: false,
        isAccountSyncingInProgress: false,
      },
    });

    await AccountSyncingControllerIntegrationModule.saveInternalAccountToUserStorage(
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
      {
        isAccountSyncingEnabled: true,
      },
      {
        getMessenger: () => messengerMocks.messenger,
        getUserStorageControllerInstance: () => controller,
      },
    );

    expect(mapInternalAccountToUserStorageAccountMock).not.toHaveBeenCalled();
  });

  it('returns void if account syncing feature flag is disabled', async () => {
    const arrangeMocks = async () => {
      return {
        messengerMocks: mockUserStorageMessengerForAccountSyncing(),
        mockAPI: mockEndpointUpsertUserStorage(
          `${USER_STORAGE_FEATURE_NAMES.accounts}.${MOCK_INTERNAL_ACCOUNTS.ONE[0].address}`,
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

    await AccountSyncingControllerIntegrationModule.saveInternalAccountToUserStorage(
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
      {
        isAccountSyncingEnabled: false,
      },
      {
        getMessenger: () => messengerMocks.messenger,
        getUserStorageControllerInstance: () => controller,
      },
    );

    expect(mockAPI.isDone()).toBe(false);
  });

  it('saves an internal account to user storage', async () => {
    const arrangeMocks = async () => {
      return {
        messengerMocks: mockUserStorageMessengerForAccountSyncing(),
        mockAPI: mockEndpointUpsertUserStorage(
          `${USER_STORAGE_FEATURE_NAMES.accounts}.${MOCK_INTERNAL_ACCOUNTS.ONE[0].address}`,
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

    await AccountSyncingControllerIntegrationModule.saveInternalAccountToUserStorage(
      MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
      {
        isAccountSyncingEnabled: true,
      },
      {
        getMessenger: () => messengerMocks.messenger,
        getUserStorageControllerInstance: () => controller,
      },
    );

    expect(mockAPI.isDone()).toBe(true);
  });

  it('rejects if api call fails', async () => {
    const arrangeMocks = async () => {
      return {
        messengerMocks: mockUserStorageMessengerForAccountSyncing(),
        mockAPI: mockEndpointUpsertUserStorage(
          `${USER_STORAGE_FEATURE_NAMES.accounts}.${MOCK_INTERNAL_ACCOUNTS.ONE[0].address}`,
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
      AccountSyncingControllerIntegrationModule.saveInternalAccountToUserStorage(
        MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
        {
          isAccountSyncingEnabled: true,
        },
        {
          getMessenger: () => messengerMocks.messenger,
          getUserStorageControllerInstance: () => controller,
        },
      ),
    ).rejects.toThrow(expect.any(Error));
  });

  describe('it reacts to other controller events', () => {
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
        messengerMocks: mockUserStorageMessengerForAccountSyncing({
          accounts: {
            accountsList:
              MOCK_INTERNAL_ACCOUNTS.ONE_CUSTOM_NAME_WITH_LAST_UPDATED_MOST_RECENT as InternalAccount[],
          },
        }),
        mockAPI: {
          mockEndpointGetUserStorage:
            await mockEndpointGetUserStorageAllFeatureEntries(
              USER_STORAGE_FEATURE_NAMES.accounts,
              await mockUserStorageAccountsResponse(),
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
      const { messengerMocks } = await arrangeMocksForAccounts();
      const { baseMessenger, messenger } = messengerMocks;

      const controller = new UserStorageController({
        messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      // We need to sync at least once before we listen for other controller events
      await controller.setHasAccountSyncingSyncedAtLeastOnce(true);

      const mockSaveInternalAccountToUserStorage = jest
        .spyOn(
          AccountSyncingControllerIntegrationModule,
          'saveInternalAccountToUserStorage',
        )
        .mockImplementation();

      baseMessenger.publish(
        'AccountsController:accountRenamed',
        MOCK_INTERNAL_ACCOUNTS.ONE[0] as InternalAccount,
      );

      expect(mockSaveInternalAccountToUserStorage).toHaveBeenCalledWith(
        MOCK_INTERNAL_ACCOUNTS.ONE[0],
        expect.anything(),
        expect.anything(),
      );
    });

    it('saves an internal account to user storage when the AccountsController:accountAdded event is fired', async () => {
      const { messengerMocks } = await arrangeMocksForAccounts();
      const { baseMessenger, messenger } = messengerMocks;

      const controller = new UserStorageController({
        messenger,
        env: {
          isAccountSyncingEnabled: true,
        },
        getMetaMetricsState: () => true,
      });

      // We need to sync at least once before we listen for other controller events
      await controller.setHasAccountSyncingSyncedAtLeastOnce(true);

      const mockSaveInternalAccountToUserStorage = jest
        .spyOn(
          AccountSyncingControllerIntegrationModule,
          'saveInternalAccountToUserStorage',
        )
        .mockImplementation();

      baseMessenger.publish(
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
