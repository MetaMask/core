import {
  MOCK_USER_STORAGE_ACCOUNT,
  MOCK_USER_STORAGE_CHAIN,
  createMockFullUserStorage,
  createMockUserStorageWithTriggers,
} from '../__fixtures__/mock-notification-user-storage';
import { USER_STORAGE_VERSION_KEY } from '../constants/constants';
import {
  NOTIFICATION_CHAINS,
  TRIGGER_TYPES,
} from '../constants/notification-schema';
import type { UserStorage } from '../types/user-storage/user-storage';
import * as Utils from './utils';

describe('metamask-notifications/utils - initializeUserStorage()', () => {
  it('creates a new user storage object based on the accounts provided', () => {
    const mockAddress = 'MOCK_ADDRESS';
    const userStorage = Utils.initializeUserStorage(
      [{ address: mockAddress }],
      true,
    );

    // Addresses in User Storage are lowercase to prevent multiple entries of same address
    const userStorageAddress = mockAddress.toLowerCase();
    expect(userStorage[userStorageAddress]).toBeDefined();
  });

  it('returns User Storage with no addresses if none provided', () => {
    const assertEmptyStorage = (storage: UserStorage) => {
      expect(Object.keys(storage).length === 1).toBe(true);
      expect(USER_STORAGE_VERSION_KEY in storage).toBe(true);
    };

    const userStorageTest1 = Utils.initializeUserStorage([], true);
    assertEmptyStorage(userStorageTest1);

    const userStorageTest2 = Utils.initializeUserStorage(
      [{ address: undefined }],
      true,
    );
    assertEmptyStorage(userStorageTest2);
  });
});

describe('metamask-notifications/utils - traverseUserStorageTriggers()', () => {
  it('traverses User Storage to return triggers', () => {
    const storage = createMockFullUserStorage();
    const triggersObjArray = Utils.traverseUserStorageTriggers(storage);
    expect(triggersObjArray.length > 0).toBe(true);
    expect(typeof triggersObjArray[0] === 'object').toBe(true);
  });

  it('traverses and maps User Storage using mapper', () => {
    const storage = createMockFullUserStorage();

    // as the type suggests, the mapper returns a string, so expect this to be a string
    const triggersStrArray = Utils.traverseUserStorageTriggers(storage, {
      mapTrigger: (t) => t.id,
    });
    expect(triggersStrArray.length > 0).toBe(true);
    expect(typeof triggersStrArray[0] === 'string').toBe(true);

    // if the mapper returns a falsy value, it is filtered out
    const emptyTriggersArray = Utils.traverseUserStorageTriggers(storage, {
      mapTrigger: (_t): string | undefined => undefined,
    });
    expect(emptyTriggersArray.length === 0).toBe(true);
  });
});

describe('metamask-notifications/utils - checkAccountsPresence()', () => {
  it('returns record of addresses that are in storage', () => {
    const storage = createMockFullUserStorage();
    const result = Utils.checkAccountsPresence(storage, [
      MOCK_USER_STORAGE_ACCOUNT,
    ]);
    expect(result).toStrictEqual({
      [MOCK_USER_STORAGE_ACCOUNT.toLowerCase()]: true,
    });
  });

  it('returns record of addresses in storage and not fully in storage', () => {
    const storage = createMockFullUserStorage();
    const MOCK_MISSING_ADDRESS = '0x2';
    const result = Utils.checkAccountsPresence(storage, [
      MOCK_USER_STORAGE_ACCOUNT,
      MOCK_MISSING_ADDRESS,
    ]);
    expect(result).toStrictEqual({
      [MOCK_USER_STORAGE_ACCOUNT.toLowerCase()]: true,
      [MOCK_MISSING_ADDRESS.toLowerCase()]: false,
    });
  });

  it('returns record where accounts are not fully present, due to missing chains', () => {
    const storage = createMockFullUserStorage();
    delete storage[MOCK_USER_STORAGE_ACCOUNT][NOTIFICATION_CHAINS.ETHEREUM];

    const result = Utils.checkAccountsPresence(storage, [
      MOCK_USER_STORAGE_ACCOUNT,
    ]);
    expect(result).toStrictEqual({
      [MOCK_USER_STORAGE_ACCOUNT.toLowerCase()]: false, // false due to missing chains
    });
  });

  it('returns record where accounts are not fully present, due to missing triggers', () => {
    const storage = createMockFullUserStorage();
    const MOCK_TRIGGER_TO_DELETE = Object.keys(
      storage[MOCK_USER_STORAGE_ACCOUNT][NOTIFICATION_CHAINS.ETHEREUM],
    )[0];
    delete storage[MOCK_USER_STORAGE_ACCOUNT][NOTIFICATION_CHAINS.ETHEREUM][
      MOCK_TRIGGER_TO_DELETE
    ];

    const result = Utils.checkAccountsPresence(storage, [
      MOCK_USER_STORAGE_ACCOUNT,
    ]);
    expect(result).toStrictEqual({
      [MOCK_USER_STORAGE_ACCOUNT.toLowerCase()]: false, // false due to missing triggers
    });
  });
});

describe('metamask-notifications/utils - inferEnabledKinds()', () => {
  it('returns all kinds from a User Storage Obj', () => {
    const partialStorage = createMockUserStorageWithTriggers([
      { id: '1', e: true, k: TRIGGER_TYPES.ERC1155_RECEIVED },
      { id: '2', e: true, k: TRIGGER_TYPES.ERC1155_SENT },
      { id: '3', e: true, k: TRIGGER_TYPES.ERC1155_SENT }, // should remove duplicates
    ]);

    const result = Utils.inferEnabledKinds(partialStorage);
    expect(result).toHaveLength(2);
    expect(result).toContain(TRIGGER_TYPES.ERC1155_RECEIVED);
    expect(result).toContain(TRIGGER_TYPES.ERC1155_SENT);
  });
});

describe('metamask-notifications/utils - getUUIDsForAccount()', () => {
  it('returns all trigger IDs in user storage from a given address', () => {
    const partialStorage = createMockUserStorageWithTriggers(['t1', 't2']);

    const result = Utils.getUUIDsForAccount(
      partialStorage,
      MOCK_USER_STORAGE_ACCOUNT,
    );
    expect(result).toHaveLength(2);
    expect(result).toContain('t1');
    expect(result).toContain('t2');
  });
  it('returns an empty array if the address does not exist or has any triggers', () => {
    const partialStorage = createMockUserStorageWithTriggers(['t1', 't2']);
    const result = Utils.getUUIDsForAccount(
      partialStorage,
      'ACCOUNT_THAT_DOES_NOT_EXIST_IN_STORAGE',
    );
    expect(result).toHaveLength(0);
  });
});

describe('metamask-notifications/utils - getAllUUIDs()', () => {
  it('returns all triggerIds in User Storage', () => {
    const partialStorage = createMockUserStorageWithTriggers(['t1', 't2']);
    const result1 = Utils.getAllUUIDs(partialStorage);
    expect(result1).toHaveLength(2);
    expect(result1).toContain('t1');
    expect(result1).toContain('t2');

    const fullStorage = createMockFullUserStorage();
    const result2 = Utils.getAllUUIDs(fullStorage);
    expect(result2.length).toBeGreaterThan(2); // we expect there to be more than 2 triggers. We have multiple chains to there should be quite a few UUIDs.
  });
});

describe('metamask-notifications/utils - getUUIDsForKinds()', () => {
  it('returns all triggerIds that match the kind', () => {
    const partialStorage = createMockUserStorageWithTriggers([
      { id: 't1', e: true, k: TRIGGER_TYPES.ERC1155_RECEIVED },
      { id: 't2', e: true, k: TRIGGER_TYPES.ERC1155_SENT },
    ]);
    const result = Utils.getUUIDsForKinds(partialStorage, [
      TRIGGER_TYPES.ERC1155_RECEIVED,
    ]);
    expect(result).toStrictEqual(['t1']);
  });

  it('returns empty list if no triggers are found matching the kinds', () => {
    const partialStorage = createMockUserStorageWithTriggers([
      { id: 't1', e: true, k: TRIGGER_TYPES.ERC1155_RECEIVED },
      { id: 't2', e: true, k: TRIGGER_TYPES.ERC1155_SENT },
    ]);
    const result = Utils.getUUIDsForKinds(partialStorage, [
      TRIGGER_TYPES.ETH_SENT, // A kind we have not created a trigger for
    ]);
    expect(result).toHaveLength(0);
  });
});

describe('metamask-notifications/utils - getUUIDsForAccountByKinds()', () => {
  const createPartialStorage = () =>
    createMockUserStorageWithTriggers([
      { id: 't1', e: true, k: TRIGGER_TYPES.ERC1155_RECEIVED },
      { id: 't2', e: true, k: TRIGGER_TYPES.ERC1155_SENT },
    ]);

  it('returns triggers with correct account and matching kinds', () => {
    const partialStorage = createPartialStorage();
    const result = Utils.getUUIDsForAccountByKinds(
      partialStorage,
      MOCK_USER_STORAGE_ACCOUNT,
      [TRIGGER_TYPES.ERC1155_RECEIVED],
    );
    expect(result).toHaveLength(1);
  });

  it('returns empty when using incorrect account', () => {
    const partialStorage = createPartialStorage();
    const result = Utils.getUUIDsForAccountByKinds(
      partialStorage,
      'ACCOUNT_THAT_DOES_NOT_EXIST_IN_STORAGE',
      [TRIGGER_TYPES.ERC1155_RECEIVED],
    );
    expect(result).toHaveLength(0);
  });

  it('returns empty when using incorrect kind', () => {
    const partialStorage = createPartialStorage();
    const result = Utils.getUUIDsForAccountByKinds(
      partialStorage,
      MOCK_USER_STORAGE_ACCOUNT,
      [TRIGGER_TYPES.ETH_SENT], // this trigger was not created in partial storage
    );
    expect(result).toHaveLength(0);
  });
});

describe('metamask-notifications/utils - upsertAddressTriggers()', () => {
  it('updates and adds new triggers for a new address', () => {
    const MOCK_NEW_ADDRESS = 'MOCK_NEW_ADDRESS'.toLowerCase(); // addresses stored in user storage are lower-case
    const storage = createMockFullUserStorage();

    // Before
    expect(storage[MOCK_NEW_ADDRESS]).toBeUndefined();

    Utils.upsertAddressTriggers(MOCK_NEW_ADDRESS, storage);

    // After
    expect(storage[MOCK_NEW_ADDRESS]).toBeDefined();
    const newTriggers = Utils.getUUIDsForAccount(storage, MOCK_NEW_ADDRESS);
    expect(newTriggers.length > 0).toBe(true);
  });
});

describe('metamask-notifications/utils - upsertTriggerTypeTriggers()', () => {
  it('updates and adds a new trigger to an address', () => {
    const partialStorage = createMockUserStorageWithTriggers([
      { id: 't1', e: true, k: TRIGGER_TYPES.ERC1155_RECEIVED },
      { id: 't2', e: true, k: TRIGGER_TYPES.ERC1155_SENT },
    ]);

    // Before
    expect(
      Utils.getUUIDsForAccount(partialStorage, MOCK_USER_STORAGE_ACCOUNT),
    ).toHaveLength(2);

    Utils.upsertTriggerTypeTriggers(TRIGGER_TYPES.ETH_SENT, partialStorage);

    // After
    expect(
      Utils.getUUIDsForAccount(partialStorage, MOCK_USER_STORAGE_ACCOUNT),
    ).toHaveLength(3);
  });
});

describe('metamask-notifications/utils - toggleUserStorageTriggerStatus()', () => {
  it('updates Triggers from disabled to enabled', () => {
    // Triggers are initially set to false false.
    const partialStorage = createMockUserStorageWithTriggers([
      { id: 't1', k: TRIGGER_TYPES.ERC1155_RECEIVED, e: false },
      { id: 't2', k: TRIGGER_TYPES.ERC1155_SENT, e: false },
    ]);

    Utils.toggleUserStorageTriggerStatus(
      partialStorage,
      MOCK_USER_STORAGE_ACCOUNT,
      MOCK_USER_STORAGE_CHAIN,
      't1',
      true,
    );

    expect(
      partialStorage[MOCK_USER_STORAGE_ACCOUNT][MOCK_USER_STORAGE_CHAIN].t1.e,
    ).toBe(true);
  });
});
