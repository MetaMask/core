import { createSHA256Hash } from './encryption';

/**
 * The User Storage Endpoint requires a feature name and a namespace key.
 * Developers can provide additional features and keys by extending these types below.
 */

export const USER_STORAGE_SCHEMA = {
  notifications: ['notificationSettings'],
} as const;

type UserStorageSchema = typeof USER_STORAGE_SCHEMA;
type UserStorageFeatures = keyof UserStorageSchema;
type UserStorageFeatureKeys<Feature extends UserStorageFeatures> =
  UserStorageSchema[Feature][number];

type UserStorageFeatureAndKey = {
  feature: UserStorageFeatures;
  key: UserStorageFeatureKeys<UserStorageFeatures>;
};

export type UserStoragePath = {
  [K in keyof UserStorageSchema]: `${K}.${UserStorageSchema[K][number]}`;
}[keyof UserStorageSchema];

export const getFeatureAndKeyFromPath = (
  path: UserStoragePath,
): UserStorageFeatureAndKey => {
  const pathRegex = /^\w+\.\w+$/u;

  if (!pathRegex.test(path)) {
    throw new Error(
      `user-storage - path is not in the correct format. Correct format: 'feature.key'`,
    );
  }

  const [feature, key] = path.split('.') as [
    UserStorageFeatures,
    UserStorageFeatureKeys<UserStorageFeatures>,
  ];

  if (!(feature in USER_STORAGE_SCHEMA)) {
    throw new Error(`user-storage - invalid feature provided: ${feature}`);
  }

  const validFeature = USER_STORAGE_SCHEMA[feature] as readonly string[];

  if (!validFeature.includes(key)) {
    const validKeys = USER_STORAGE_SCHEMA[feature].join(', ');

    throw new Error(
      `user-storage - invalid key provided for this feature: ${key}. Valid keys: ${validKeys}`,
    );
  }

  return { feature, key };
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
  path: UserStoragePath,
  storageKey: string,
): string {
  const { feature, key } = getFeatureAndKeyFromPath(path);
  const hashedKey = createSHA256Hash(key + storageKey);

  return `/${feature}/${hashedKey}`;
}
