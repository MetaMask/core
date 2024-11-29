import encryption, { createSHA256Hash } from '../../shared/encryption';
import { getIfEntriesHaveDifferentSalts } from '../../shared/encryption/utils';
import type { UserStorageFeatureKeys } from '../../shared/storage-schema';
import { USER_STORAGE_FEATURE_NAMES } from '../../shared/storage-schema';
import { createMockGetStorageResponse } from './__fixtures__';
import {
  mockEndpointGetUserStorage,
  mockEndpointUpsertUserStorage,
  mockEndpointGetUserStorageAllFeatureEntries,
  mockEndpointBatchUpsertUserStorage,
  mockEndpointBatchDeleteUserStorage,
  mockEndpointDeleteUserStorageAllFeatureEntries,
  mockEndpointDeleteUserStorage,
} from './__fixtures__/mockServices';
import {
  MOCK_STORAGE_DATA,
  MOCK_STORAGE_KEY,
} from './__fixtures__/mockStorage';
import type { GetUserStorageResponse } from './services';
import {
  batchUpsertUserStorage,
  batchDeleteUserStorage,
  getUserStorage,
  getUserStorageAllFeatureEntries,
  upsertUserStorage,
  deleteUserStorageAllFeatureEntries,
  deleteUserStorage,
  batchUpsertUserStorageWithAlreadyHashedAndEncryptedEntries,
} from './services';

describe('user-storage/services.ts - getUserStorage() tests', () => {
  const actCallGetUserStorage = async () => {
    return await getUserStorage({
      bearerToken: 'MOCK_BEARER_TOKEN',
      path: `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      storageKey: MOCK_STORAGE_KEY,
    });
  };

  it('returns user storage data', async () => {
    const mockGetUserStorage = await mockEndpointGetUserStorage();
    const result = await actCallGetUserStorage();

    mockGetUserStorage.done();
    expect(result).toBe(MOCK_STORAGE_DATA);
  });

  it('returns null if endpoint does not have entry', async () => {
    const mockGetUserStorage = await mockEndpointGetUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      { status: 404 },
    );
    const result = await actCallGetUserStorage();

    mockGetUserStorage.done();
    expect(result).toBeNull();
  });

  it('returns null if endpoint fails', async () => {
    const mockGetUserStorage = await mockEndpointGetUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      { status: 500 },
    );
    const result = await actCallGetUserStorage();

    mockGetUserStorage.done();
    expect(result).toBeNull();
  });

  it('returns null if unable to decrypt data', async () => {
    const badResponseData: GetUserStorageResponse = {
      HashedKey: 'MOCK_HASH',
      Data: 'Bad Encrypted Data',
    };
    const mockGetUserStorage = await mockEndpointGetUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      {
        status: 200,
        body: badResponseData,
      },
    );
    const result = await actCallGetUserStorage();

    mockGetUserStorage.done();
    expect(result).toBeNull();
  });

  it('re-encrypts data if received entry was encrypted with a non-empty salt, and saves it back to user storage', async () => {
    // This corresponds to 'data1'
    // Encrypted with a non-empty salt
    const mockResponse = {
      HashedKey: 'entry1',
      Data: '{"v":"1","t":"scrypt","d":"HIu+WgFBCtKo6rEGy0R8h8t/JgXhzC2a3AF6epahGY2h6GibXDKxSBf6ppxM099Gmg==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
    };

    const mockGetUserStorage = await mockEndpointGetUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      {
        status: 200,
        body: JSON.stringify(mockResponse),
      },
    );

    const mockUpsertUserStorage = mockEndpointUpsertUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      undefined,
      async (requestBody) => {
        if (typeof requestBody === 'string') {
          return;
        }

        const isNewSaltEmpty =
          encryption.getSalt(requestBody.data).length === 0;

        expect(isNewSaltEmpty).toBe(true);
      },
    );

    const result = await actCallGetUserStorage();

    mockGetUserStorage.done();
    mockUpsertUserStorage.done();
    expect(result).toBe('data1');
  });
});

describe('user-storage/services.ts - getUserStorageAllFeatureEntries() tests', () => {
  const actCallGetUserStorageAllFeatureEntries = async () => {
    return await getUserStorageAllFeatureEntries({
      bearerToken: 'MOCK_BEARER_TOKEN',
      path: USER_STORAGE_FEATURE_NAMES.notifications,
      storageKey: MOCK_STORAGE_KEY,
    });
  };

  it('returns user storage data', async () => {
    const mockGetUserStorageAllFeatureEntries =
      await mockEndpointGetUserStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.notifications,
      );
    const result = await actCallGetUserStorageAllFeatureEntries();

    mockGetUserStorageAllFeatureEntries.done();
    expect(result).toStrictEqual([MOCK_STORAGE_DATA]);
  });

  it('re-encrypts data if received entries were encrypted with non-empty salts, and saves it back to user storage', async () => {
    // This corresponds to [['entry1', 'data1'], ['entry2', 'data2'], ['HASHED_KEY', '{ "hello": "world" }']]
    // Each entry has been encrypted with a non-empty salt, except for the last entry
    // The last entry is used to test if the function can handle entries with either empty or non-empty salts
    const mockResponse = [
      {
        HashedKey: 'entry1',
        Data: '{"v":"1","t":"scrypt","d":"HIu+WgFBCtKo6rEGy0R8h8t/JgXhzC2a3AF6epahGY2h6GibXDKxSBf6ppxM099Gmg==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
      },
      {
        HashedKey: 'entry2',
        Data: '{"v":"1","t":"scrypt","d":"3ioo9bxhjDjTmJWIGQMnOlnfa4ysuUNeLYTTmJ+qrq7gwI6hURH3ooUcBldJkHtvuQ==","o":{"N":131072,"r":8,"p":1,"dkLen":16},"saltLen":16}',
      },
      await createMockGetStorageResponse(),
    ];

    const mockGetUserStorageAllFeatureEntries =
      await mockEndpointGetUserStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.notifications,
        {
          status: 200,
          body: JSON.stringify(mockResponse),
        },
      );

    const mockBatchUpsertUserStorage = mockEndpointBatchUpsertUserStorage(
      USER_STORAGE_FEATURE_NAMES.notifications,
      undefined,
      async (_uri, requestBody) => {
        if (typeof requestBody === 'string') {
          return;
        }

        const doEntriesHaveDifferentSalts = getIfEntriesHaveDifferentSalts(
          Object.entries(requestBody.data).map((entry) => entry[1] as string),
        );

        expect(doEntriesHaveDifferentSalts).toBe(false);

        const doEntriesHaveEmptySalts = Object.entries(requestBody.data).every(
          ([_entryKey, entryValue]) =>
            encryption.getSalt(entryValue as string).length === 0,
        );

        expect(doEntriesHaveEmptySalts).toBe(true);

        const wereOnlyNonEmptySaltEntriesUploaded =
          Object.entries(requestBody.data).length === 2;

        expect(wereOnlyNonEmptySaltEntriesUploaded).toBe(true);
      },
    );

    const result = await actCallGetUserStorageAllFeatureEntries();

    mockGetUserStorageAllFeatureEntries.done();
    mockBatchUpsertUserStorage.done();
    expect(result).toStrictEqual(['data1', 'data2', MOCK_STORAGE_DATA]);
  });

  it('returns null if endpoint does not have entry', async () => {
    const mockGetUserStorage =
      await mockEndpointGetUserStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.notifications,
        {
          status: 404,
        },
      );
    const result = await actCallGetUserStorageAllFeatureEntries();

    mockGetUserStorage.done();
    expect(result).toBeNull();
  });

  it('returns null if endpoint fails', async () => {
    const mockGetUserStorage =
      await mockEndpointGetUserStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.notifications,
        {
          status: 500,
        },
      );
    const result = await actCallGetUserStorageAllFeatureEntries();

    mockGetUserStorage.done();
    expect(result).toBeNull();
  });

  it('returns null if unable to decrypt data', async () => {
    const badResponseData: GetUserStorageResponse = {
      HashedKey: 'MOCK_HASH',
      Data: 'Bad Encrypted Data',
    };
    const mockGetUserStorage =
      await mockEndpointGetUserStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.notifications,
        {
          status: 200,
          body: badResponseData,
        },
      );
    const result = await actCallGetUserStorageAllFeatureEntries();

    mockGetUserStorage.done();
    expect(result).toBeNull();
  });
});

describe('user-storage/services.ts - upsertUserStorage() tests', () => {
  const actCallUpsertUserStorage = async () => {
    return await upsertUserStorage(MOCK_STORAGE_DATA, {
      bearerToken: 'MOCK_BEARER_TOKEN',
      path: `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      storageKey: MOCK_STORAGE_KEY,
    });
  };

  it('invokes upsert endpoint with no errors', async () => {
    const mockUpsertUserStorage = mockEndpointUpsertUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      undefined,
      async (requestBody) => {
        if (typeof requestBody === 'string') {
          return;
        }

        const decryptedBody = await encryption.decryptString(
          requestBody.data,
          MOCK_STORAGE_KEY,
        );

        expect(decryptedBody).toBe(MOCK_STORAGE_DATA);
      },
    );

    await actCallUpsertUserStorage();

    expect(mockUpsertUserStorage.isDone()).toBe(true);
  });

  it('throws error if unable to upsert user storage', async () => {
    const mockUpsertUserStorage = mockEndpointUpsertUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      {
        status: 500,
      },
    );

    await expect(actCallUpsertUserStorage()).rejects.toThrow(expect.any(Error));
    mockUpsertUserStorage.done();
  });
});

describe('user-storage/services.ts - batchUpsertUserStorage() tests', () => {
  const dataToStore: [
    UserStorageFeatureKeys<typeof USER_STORAGE_FEATURE_NAMES.accounts>,
    string,
  ][] = [
    ['0x123', MOCK_STORAGE_DATA],
    ['0x456', MOCK_STORAGE_DATA],
  ];

  const actCallBatchUpsertUserStorage = async () => {
    return await batchUpsertUserStorage(dataToStore, {
      bearerToken: 'MOCK_BEARER_TOKEN',
      path: USER_STORAGE_FEATURE_NAMES.accounts,
      storageKey: MOCK_STORAGE_KEY,
    });
  };

  it('invokes upsert endpoint with no errors', async () => {
    const mockUpsertUserStorage = mockEndpointBatchUpsertUserStorage(
      USER_STORAGE_FEATURE_NAMES.accounts,
      undefined,
      async (_uri, requestBody) => {
        if (typeof requestBody === 'string') {
          return;
        }

        const decryptedBody = await Promise.all(
          Object.entries<string>(requestBody.data).map(
            async ([entryKey, entryValue]) => {
              return [
                entryKey,
                await encryption.decryptString(entryValue, MOCK_STORAGE_KEY),
              ];
            },
          ),
        );

        const expectedBody = dataToStore.map(([entryKey, entryValue]) => [
          createSHA256Hash(String(entryKey) + MOCK_STORAGE_KEY),
          entryValue,
        ]);

        expect(decryptedBody).toStrictEqual(expectedBody);
      },
    );

    await actCallBatchUpsertUserStorage();

    expect(mockUpsertUserStorage.isDone()).toBe(true);
  });

  it('throws error if unable to upsert user storage', async () => {
    const mockUpsertUserStorage = mockEndpointBatchUpsertUserStorage(
      USER_STORAGE_FEATURE_NAMES.accounts,
      {
        status: 500,
      },
    );

    await expect(actCallBatchUpsertUserStorage()).rejects.toThrow(
      expect.any(Error),
    );
    mockUpsertUserStorage.done();
  });

  it('does nothing if empty data is provided', async () => {
    const mockUpsertUserStorage =
      mockEndpointBatchUpsertUserStorage('accounts_v2');

    await batchUpsertUserStorage([], {
      bearerToken: 'MOCK_BEARER_TOKEN',
      path: 'accounts_v2',
      storageKey: MOCK_STORAGE_KEY,
    });

    expect(mockUpsertUserStorage.isDone()).toBe(false);
  });
});

describe('user-storage/services.ts - batchUpsertUserStorageWithAlreadyHashedAndEncryptedEntries() tests', () => {
  let dataToStore: [string, string][];
  const getDataToStore = async (): Promise<[string, string][]> =>
    (dataToStore ??= [
      [
        createSHA256Hash(`0x123${MOCK_STORAGE_KEY}`),
        await encryption.encryptString(MOCK_STORAGE_DATA, MOCK_STORAGE_KEY),
      ],
      [
        createSHA256Hash(`0x456${MOCK_STORAGE_KEY}`),
        await encryption.encryptString(MOCK_STORAGE_DATA, MOCK_STORAGE_KEY),
      ],
    ]);

  const actCallBatchUpsertUserStorage = async () => {
    return await batchUpsertUserStorageWithAlreadyHashedAndEncryptedEntries(
      await getDataToStore(),
      {
        bearerToken: 'MOCK_BEARER_TOKEN',
        path: USER_STORAGE_FEATURE_NAMES.accounts,
        storageKey: MOCK_STORAGE_KEY,
      },
    );
  };

  it('invokes upsert endpoint with no errors', async () => {
    const mockUpsertUserStorage = mockEndpointBatchUpsertUserStorage(
      USER_STORAGE_FEATURE_NAMES.accounts,
      undefined,
      async (_uri, requestBody) => {
        if (typeof requestBody === 'string') {
          return;
        }

        const expectedBody = Object.fromEntries(await getDataToStore());

        expect(requestBody.data).toStrictEqual(expectedBody);
      },
    );

    await actCallBatchUpsertUserStorage();

    expect(mockUpsertUserStorage.isDone()).toBe(true);
  });

  it('throws error if unable to upsert user storage', async () => {
    const mockUpsertUserStorage = mockEndpointBatchUpsertUserStorage(
      USER_STORAGE_FEATURE_NAMES.accounts,
      {
        status: 500,
      },
    );

    await expect(actCallBatchUpsertUserStorage()).rejects.toThrow(
      expect.any(Error),
    );
    mockUpsertUserStorage.done();
  });

  it('does nothing if empty data is provided', async () => {
    const mockUpsertUserStorage =
      mockEndpointBatchUpsertUserStorage('accounts_v2');

    await batchUpsertUserStorage([], {
      bearerToken: 'MOCK_BEARER_TOKEN',
      path: 'accounts_v2',
      storageKey: MOCK_STORAGE_KEY,
    });

    expect(mockUpsertUserStorage.isDone()).toBe(false);
  });
});

describe('user-storage/services.ts - deleteUserStorage() tests', () => {
  const actCallDeleteUserStorage = async () => {
    return await deleteUserStorage({
      path: `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      bearerToken: 'MOCK_BEARER_TOKEN',
      storageKey: MOCK_STORAGE_KEY,
    });
  };

  it('invokes delete endpoint with no errors', async () => {
    const mockDeleteUserStorage = mockEndpointDeleteUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
    );

    await actCallDeleteUserStorage();

    expect(mockDeleteUserStorage.isDone()).toBe(true);
  });

  it('throws error if unable to delete user storage', async () => {
    const mockDeleteUserStorage = mockEndpointDeleteUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      { status: 500 },
    );

    await expect(actCallDeleteUserStorage()).rejects.toThrow(expect.any(Error));
    mockDeleteUserStorage.done();
  });

  it('throws error if feature not found', async () => {
    const mockDeleteUserStorage = mockEndpointDeleteUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      { status: 404 },
    );

    await expect(actCallDeleteUserStorage()).rejects.toThrow(
      'user-storage - feature/entry not found',
    );
    mockDeleteUserStorage.done();
  });

  it('throws error if unable to get user storage', async () => {
    const mockDeleteUserStorage = mockEndpointDeleteUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
      { status: 400 },
    );

    await expect(actCallDeleteUserStorage()).rejects.toThrow(
      'user-storage - unable to delete data',
    );
    mockDeleteUserStorage.done();
  });
});

describe('user-storage/services.ts - deleteUserStorageAllFeatureEntries() tests', () => {
  const actCallDeleteUserStorageAllFeatureEntries = async () => {
    return await deleteUserStorageAllFeatureEntries({
      bearerToken: 'MOCK_BEARER_TOKEN',
      path: USER_STORAGE_FEATURE_NAMES.accounts,
      storageKey: MOCK_STORAGE_KEY,
    });
  };

  it('invokes delete endpoint with no errors', async () => {
    const mockDeleteUserStorage =
      mockEndpointDeleteUserStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.accounts,
        undefined,
      );

    await actCallDeleteUserStorageAllFeatureEntries();

    expect(mockDeleteUserStorage.isDone()).toBe(true);
  });

  it('throws error if unable to delete user storage', async () => {
    const mockDeleteUserStorage =
      mockEndpointDeleteUserStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.accounts,
        {
          status: 500,
        },
      );

    await expect(actCallDeleteUserStorageAllFeatureEntries()).rejects.toThrow(
      expect.any(Error),
    );
    mockDeleteUserStorage.done();
  });

  it('throws error if feature not found', async () => {
    const mockDeleteUserStorage =
      mockEndpointDeleteUserStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.accounts,
        {
          status: 404,
        },
      );

    await expect(actCallDeleteUserStorageAllFeatureEntries()).rejects.toThrow(
      'user-storage - feature not found',
    );
    mockDeleteUserStorage.done();
  });

  it('throws error if unable to get user storage', async () => {
    const mockDeleteUserStorage =
      mockEndpointDeleteUserStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.accounts,
        {
          status: 400,
        },
      );

    await expect(actCallDeleteUserStorageAllFeatureEntries()).rejects.toThrow(
      'user-storage - unable to delete data',
    );
    mockDeleteUserStorage.done();
  });
});

describe('user-storage/services.ts - batchDeleteUserStorage() tests', () => {
  const keysToDelete: UserStorageFeatureKeys<
    typeof USER_STORAGE_FEATURE_NAMES.accounts
  >[] = ['0x123', '0x456'];

  const actCallBatchDeleteUserStorage = async () => {
    return await batchDeleteUserStorage(keysToDelete, {
      bearerToken: 'MOCK_BEARER_TOKEN',
      path: USER_STORAGE_FEATURE_NAMES.accounts,
      storageKey: MOCK_STORAGE_KEY,
    });
  };

  it('invokes upsert endpoint with no errors', async () => {
    const mockDeleteUserStorage = mockEndpointBatchDeleteUserStorage(
      USER_STORAGE_FEATURE_NAMES.accounts,
      undefined,
      async (_uri, requestBody) => {
        if (typeof requestBody === 'string') {
          return;
        }

        const expectedBody = keysToDelete.map((entryKey: string) =>
          createSHA256Hash(String(entryKey) + MOCK_STORAGE_KEY),
        );

        expect(requestBody.batch_delete).toStrictEqual(expectedBody);
      },
    );

    await actCallBatchDeleteUserStorage();

    expect(mockDeleteUserStorage.isDone()).toBe(true);
  });

  it('throws error if unable to upsert user storage', async () => {
    const mockDeleteUserStorage = mockEndpointBatchDeleteUserStorage(
      USER_STORAGE_FEATURE_NAMES.accounts,
      {
        status: 500,
      },
    );

    await expect(actCallBatchDeleteUserStorage()).rejects.toThrow(
      expect.any(Error),
    );
    mockDeleteUserStorage.done();
  });

  it('does nothing if empty data is provided', async () => {
    const mockDeleteUserStorage =
      mockEndpointBatchDeleteUserStorage('accounts_v2');

    await batchDeleteUserStorage([], {
      bearerToken: 'MOCK_BEARER_TOKEN',
      path: 'accounts_v2',
      storageKey: MOCK_STORAGE_KEY,
    });

    expect(mockDeleteUserStorage.isDone()).toBe(false);
  });
});
