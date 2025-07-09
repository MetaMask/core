import { createSHA256Hash } from './encryption';

/**
 * The User Storage Endpoint requires a feature name and a namespace key.
 * Any user storage path should be in the form of `feature.key`.
 */

/**
 * Helper object that contains the feature names used in the controllers and SDK.
 * Developers don't need to add new feature names to this object anymore, as the schema enforcement has been deprecated.
 */
export const USER_STORAGE_FEATURE_NAMES = {
  notifications: 'notifications',
  accounts: 'accounts_v2',
  networks: 'networks',
  addressBook: 'addressBook',
};

export type UserStorageGenericFeatureName = string;
export type UserStorageGenericFeatureKey = string;
export type UserStorageGenericPathWithFeatureAndKey =
  `${UserStorageGenericFeatureName}.${UserStorageGenericFeatureKey}`;
export type UserStorageGenericPathWithFeatureOnly =
  UserStorageGenericFeatureName;

type UserStorageGenericFeatureAndKey = {
  feature: UserStorageGenericFeatureName;
  key: UserStorageGenericFeatureKey;
};

export const getFeatureAndKeyFromPath = (
  path: UserStorageGenericPathWithFeatureAndKey,
): UserStorageGenericFeatureAndKey => {
  const pathRegex = /^\w+\.\w+$/u;

  if (!pathRegex.test(path)) {
    throw new Error(
      `user-storage - path is not in the correct format. Correct format: 'feature.key'`,
    );
  }

  const [feature, key] = path.split('.');

  return { feature, key } as UserStorageGenericFeatureAndKey;
};

/**
 * Constructs a unique entry path for a user.
 * This can be done due to the uniqueness of the storage key (no users will share the same storage key).
 * The users entry is a unique hash that cannot be reversed.
 *
 * @param path - string in the form of `${feature}.${key}` that matches schema
 * @param storageKey - users storage key
 * @returns path to store entry
 */
export function createEntryPath(
  path: UserStorageGenericPathWithFeatureAndKey,
  storageKey: string,
): string {
  const { feature, key } = getFeatureAndKeyFromPath(path);
  const hashedKey = createSHA256Hash(key + storageKey);

  return `${feature}/${hashedKey}`;
}
