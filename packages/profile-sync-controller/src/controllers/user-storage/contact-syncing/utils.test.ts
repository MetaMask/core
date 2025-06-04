import type { AddressBookEntry } from '@metamask/address-book-controller';
import { toChecksumHexAddress } from '@metamask/controller-utils';

import { USER_STORAGE_VERSION, USER_STORAGE_VERSION_KEY } from './constants';
import type { UserStorageContactEntry } from './types';
import {
  mapAddressBookEntryToUserStorageEntry,
  mapUserStorageEntryToAddressBookEntry,
  type SyncAddressBookEntry,
} from './utils';

describe('user-storage/contact-syncing/utils', () => {
  // Use checksum address format for consistent testing
  const mockAddress = '0x123456789012345678901234567890abCdEF1234';
  const mockChainId = '0x1';
  const mockName = 'Test Contact';
  const mockMemo = 'This is a test contact';
  const mockTimestamp = 1657000000000;
  const mockDeletedTimestamp = 1657000100000;

  beforeEach(() => {
    // Mock Date.now() to return a fixed timestamp for consistent testing
    jest.spyOn(Date, 'now').mockImplementation(() => mockTimestamp);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('mapAddressBookEntryToUserStorageEntry', () => {
    it('should map a basic address book entry to a user storage entry', () => {
      const addressBookEntry: AddressBookEntry = {
        address: mockAddress,
        chainId: mockChainId,
        name: mockName,
        memo: mockMemo,
        isEns: false,
      };

      const userStorageEntry =
        mapAddressBookEntryToUserStorageEntry(addressBookEntry);

      expect(userStorageEntry).toStrictEqual({
        [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
        a: mockAddress,
        n: mockName,
        c: mockChainId,
        m: mockMemo,
        // lu will be generated with Date.now(), so we just check it exists
        lu: expect.any(Number),
      });
    });

    it('should map an address book entry with a timestamp to a user storage entry', () => {
      const addressBookEntry = {
        address: mockAddress,
        chainId: mockChainId as `0x${string}`,
        name: mockName,
        memo: mockMemo,
        isEns: false,
        lastUpdatedAt: mockTimestamp,
      } as SyncAddressBookEntry;

      const userStorageEntry =
        mapAddressBookEntryToUserStorageEntry(addressBookEntry);

      expect(userStorageEntry).toStrictEqual({
        [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
        a: mockAddress,
        n: mockName,
        c: mockChainId,
        m: mockMemo,
        lu: mockTimestamp,
      });
    });

    it('should map a deleted address book entry to a user storage entry', () => {
      const addressBookEntry = {
        address: mockAddress,
        chainId: mockChainId as `0x${string}`,
        name: mockName,
        memo: mockMemo,
        isEns: false,
        lastUpdatedAt: mockTimestamp,
        deletedAt: mockDeletedTimestamp,
      } as SyncAddressBookEntry;

      const userStorageEntry =
        mapAddressBookEntryToUserStorageEntry(addressBookEntry);

      expect(userStorageEntry).toStrictEqual({
        [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
        a: mockAddress,
        n: mockName,
        c: mockChainId,
        m: mockMemo,
        lu: mockTimestamp,
        dt: mockDeletedTimestamp,
      });
    });

    it('should handle empty memo field', () => {
      const addressBookEntry: AddressBookEntry = {
        address: mockAddress,
        chainId: mockChainId,
        name: mockName,
        memo: '',
        isEns: false,
      };

      const userStorageEntry =
        mapAddressBookEntryToUserStorageEntry(addressBookEntry);

      expect(userStorageEntry).toStrictEqual({
        [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
        a: mockAddress,
        n: mockName,
        c: mockChainId,
        lu: expect.any(Number),
      });

      // Ensure memo is not included when empty
      expect(userStorageEntry.m).toBeUndefined();
    });
  });

  describe('mapUserStorageEntryToAddressBookEntry', () => {
    it('should map a basic user storage entry to an address book entry', () => {
      const userStorageEntry: UserStorageContactEntry = {
        [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
        a: mockAddress,
        n: mockName,
        c: mockChainId,
        m: mockMemo,
        lu: mockTimestamp,
      };

      const addressBookEntry =
        mapUserStorageEntryToAddressBookEntry(userStorageEntry);

      expect(addressBookEntry).toStrictEqual({
        address: mockAddress,
        chainId: mockChainId,
        name: mockName,
        memo: mockMemo,
        isEns: false,
        lastUpdatedAt: mockTimestamp,
      });
    });

    it('should map a deleted user storage entry to an address book entry', () => {
      const userStorageEntry: UserStorageContactEntry = {
        [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
        a: mockAddress,
        n: mockName,
        c: mockChainId,
        m: mockMemo,
        lu: mockTimestamp,
        dt: mockDeletedTimestamp,
      };

      const addressBookEntry =
        mapUserStorageEntryToAddressBookEntry(userStorageEntry);

      expect(addressBookEntry).toStrictEqual({
        address: mockAddress,
        chainId: mockChainId,
        name: mockName,
        memo: mockMemo,
        isEns: false,
        lastUpdatedAt: mockTimestamp,
        deletedAt: mockDeletedTimestamp,
      });
    });

    it('should handle missing optional fields', () => {
      const userStorageEntry: UserStorageContactEntry = {
        [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
        a: mockAddress,
        n: mockName,
        c: mockChainId,
      };

      const addressBookEntry =
        mapUserStorageEntryToAddressBookEntry(userStorageEntry);

      expect(addressBookEntry).toStrictEqual({
        address: mockAddress,
        chainId: mockChainId,
        name: mockName,
        memo: '',
        isEns: false,
      });
    });

    it('should normalize addresses to checksummed format', () => {
      // Use lowercase address for this test specifically
      const lowerCaseAddress = mockAddress.toLowerCase();
      const userStorageEntry: UserStorageContactEntry = {
        [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
        a: lowerCaseAddress,
        n: mockName,
        c: mockChainId,
      };

      const addressBookEntry =
        mapUserStorageEntryToAddressBookEntry(userStorageEntry);

      expect(addressBookEntry.address).toBe(
        toChecksumHexAddress(lowerCaseAddress),
      );
      // Also verify it matches our mockAddress which is already in checksum format
      expect(addressBookEntry.address).toBe(mockAddress);
    });
  });
});
