import type { InternalAccount } from '@metamask/keyring-api';

import {
  MOCK_INTERNAL_ACCOUNTS_LISTS,
  MOCK_USER_STORAGE_ACCOUNTS_LISTS,
  getMockRandomDefaultAccountName,
} from '../__fixtures__/mockAccounts';
import {
  extractUserStorageAccountsListFromResponse,
  formatUserStorageAccountsListPayload,
  isNameDefaultAccountName,
  mapInternalAccountsListToUserStorageAccountsList,
} from './user-storage';

describe('user-storage/acounts/extractUserStorageAccountsListFromResponse', () => {
  it('should return null if response is null or empty', () => {
    expect(extractUserStorageAccountsListFromResponse(null)).toBeNull();
    expect(extractUserStorageAccountsListFromResponse('')).toBeNull();
  });

  it('should return the list if response is valid', () => {
    expect(
      extractUserStorageAccountsListFromResponse(
        `{"v":1,"l":${JSON.stringify(
          MOCK_USER_STORAGE_ACCOUNTS_LISTS.SAME_AS_INTERNAL_FULL,
        )}}`,
      ),
    ).toStrictEqual(MOCK_USER_STORAGE_ACCOUNTS_LISTS.SAME_AS_INTERNAL_FULL);
  });
});

describe('user-storage/acounts/formatUserStorageAccountsListPayload', () => {
  it('should format the list correctly', () => {
    expect(
      formatUserStorageAccountsListPayload(
        MOCK_USER_STORAGE_ACCOUNTS_LISTS.SAME_AS_INTERNAL_FULL.l,
      ),
    ).toStrictEqual({
      v: '1',
      l: MOCK_USER_STORAGE_ACCOUNTS_LISTS.SAME_AS_INTERNAL_FULL.l,
    });
  });
});

describe('user-storage/acounts/isNameDefaultAccountName', () => {
  it('should return true for default account names', () => {
    expect(
      isNameDefaultAccountName(`${getMockRandomDefaultAccountName()} 89`),
    ).toBe(true);
    expect(
      isNameDefaultAccountName(`${getMockRandomDefaultAccountName()} 1`),
    ).toBe(true);
    expect(
      isNameDefaultAccountName(`${getMockRandomDefaultAccountName()} 123543`),
    ).toBe(true);
  });

  it('should return false for non-default account names', () => {
    expect(isNameDefaultAccountName('My Account')).toBe(false);
    expect(isNameDefaultAccountName('Mon compte 34')).toBe(false);
  });
});

describe('user-storage/acounts/mapInternalAccountsListToUserStorageAccountsList', () => {
  it('should map the list correctly', () => {
    expect(
      mapInternalAccountsListToUserStorageAccountsList(
        MOCK_INTERNAL_ACCOUNTS_LISTS.ALL as InternalAccount[],
      ),
    ).toStrictEqual(MOCK_USER_STORAGE_ACCOUNTS_LISTS.SAME_AS_INTERNAL_FULL.l);
  });
});
