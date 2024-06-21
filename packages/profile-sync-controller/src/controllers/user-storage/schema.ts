import { createSHA256Hash } from './encryption';

type UserStorageEntry = { path: string; entryName: string };

/**
 * The User Storage Endpoint requires a path and an entry name.
 * Developers can provide additional paths by extending this variable below
 */
export const USER_STORAGE_ENTRIES = {
  notificationSettings: {
    path: 'notifications',
    entryName: 'notificationSettings',
  },
} satisfies Record<string, UserStorageEntry>;

export type UserStorageEntryKeys = keyof typeof USER_STORAGE_ENTRIES;

/**
 * Constructs a unique entry path for a user.
 * This can be done due to the uniqueness of the storage key (no users will share the same storage key).
 * The users entry is a unique hash that cannot be reversed.
 *
 * @param entryKey - storage schema entry key
 * @param storageKey - users storage key
 * @returns path to store entry
 */
export function createEntryPath(
  entryKey: UserStorageEntryKeys,
  storageKey: string,
): string {
  const entry = USER_STORAGE_ENTRIES[entryKey];
  if (!entry) {
    throw new Error(`user-storage - invalid entry provided: ${entryKey}`);
  }

  const hashedKey = createSHA256Hash(entry.entryName + storageKey);
  return `/${entry.path}/${hashedKey}`;
}
