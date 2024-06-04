/* eslint-disable jsdoc/require-returns */
/* eslint-disable jsdoc/require-description */
/* eslint-disable jsdoc/require-jsdoc */
import {
  MOCK_USER_STORAGE_ACCOUNT,
  MOCK_USER_STORAGE_CHAIN,
  createMockFullUserStorage,
  createMockUserStorageWithTriggers,
} from '../../tests/mocks/mock-notification-user-storage';
import { USER_STORAGE_VERSION_KEY } from '../constants/constants';
import {
  NOTIFICATION_CHAINS,
  TriggerType,
} from '../constants/notification-schema';
import type { UserStorage } from '../types/user-storage/user-storage';
import * as MetamaskNotificationsUtils from './utils';

describe('metamask-notifications/utils - initializeUserStorage()', () => {
  it('creates a new user storage object based on the accounts provided', () => {
    const mockAddress = 'MOCK_ADDRESS';
    const userStorage = MetamaskNotificationsUtils.initializeUserStorage(
      [{ address: mockAddress }],
      true,
    );

    // Addresses in User Storage are lowercase to prevent multiple entries of same address
    const userStorageAddress = mockAddress.toLowerCase();
    expect(userStorage[userStorageAddress]).toBeDefined();
  });

  it('returns User Storage with no addresses if none provided', () => {
    /**
     *
     * @param storage
     */
    function assertEmptyStorage(storage: UserStorage) {
      expect(Object.keys(storage).length === 1).toBe(true);
      expect(USER_STORAGE_VERSION_KEY in storage).toBe(true);
    }

    const userStorageTest1 = MetamaskNotificationsUtils.initializeUserStorage(
      [],
      true,
    );
    assertEmptyStorage(userStorageTest1);

    const userStorageTest2 = MetamaskNotificationsUtils.initializeUserStorage(
      [{ address: undefined }],
      true,
    );
    assertEmptyStorage(userStorageTest2);
  });
});

describe('metamask-notifications/utils - traverseUserStorageTriggers()', () => {
  it('traverses User Storage to return triggers', () => {
    const storage = createMockFullUserStorage();
    const triggersObjArray =
      MetamaskNotificationsUtils.traverseUserStorageTriggers(storage);
    expect(triggersObjArray.length > 0).toBe(true);
    expect(typeof triggersObjArray[0] === 'object').toBe(true);
  });

  it('traverses and maps User Storage using mapper', () => {
    const storage = createMockFullUserStorage();

    // as the type suggests, the mapper returns a string, so expect this to be a string
    const triggersStrArray =
      MetamaskNotificationsUtils.traverseUserStorageTriggers(storage, {
        mapTrigger: (t) => t.id,
      });
    expect(triggersStrArray.length > 0).toBe(true);
    expect(typeof triggersStrArray[0] === 'string').toBe(true);

    // if the mapper returns a falsy value, it is filtered out
    const emptyTriggersArray =
      MetamaskNotificationsUtils.traverseUserStorageTriggers(storage, {
        mapTrigger: (_t): string | undefined => undefined,
      });
    expect(emptyTriggersArray.length === 0).toBe(true);
  });
});

describe('metamask-notifications/utils - checkAccountsPresence()', () => {
  it('returns record of addresses that are in storage', () => {
    const storage = createMockFullUserStorage();
    const result = MetamaskNotificationsUtils.checkAccountsPresence(storage, [
      MOCK_USER_STORAGE_ACCOUNT,
    ]);
    expect(result).toStrictEqual({
      [MOCK_USER_STORAGE_ACCOUNT.toLowerCase()]: true,
    });
  });

  it('returns record of addresses in storage and not fully in storage', () => {
    const storage = createMockFullUserStorage();
    const MOCK_MISSING_ADDRESS = '0x2';
    const result = MetamaskNotificationsUtils.checkAccountsPresence(storage, [
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

    const result = MetamaskNotificationsUtils.checkAccountsPresence(storage, [
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

    const result = MetamaskNotificationsUtils.checkAccountsPresence(storage, [
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
      { id: '1', e: true, k: TriggerType.Erc1155Received },
      { id: '2', e: true, k: TriggerType.Erc1155Sent },
      { id: '3', e: true, k: TriggerType.Erc1155Sent }, // should remove duplicates
    ]);

    const result = MetamaskNotificationsUtils.inferEnabledKinds(partialStorage);
    expect(result).toHaveLength(2);
    expect(result).toContain(TriggerType.Erc1155Received);
    expect(result).toContain(TriggerType.Erc1155Sent);
  });
});

describe('metamask-notifications/utils - getUUIDsForAccount()', () => {
  it('returns all trigger IDs in user storage from a given address', () => {
    const partialStorage = createMockUserStorageWithTriggers(['t1', 't2']);

    const result = MetamaskNotificationsUtils.getUUIDsForAccount(
      partialStorage,
      MOCK_USER_STORAGE_ACCOUNT,
    );
    expect(result).toHaveLength(2);
    expect(result).toContain('t1');
    expect(result).toContain('t2');
  });
  it('returns an empty array if the address does not exist or has any triggers', () => {
    const partialStorage = createMockUserStorageWithTriggers(['t1', 't2']);
    const result = MetamaskNotificationsUtils.getUUIDsForAccount(
      partialStorage,
      'ACCOUNT_THAT_DOES_NOT_EXIST_IN_STORAGE',
    );
    expect(result).toHaveLength(0);
  });
});

describe('metamask-notifications/utils - getAllUUIDs()', () => {
  it('returns all triggerIds in User Storage', () => {
    const partialStorage = createMockUserStorageWithTriggers(['t1', 't2']);
    const result1 = MetamaskNotificationsUtils.getAllUUIDs(partialStorage);
    expect(result1).toHaveLength(2);
    expect(result1).toContain('t1');
    expect(result1).toContain('t2');

    const fullStorage = createMockFullUserStorage();
    const result2 = MetamaskNotificationsUtils.getAllUUIDs(fullStorage);
    expect(result2.length).toBeGreaterThan(2); // we expect there to be more than 2 triggers. We have multiple chains to there should be quite a few UUIDs.
  });
});

describe('metamask-notifications/utils - getUUIDsForKinds()', () => {
  it('returns all triggerIds that match the kind', () => {
    const partialStorage = createMockUserStorageWithTriggers([
      { id: 't1', e: true, k: TriggerType.Erc1155Received },
      { id: 't2', e: true, k: TriggerType.Erc1155Sent },
    ]);
    const result = MetamaskNotificationsUtils.getUUIDsForKinds(partialStorage, [
      TriggerType.Erc1155Received,
    ]);
    expect(result).toStrictEqual(['t1']);
  });

  it('returns empty list if no triggers are found matching the kinds', () => {
    const partialStorage = createMockUserStorageWithTriggers([
      { id: 't1', e: true, k: TriggerType.Erc1155Received },
      { id: 't2', e: true, k: TriggerType.Erc1155Sent },
    ]);
    const result = MetamaskNotificationsUtils.getUUIDsForKinds(partialStorage, [
      TriggerType.EthSent, // A kind we have not created a trigger for
    ]);
    expect(result).toHaveLength(0);
  });
});

describe('metamask-notifications/utils - getUUIDsForAccountByKinds()', () => {
  const createPartialStorage = () =>
    createMockUserStorageWithTriggers([
      { id: 't1', e: true, k: TriggerType.Erc1155Received },
      { id: 't2', e: true, k: TriggerType.Erc1155Sent },
    ]);

  it('returns triggers with correct account and matching kinds', () => {
    const partialStorage = createPartialStorage();
    const result = MetamaskNotificationsUtils.getUUIDsForAccountByKinds(
      partialStorage,
      MOCK_USER_STORAGE_ACCOUNT,
      [TriggerType.Erc1155Received],
    );
    expect(result).toHaveLength(1);
  });

  it('returns empty when using incorrect account', () => {
    const partialStorage = createPartialStorage();
    const result = MetamaskNotificationsUtils.getUUIDsForAccountByKinds(
      partialStorage,
      'ACCOUNT_THAT_DOES_NOT_EXIST_IN_STORAGE',
      [TriggerType.Erc1155Received],
    );
    expect(result).toHaveLength(0);
  });

  it('returns empty when using incorrect kind', () => {
    const partialStorage = createPartialStorage();
    const result = MetamaskNotificationsUtils.getUUIDsForAccountByKinds(
      partialStorage,
      MOCK_USER_STORAGE_ACCOUNT,
      [TriggerType.EthSent], // this trigger was not created in partial storage
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

    MetamaskNotificationsUtils.upsertAddressTriggers(MOCK_NEW_ADDRESS, storage);

    // After
    expect(storage[MOCK_NEW_ADDRESS]).toBeDefined();
    const newTriggers = MetamaskNotificationsUtils.getUUIDsForAccount(
      storage,
      MOCK_NEW_ADDRESS,
    );
    expect(newTriggers.length > 0).toBe(true);
  });
});

describe('metamask-notifications/utils - upsertTriggerTypeTriggers()', () => {
  it('updates and adds a new trigger to an address', () => {
    const partialStorage = createMockUserStorageWithTriggers([
      { id: 't1', e: true, k: TriggerType.Erc1155Received },
      { id: 't2', e: true, k: TriggerType.Erc1155Sent },
    ]);

    // Before
    expect(
      MetamaskNotificationsUtils.getUUIDsForAccount(
        partialStorage,
        MOCK_USER_STORAGE_ACCOUNT,
      ),
    ).toHaveLength(2);

    MetamaskNotificationsUtils.upsertTriggerTypeTriggers(
      TriggerType.EthSent,
      partialStorage,
    );

    // After
    expect(
      MetamaskNotificationsUtils.getUUIDsForAccount(
        partialStorage,
        MOCK_USER_STORAGE_ACCOUNT,
      ),
    ).toHaveLength(3);
  });
});

describe('metamask-notifications/utils - toggleUserStorageTriggerStatus()', () => {
  it('updates Triggers from disabled to enabled', () => {
    // Triggers are initially set to false false.
    const partialStorage = createMockUserStorageWithTriggers([
      { id: 't1', k: TriggerType.Erc1155Received, e: false },
      { id: 't2', k: TriggerType.Erc1155Sent, e: false },
    ]);

    MetamaskNotificationsUtils.toggleUserStorageTriggerStatus(
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
