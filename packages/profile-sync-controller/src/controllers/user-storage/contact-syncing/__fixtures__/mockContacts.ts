import type { AddressBookEntry } from '@metamask/address-book-controller';

import { USER_STORAGE_VERSION, USER_STORAGE_VERSION_KEY } from '../constants';
import type { UserStorageContactEntry } from '../types';

// Base timestamp for predictable testing
const NOW = 1657000000000;

// Local AddressBookEntry mock objects
export const MOCK_LOCAL_CONTACTS = {
  // One contact on chain 1
  ONE: [
    {
      address: '0x123456789012345678901234567890abcdef1234',
      name: 'Contact One',
      chainId: '0x1',
      memo: 'First contact',
      isEns: false,
      lastUpdatedAt: NOW,
    } as AddressBookEntry,
  ],

  // Two contacts on different chains
  TWO_DIFF_CHAINS: [
    {
      address: '0x123456789012345678901234567890abcdef1234',
      name: 'Contact One',
      chainId: '0x1',
      memo: 'First contact',
      isEns: false,
      lastUpdatedAt: NOW,
    } as AddressBookEntry,
    {
      address: '0x123456789012345678901234567890abcdef1234',
      name: 'Contact One on Goerli',
      chainId: '0x5',
      memo: 'Goerli test contact',
      isEns: false,
      lastUpdatedAt: NOW,
    } as AddressBookEntry,
  ],

  // Same contact as remote but different name (newer)
  ONE_UPDATED_NAME: [
    {
      address: '0x123456789012345678901234567890abcdef1234',
      name: 'Contact One Updated',
      chainId: '0x1',
      memo: 'First contact',
      isEns: false,
      lastUpdatedAt: NOW + 1000,
    } as AddressBookEntry,
  ],
};

// Remote UserStorageContactEntry mock objects
export const MOCK_REMOTE_CONTACTS = {
  // One contact on chain 1
  ONE: [
    {
      [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
      a: '0x123456789012345678901234567890abcdef1234',
      n: 'Contact One',
      c: '0x1',
      m: 'First contact',
      lu: NOW,
    } as UserStorageContactEntry,
  ],

  // Two contacts on different chains
  TWO_DIFF_CHAINS: [
    {
      [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
      a: '0x123456789012345678901234567890abcdef1234',
      n: 'Contact One',
      c: '0x1',
      m: 'First contact',
      lu: NOW,
    } as UserStorageContactEntry,
    {
      [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
      a: '0x123456789012345678901234567890abcdef1234',
      n: 'Contact One on Goerli',
      c: '0x5',
      m: 'Goerli test contact',
      lu: NOW,
    } as UserStorageContactEntry,
  ],

  // Different contact than local
  ONE_DIFFERENT: [
    {
      [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
      a: '0xabcdef1234567890123456789012345678901234',
      n: 'Different Contact',
      c: '0x1',
      m: 'Another contact',
      lu: NOW,
    } as UserStorageContactEntry,
  ],

  // Same contact as local but with different name
  ONE_DIFFERENT_NAME: [
    {
      [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
      a: '0x123456789012345678901234567890abcdef1234',
      n: 'Contact One Old Name',
      c: '0x1',
      m: 'First contact',
      lu: NOW - 1000, // Older timestamp
    } as UserStorageContactEntry,
  ],

  // Deleted contact
  ONE_DELETED: [
    {
      [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
      a: '0x123456789012345678901234567890abcdef1234',
      n: 'Contact One',
      c: '0x1',
      m: 'First contact',
      lu: NOW,
      d: true,
      dt: NOW + 1000,
    } as unknown as UserStorageContactEntry,
  ],
};
