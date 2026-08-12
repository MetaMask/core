import type { AutorampAccount } from '../autorampAccount.js';
import { normalizeAutorampStatus } from '../autorampAccount.js';
import {
  USER_STORAGE_VERSION,
  USER_STORAGE_VERSION_KEY,
} from './constants.js';
import type {
  SyncAutorampAccount,
  UserStorageAutorampEntry,
} from './types.js';

/**
 * Storage key for an autoramp entry (MoonPay autoramp id).
 *
 * @param account - Autoramp account or id-bearing object.
 * @returns Storage key string.
 */
export function createAutorampStorageKey(
  account: Pick<AutorampAccount, 'id'> | string,
): string {
  return typeof account === 'string' ? account : account.id;
}

/**
 * Whether an autoramp has the minimum fields required to sync.
 *
 * @param account - Candidate autoramp.
 * @returns True when syncable.
 */
export function isSyncableAutoramp(
  account: Partial<AutorampAccount> | null | undefined,
): account is AutorampAccount {
  return Boolean(
    account &&
      typeof account.id === 'string' &&
      account.id.length > 0 &&
      typeof account.customerId === 'string' &&
      typeof account.walletAddress === 'string' &&
      account.status,
  );
}

/**
 * Map a local autoramp to a User Storage entry (strips depositRailsSummary).
 *
 * @param account - Local or sync-aware autoramp.
 * @returns Compact storage entry.
 */
export function mapAutorampToUserStorageEntry(
  account: SyncAutorampAccount,
): UserStorageAutorampEntry {
  const now = Date.now();
  return {
    [USER_STORAGE_VERSION_KEY]: USER_STORAGE_VERSION,
    o: {
      id: account.id,
      customerId: account.customerId,
      walletAddress: account.walletAddress,
      status: account.status,
      lastSeenStatus: account.lastSeenStatus,
      ...(account.notifiedForStatus
        ? { notifiedForStatus: account.notifiedForStatus }
        : {}),
    },
    lu: account.updatedAt || now,
    ...(account.deletedAt ? { dt: account.deletedAt } : {}),
  };
}

/**
 * Map a User Storage entry back to a sync-aware autoramp account.
 *
 * @param entry - Remote storage entry.
 * @returns Sync autoramp (no depositRailsSummary).
 */
export function mapUserStorageEntryToAutoramp(
  entry: UserStorageAutorampEntry,
): SyncAutorampAccount {
  return {
    id: entry.o.id,
    customerId: entry.o.customerId,
    walletAddress: entry.o.walletAddress,
    status: normalizeAutorampStatus(entry.o.status),
    lastSeenStatus: normalizeAutorampStatus(entry.o.lastSeenStatus),
    ...(entry.o.notifiedForStatus
      ? {
          notifiedForStatus: normalizeAutorampStatus(entry.o.notifiedForStatus),
        }
      : {}),
    updatedAt: entry.lu ?? Date.now(),
    ...(entry.dt ? { deletedAt: entry.dt } : {}),
  };
}

/**
 * Strip sync-only metadata before writing into controller state.
 *
 * @param account - Sync-aware autoramp.
 * @returns Plain {@link AutorampAccount}.
 */
export function stripAutorampSyncMetadata(
  account: SyncAutorampAccount,
): AutorampAccount {
  const { deletedAt: _deletedAt, ...rest } = account;
  return rest;
}

/**
 * Compare syncable fields for equality (ignores depositRailsSummary).
 *
 * @param left - First account.
 * @param right - Second account.
 * @returns True when sync-relevant fields match.
 */
export function areAutorampsEqual(
  left: SyncAutorampAccount,
  right: SyncAutorampAccount,
): boolean {
  return (
    left.id === right.id &&
    left.customerId === right.customerId &&
    left.walletAddress === right.walletAddress &&
    left.status === right.status &&
    left.lastSeenStatus === right.lastSeenStatus &&
    left.notifiedForStatus === right.notifiedForStatus
  );
}
