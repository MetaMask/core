import { AutorampStatus, createAutorampAccount } from '../autorampAccount.js';
import {
  USER_STORAGE_VERSION,
  USER_STORAGE_VERSION_KEY,
} from './constants.js';
import {
  areAutorampsEqual,
  createAutorampStorageKey,
  isSyncableAutoramp,
  mapAutorampToUserStorageEntry,
  mapUserStorageEntryToAutoramp,
  stripAutorampSyncMetadata,
} from './format-utils.js';

describe('autoramp-syncing/format-utils', () => {
  const account = createAutorampAccount({
    id: 'ar-1',
    customerId: 'cust-1',
    walletAddress: '0xabc',
    status: AutorampStatus.Approved,
    updatedAt: 1000,
    depositRailsSummary: { ready: true, currency: 'EUR' },
  });

  it('creates storage keys from id', () => {
    expect(createAutorampStorageKey(account)).toBe('ar-1');
    expect(createAutorampStorageKey('ar-2')).toBe('ar-2');
  });

  it('detects syncable autoramps', () => {
    expect(isSyncableAutoramp(account)).toBe(true);
    expect(isSyncableAutoramp({ id: '' })).toBe(false);
    expect(isSyncableAutoramp(null)).toBe(false);
  });

  it('maps to user storage without deposit rails', () => {
    const entry = mapAutorampToUserStorageEntry({
      ...account,
      notifiedForStatus: AutorampStatus.Approved,
    });

    expect(entry).toStrictEqual({
      [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
      o: {
        id: 'ar-1',
        customerId: 'cust-1',
        walletAddress: '0xabc',
        status: AutorampStatus.Approved,
        lastSeenStatus: AutorampStatus.Approved,
        notifiedForStatus: AutorampStatus.Approved,
      },
      lu: 1000,
    });
    expect(entry.o).not.toHaveProperty('depositRailsSummary');
  });

  it('round-trips storage entries and strips deletedAt', () => {
    const entry = mapAutorampToUserStorageEntry({
      ...account,
      deletedAt: 2000,
    });
    const mapped = mapUserStorageEntryToAutoramp(entry);
    expect(mapped.deletedAt).toBe(2000);
    expect(stripAutorampSyncMetadata(mapped)).not.toHaveProperty('deletedAt');
  });

  it('compares sync-relevant fields', () => {
    expect(areAutorampsEqual(account, { ...account })).toBe(true);
    expect(
      areAutorampsEqual(account, {
        ...account,
        status: AutorampStatus.Authorized,
      }),
    ).toBe(false);
  });
});
